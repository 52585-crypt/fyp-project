const express = require("express");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { Vehicle } = require("../models/Vehicle");

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
      { $group: { _id: null, total: { $sum: "$estimate.total" } } }
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

module.exports = router;
