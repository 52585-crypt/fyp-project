const express = require("express");
const mongoose = require("mongoose");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { Vehicle } = require("../models/Vehicle");
const { ProviderWallet } = require("../models/ProviderWallet");
const { WalletTransaction } = require("../models/WalletTransaction");
const { getMonetizationSettings, updateMonetizationSettings } = require("../services/monetization.service");
const { reviewTopup } = require("../services/wallet.service");

const router = express.Router();
const PROVIDER_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function providerToAdminJSON(provider) {
  return {
    id: provider._id.toString(),
    name: provider.name,
    phone: provider.phone,
    role: provider.role,
    verificationStatus: provider.verificationStatus,
    isCertified: provider.isCertified,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    completedJobs: provider.completedJobs,
    complaintsCount: provider.complaintsCount,
    mechanicProfile: provider.mechanicProfile,
    providerState: provider.providerState
      ? {
          isOnline: Boolean(provider.providerState.isOnline),
          currentLocation: provider.providerState.currentLocation,
          activeRequestId: provider.providerState.activeRequestId ? provider.providerState.activeRequestId.toString() : null,
          lastSeenAt: provider.providerState.lastSeenAt
        }
      : null,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

function emptyRequestCategoryBreakdown() {
  return {
    car_towing: 0,
    fuel_delivery: 0,
    mechanic: 0
  };
}

function emptyRequestStatusBreakdown() {
  return {
    searching_provider: 0,
    provider_assigned: 0,
    provider_on_way: 0,
    provider_arrived: 0,
    inspection_started: 0,
    work_started: 0,
    service_finished: 0,
    completed: 0,
    cancelled: 0
  };
}

function formatCountBreakdown(rows, defaults = {}) {
  return rows.reduce(
    (acc, row) => ({
      ...acc,
      [row._id || "unknown"]: row.count
    }),
    { ...defaults }
  );
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const today = startOfToday();

    const [
      users,
      providers,
      vehicles,
      activeRequests,
      completedRequests,
      cancelledRequests,
      pendingProviders,
      todayRequests,
      requests,
      pendingProviderList,
      categoryBreakdownRows,
      statusBreakdownRows,
      onlineProviders
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "mechanic" }),
      Vehicle.countDocuments({}),
      ServiceRequest.countDocuments({ status: { $nin: ["completed", "cancelled"] } }),
      ServiceRequest.countDocuments({ status: "completed" }),
      ServiceRequest.countDocuments({ status: "cancelled" }),
      User.countDocuments({ role: "mechanic", verificationStatus: "pending" }),
      ServiceRequest.countDocuments({ createdAt: { $gte: today } }),
      ServiceRequest.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .populate({ path: "userId", select: "name phone role" })
        .populate({ path: "providerId", select: "name phone role" }),
      User.find({ role: "mechanic", verificationStatus: "pending" })
        .sort({ createdAt: -1 })
        .limit(5),
      ServiceRequest.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      ServiceRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      User.countDocuments({ role: "mechanic", "providerState.isOnline": true })
    ]);

    const totalRevenueResult = await ServiceRequest.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$estimate.total" },
          platformRevenue: { $sum: { $ifNull: ["$settlement.platformRevenue", 0] } }
        }
      }
    ]);
    const todayPlatformRevenueResult = await ServiceRequest.aggregate([
      { $match: { status: "completed", "settlement.settledAt": { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$settlement.platformRevenue" } } }
    ]);
    const [pendingTopups, blockedProviders, duesResult] = await Promise.all([
      WalletTransaction.countDocuments({ type: "topup_credit", status: "pending" }),
      ProviderWallet.countDocuments({ isBlocked: true }),
      ProviderWallet.aggregate([
        { $match: { balance: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: "$balance" } } } }
      ])
    ]);
    const ratingSummaryResult = await ServiceRequest.aggregate([
      { $match: { "review.rating": { $gte: 1, $lte: 5 } } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$review.rating" },
          reviewedRequests: { $sum: 1 }
        }
      }
    ]);
    const ratingSummary = ratingSummaryResult[0] || {};

    res.json({
      ok: true,
      stats: {
        users,
        providers,
        vehicles,
        activeRequests,
        completedRequests,
        cancelledRequests,
        pendingProviders,
        todayRequests,
        complaints: 0,
        onlineProviders,
        revenue: totalRevenueResult[0]?.total || 0,
        platformRevenue: totalRevenueResult[0]?.platformRevenue || 0,
        todayPlatformRevenue: todayPlatformRevenueResult[0]?.total || 0,
        outstandingDues: duesResult[0]?.total || 0,
        pendingTopups,
        blockedProviders,
        reviewedRequests: ratingSummary.reviewedRequests || 0,
        averageRating: ratingSummary.averageRating ? Math.round(ratingSummary.averageRating * 10) / 10 : 0
      },
      breakdowns: {
        byCategory: formatCountBreakdown(categoryBreakdownRows, emptyRequestCategoryBreakdown()),
        byStatus: formatCountBreakdown(statusBreakdownRows, emptyRequestStatusBreakdown())
      },
      pendingProvidersList: pendingProviderList.map(providerToAdminJSON),
      recentRequests: requests.map((request) => ({
        ...request.toJSONSafe(),
        user: request.userId
          ? {
              id: request.userId._id.toString(),
              name: request.userId.name,
              phone: request.userId.phone
            }
          : null,
        provider: request.providerId
          ? {
              id: request.providerId._id.toString(),
              name: request.providerId.name,
              phone: request.providerId.phone
            }
          : null
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/providers", async (req, res, next) => {
  try {
    const status = String(req.query.status || "pending").trim();
    const query = { role: "mechanic" };

    if (status !== "all") {
      if (!PROVIDER_VERIFICATION_STATUSES.includes(status)) throw badRequest("Invalid provider status");
      query.verificationStatus = status;
    }

    const providers = await User.find(query).sort({ createdAt: -1 }).limit(100);
    res.json({ ok: true, providers: providers.map(providerToAdminJSON) });
  } catch (err) {
    next(err);
  }
});

router.patch("/providers/:id/verification", async (req, res, next) => {
  try {
    const status = String(req.body?.status || "").trim();
    if (!["pending", "verified", "rejected"].includes(status)) {
      throw badRequest("status must be pending, verified, or rejected");
    }

    const provider = await User.findOneAndUpdate(
      { _id: req.params.id, role: "mechanic" },
      {
        $set: {
          verificationStatus: status,
          isCertified: status === "verified"
        }
      },
      { new: true }
    );

    if (!provider) {
      const err = new Error("Provider not found");
      err.statusCode = 404;
      throw err;
    }

    res.json({ ok: true, provider: providerToAdminJSON(provider) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Monetization: revenue, provider wallets, dues payments and settings
// ---------------------------------------------------------------------------

function daysAgo(days) {
  const start = startOfToday();
  start.setDate(start.getDate() - days);
  return start;
}

function emptyMoneyTotals() {
  return { jobs: 0, gross: 0, commission: 0, platformFee: 0, platformRevenue: 0, providerEarning: 0 };
}

async function revenueTotals(match) {
  const [row] = await ServiceRequest.aggregate([
    { $match: { status: "completed", "settlement.settledAt": { $ne: null }, ...match } },
    {
      $group: {
        _id: null,
        jobs: { $sum: 1 },
        gross: { $sum: "$estimate.total" },
        commission: { $sum: "$settlement.commission" },
        platformFee: { $sum: "$settlement.platformFee" },
        platformRevenue: { $sum: "$settlement.platformRevenue" },
        providerEarning: { $sum: "$settlement.providerEarning" }
      }
    }
  ]);
  if (!row) return emptyMoneyTotals();
  const { _id, ...totals } = row;
  return totals;
}

router.get("/revenue", async (req, res, next) => {
  try {
    const [today, week, month, allTime, byCategoryRows, dailyRows, recentCommissions] = await Promise.all([
      revenueTotals({ "settlement.settledAt": { $gte: startOfToday() } }),
      revenueTotals({ "settlement.settledAt": { $gte: daysAgo(6) } }),
      revenueTotals({ "settlement.settledAt": { $gte: daysAgo(29) } }),
      revenueTotals({}),
      ServiceRequest.aggregate([
        { $match: { status: "completed", "settlement.settledAt": { $ne: null } } },
        {
          $group: {
            _id: "$category",
            jobs: { $sum: 1 },
            gross: { $sum: "$estimate.total" },
            commission: { $sum: "$settlement.commission" },
            platformFee: { $sum: "$settlement.platformFee" },
            platformRevenue: { $sum: "$settlement.platformRevenue" },
            providerEarning: { $sum: "$settlement.providerEarning" }
          }
        }
      ]),
      ServiceRequest.aggregate([
        { $match: { status: "completed", "settlement.settledAt": { $gte: daysAgo(13) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$settlement.settledAt" } },
            jobs: { $sum: 1 },
            platformRevenue: { $sum: "$settlement.platformRevenue" }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      WalletTransaction.find({ type: "commission_debit" })
        .sort({ createdAt: -1 })
        .limit(15)
        .populate({ path: "providerId", select: "name phone" })
    ]);

    const byCategory = ["car_towing", "fuel_delivery", "mechanic"].reduce((acc, category) => {
      const row = byCategoryRows.find((item) => item._id === category);
      if (!row) {
        acc[category] = emptyMoneyTotals();
      } else {
        const { _id, ...totals } = row;
        acc[category] = totals;
      }
      return acc;
    }, {});

    res.json({
      ok: true,
      currency: "PKR",
      totals: { today, week, month, allTime },
      byCategory,
      daily: dailyRows.map((row) => ({ date: row._id, jobs: row.jobs, platformRevenue: row.platformRevenue })),
      recentCommissions: recentCommissions.map((t) => t.toJSONSafe())
    });
  } catch (err) {
    next(err);
  }
});

router.get("/wallets", async (req, res, next) => {
  try {
    const filter = String(req.query.filter || "all");
    const query = {};
    if (filter === "blocked") query.isBlocked = true;
    if (filter === "dues") query.balance = { $lt: 0 };

    const [wallets, settings] = await Promise.all([
      ProviderWallet.find(query)
        .sort({ balance: 1 })
        .limit(200)
        .populate({ path: "providerId", select: "name phone mechanicProfile.serviceCategory verificationStatus" }),
      getMonetizationSettings()
    ]);

    res.json({
      ok: true,
      debtLimit: settings.providerDebtLimit,
      wallets: wallets.map((wallet) => ({
        ...wallet.toJSONSafe(settings.providerDebtLimit),
        provider: wallet.providerId?._id
          ? {
              id: wallet.providerId._id.toString(),
              name: wallet.providerId.name,
              phone: wallet.providerId.phone,
              serviceCategory: wallet.providerId.mechanicProfile?.serviceCategory || null,
              verificationStatus: wallet.providerId.verificationStatus
            }
          : null
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/topups", async (req, res, next) => {
  try {
    const status = String(req.query.status || "pending");
    const query = { type: "topup_credit" };
    if (status !== "all") {
      if (!["pending", "approved", "rejected"].includes(status)) throw badRequest("Invalid status");
      query.status = status;
    }

    const topups = await WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate({ path: "providerId", select: "name phone" });

    res.json({ ok: true, topups: topups.map((t) => t.toJSONSafe({ includeProof: true })) });
  } catch (err) {
    next(err);
  }
});

router.patch("/topups/:id", async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || "").trim();
    if (!["approve", "reject"].includes(decision)) throw badRequest("decision must be approve or reject");
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest("Invalid payment id");

    const transaction = await reviewTopup(req.params.id, {
      approve: decision === "approve",
      reviewNote: String(req.body?.reviewNote || "").trim().slice(0, 300) || null
    });

    res.json({ ok: true, topup: transaction.toJSONSafe() });
  } catch (err) {
    next(err);
  }
});

router.get("/settings/monetization", async (req, res, next) => {
  try {
    res.json({ ok: true, settings: await getMonetizationSettings() });
  } catch (err) {
    next(err);
  }
});

router.patch("/settings/monetization", async (req, res, next) => {
  try {
    const settings = await updateMonetizationSettings(req.body || {});
    res.json({ ok: true, settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
