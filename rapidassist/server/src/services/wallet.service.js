const mongoose = require("mongoose");
const { ProviderWallet } = require("../models/ProviderWallet");
const { WalletTransaction } = require("../models/WalletTransaction");
const { ServiceRequest } = require("../models/ServiceRequest");
const { getMonetizationSettings, refreshRequestMoney } = require("./monetization.service");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id.toString());
}

async function getOrCreateWallet(providerId) {
  return ProviderWallet.findOneAndUpdate(
    { providerId },
    { $setOnInsert: { providerId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

// Block providers whose dues are above the limit, unblock once they pay.
async function refreshBlockStatus(wallet, debtLimit) {
  const limit = debtLimit ?? (await getMonetizationSettings()).providerDebtLimit;
  const shouldBlock = wallet.balance < -limit;
  if (shouldBlock === wallet.isBlocked) return wallet;

  return ProviderWallet.findByIdAndUpdate(
    wallet._id,
    { $set: { isBlocked: shouldBlock, blockedAt: shouldBlock ? new Date() : null } },
    { new: true }
  );
}

/**
 * Charge the platform's share of a completed cash request to the provider's
 * wallet. Safe to call more than once: the unique (requestId, type) index on
 * WalletTransaction makes sure a request is charged only once.
 */
async function settleCompletedRequest(request) {
  if (!request?.providerId || request.status !== "completed") return null;
  if (!request.settlement) return null; // legacy request created before monetization
  if (request.settlement.settledAt) return null;

  refreshRequestMoney(request);
  const { platformRevenue, commission, platformFee, providerEarning } = request.settlement;

  let transaction;
  try {
    transaction = await WalletTransaction.create({
      providerId: request.providerId,
      requestId: request._id,
      type: "commission_debit",
      amount: -platformRevenue,
      status: "approved",
      breakdown: {
        category: request.category,
        requestTotal: request.estimate.total,
        commission,
        platformFee,
        providerEarning
      },
      note: "Platform share of cash payment"
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // Already charged earlier; just make sure the request is marked settled.
    transaction = await WalletTransaction.findOne({ requestId: request._id, type: "commission_debit" });
  }

  // Claim the transaction atomically so two concurrent completions cannot
  // both apply the same debit to the wallet.
  const claimed = await WalletTransaction.findOneAndUpdate(
    { _id: transaction._id, appliedToWallet: { $ne: true } },
    { $set: { appliedToWallet: true } },
    { new: true }
  );

  if (claimed) {
    transaction = claimed;
    await getOrCreateWallet(request.providerId);
    const wallet = await ProviderWallet.findOneAndUpdate(
      { providerId: request.providerId },
      {
        $inc: {
          balance: -platformRevenue,
          totalEarned: providerEarning,
          totalPlatformRevenue: platformRevenue,
          settledJobs: 1
        }
      },
      { new: true }
    );
    transaction.balanceAfter = wallet.balance;
    await transaction.save();
    await refreshBlockStatus(wallet);
  }

  request.settlement.settledAt = new Date();
  request.settlement.walletTransactionId = transaction._id;
  await request.save();
  return transaction;
}

// Settle any completed requests that were missed (e.g. a crash mid-completion).
async function settlePendingRequests(providerId) {
  const pending = await ServiceRequest.find({
    providerId,
    status: "completed",
    settlement: { $ne: null },
    "settlement.settledAt": null
  }).limit(50);

  for (const request of pending) {
    await settleCompletedRequest(request);
  }
}

async function getProviderBlockState(providerId) {
  const [wallet, settings] = await Promise.all([
    ProviderWallet.findOne({ providerId }),
    getMonetizationSettings()
  ]);
  const balance = wallet?.balance || 0;
  return {
    blocked: Boolean(wallet?.isBlocked),
    dues: balance < 0 ? Math.abs(balance) : 0,
    debtLimit: settings.providerDebtLimit
  };
}

async function assertProviderCanTakeJobs(providerId) {
  const state = await getProviderBlockState(providerId);
  if (state.blocked) {
    throw httpError(
      403,
      `Your pending dues are PKR ${state.dues.toLocaleString()}. Please pay your dues from the Earnings screen to accept new requests.`
    );
  }
}

async function getBlockedProviderIds() {
  return ProviderWallet.find({ isBlocked: true }).distinct("providerId");
}

async function getWalletSummary(providerId) {
  await settlePendingRequests(providerId);
  const [wallet, settings, pendingTopups] = await Promise.all([
    getOrCreateWallet(providerId),
    getMonetizationSettings(),
    WalletTransaction.aggregate([
      { $match: { providerId: toObjectId(providerId), type: "topup_credit", status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
    ])
  ]);

  return {
    ...wallet.toJSONSafe(settings.providerDebtLimit),
    pendingTopupAmount: pendingTopups[0]?.total || 0,
    pendingTopupCount: pendingTopups[0]?.count || 0,
    minTopupAmount: settings.minTopupAmount
  };
}

async function createTopupRequest(providerId, { amount, method, reference, proofImage, note }) {
  const settings = await getMonetizationSettings();
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value < settings.minTopupAmount) {
    throw httpError(400, `Amount must be at least PKR ${settings.minTopupAmount}`);
  }
  if (value > 500000) throw httpError(400, "Amount is too large");

  const pendingCount = await WalletTransaction.countDocuments({ providerId, type: "topup_credit", status: "pending" });
  if (pendingCount >= 3) throw httpError(409, "You already have pending payments waiting for admin approval");

  return WalletTransaction.create({
    providerId,
    type: "topup_credit",
    amount: value,
    status: "pending",
    method,
    reference,
    proofImage,
    note
  });
}

async function reviewTopup(transactionId, { approve, reviewNote }) {
  // Only a pending top-up can be reviewed; the status condition prevents double credit.
  const transaction = await WalletTransaction.findOneAndUpdate(
    { _id: transactionId, type: "topup_credit", status: "pending" },
    { $set: { status: approve ? "approved" : "rejected", reviewNote: reviewNote || null, reviewedAt: new Date() } },
    { new: true }
  );
  if (!transaction) throw httpError(404, "Pending payment not found");

  if (approve) {
    await getOrCreateWallet(transaction.providerId);
    const wallet = await ProviderWallet.findOneAndUpdate(
      { providerId: transaction.providerId },
      { $inc: { balance: transaction.amount, totalPaid: transaction.amount } },
      { new: true }
    );
    transaction.balanceAfter = wallet.balance;
    await transaction.save();
    await refreshBlockStatus(wallet);
  }

  return transaction.populate({ path: "providerId", select: "name phone" });
}

module.exports = {
  getOrCreateWallet,
  refreshBlockStatus,
  settleCompletedRequest,
  settlePendingRequests,
  getProviderBlockState,
  assertProviderCanTakeJobs,
  getBlockedProviderIds,
  getWalletSummary,
  createTopupRequest,
  reviewTopup
};
