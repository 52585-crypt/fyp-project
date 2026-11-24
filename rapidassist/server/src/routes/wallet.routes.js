const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { WalletTransaction, TOPUP_METHODS } = require("../models/WalletTransaction");
const { createTopupRequest, getWalletSummary } = require("../services/wallet.service");

const router = express.Router();
const PROOF_IMAGE_MAX_CHARS = Number(process.env.MECHANIC_IMAGE_MAX_CHARS) || 2500000;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function requireProvider(req, res, next) {
  if (req.user?.role !== "mechanic") return next(httpError(403, "Provider account required"));
  return next();
}

function normalizeStr(v) {
  return v == null ? "" : String(v).trim();
}

router.use(requireAuth, requireProvider);

// Wallet balance, dues and block status
router.get("/me", async (req, res, next) => {
  try {
    const [wallet, transactions] = await Promise.all([
      getWalletSummary(req.user._id),
      WalletTransaction.find({ providerId: req.user._id }).sort({ createdAt: -1 }).limit(20)
    ]);
    res.json({ ok: true, wallet, transactions: transactions.map((t) => t.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
});

router.get("/transactions", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const transactions = await WalletTransaction.find({ providerId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ ok: true, page, transactions: transactions.map((t) => t.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
});

// Provider reports that they paid their dues (JazzCash / Easypaisa / bank).
// Admin verifies the reference and approves it from the admin panel.
router.post("/topup", async (req, res, next) => {
  try {
    const method = normalizeStr(req.body?.method).toLowerCase();
    if (!TOPUP_METHODS.includes(method)) throw httpError(400, `method must be one of: ${TOPUP_METHODS.join(", ")}`);

    const reference = normalizeStr(req.body?.reference);
    if (method !== "cash" && reference.length < 4) throw httpError(400, "Transaction ID / reference is required");

    const proofImage = normalizeStr(req.body?.proofImage) || null;
    if (proofImage && !proofImage.startsWith("data:image/")) throw httpError(400, "Payment screenshot must be image data");
    if (proofImage && proofImage.length > PROOF_IMAGE_MAX_CHARS) throw httpError(400, "Payment screenshot is too large");

    const transaction = await createTopupRequest(req.user._id, {
      amount: req.body?.amount,
      method,
      reference: reference || null,
      proofImage,
      note: normalizeStr(req.body?.note).slice(0, 300) || null
    });

    res.status(201).json({
      ok: true,
      transaction: transaction.toJSONSafe(),
      wallet: await getWalletSummary(req.user._id)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
