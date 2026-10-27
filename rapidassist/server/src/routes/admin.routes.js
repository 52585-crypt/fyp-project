const express = require("express");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { Vehicle } = require("../models/Vehicle");
const { Payment } = require("../models/Payment");
const { DispatchOffer } = require("../models/DispatchOffer");
const { requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();
const PROVIDER_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];

router.use(...requireAdmin);

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

    const totalRevenueResult = await Payment.aggregate([
      { $match: { status: "paid" } },
      { $lookup: { from: "invoices", localField: "invoiceId", foreignField: "_id", as: "invoice" } },
      { $unwind: "$invoice" },
      { $group: { _id: null, grossMinor: { $sum: "$amountMinor" }, serviceFeeMinor: { $sum: "$invoice.serviceFeeMinor" }, providerEarningsMinor: { $sum: "$invoice.providerEarningsMinor" } } }
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
        revenue: (totalRevenueResult[0]?.grossMinor || 0) / 100,
        serviceFeeRevenue: (totalRevenueResult[0]?.serviceFeeMinor || 0) / 100,
        providerEarnings: (totalRevenueResult[0]?.providerEarningsMinor || 0) / 100,
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

router.get("/active-jobs", async (req, res, next) => {
  try {
    const requests = await ServiceRequest.find({ status: { $nin: ["completed", "cancelled"] } })
      .sort({ updatedAt: -1 })
      .limit(200)
      .populate({ path: "userId", select: "name phone" })
      .populate({ path: "providerId", select: "name phone ratingAvg providerState" });
    const offers = await DispatchOffer.find({ requestId: { $in: requests.map((request) => request._id) } }).sort({ offeredAt: -1 });
    const [matchingSummary] = await DispatchOffer.aggregate([
      { $group: {
        _id: "$algorithmVersion",
        offers: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ["$outcome", "accepted"] }, 1, 0] } },
        latestOfferAt: { $max: "$offeredAt" },
        averageSelectedDistanceKm: { $avg: "$distanceKm" },
        averageNearestBaselineKm: { $avg: "$baselineNearestDistanceKm" },
        averageTravelDurationSeconds: { $avg: "$travelDurationSeconds" },
        averageAcceptedResponseSeconds: { $avg: { $cond: [{ $eq: ["$outcome", "accepted"] }, "$responseSeconds", null] } }
      } },
      { $sort: { latestOfferAt: -1 } }
    ]);
    const latestOffer = new Map();
    offers.forEach((offer) => { if (!latestOffer.has(String(offer.requestId))) latestOffer.set(String(offer.requestId), offer); });

    const jobs = requests.map((request) => {
      const offer = latestOffer.get(request.id);
      const provider = request.providerId?._id ? request.providerId : null;
      const customer = request.userId?._id ? request.userId : null;
      return {
        ...request.toJSONSafe(),
        userId: customer?.id || null,
        providerId: provider?.id || null,
        customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
        provider: provider ? {
          id: provider.id, name: provider.name, phone: provider.phone, ratingAvg: provider.ratingAvg,
          location: provider.providerState?.currentLocation || null
        } : null,
        matchingDecision: offer ? {
          algorithmVersion: offer.algorithmVersion,
          score: Math.round(offer.score * 10) / 10,
          priority: offer.priority,
          distanceKm: Math.round(offer.distanceKm * 10) / 10,
          routeDistanceKm: offer.routeDistanceKm == null ? null : Math.round(offer.routeDistanceKm * 10) / 10,
          travelDurationMinutes: offer.travelDurationSeconds == null ? null : Math.max(1, Math.round(offer.travelDurationSeconds / 60)),
          routeSource: offer.routeSource,
          assignmentCost: offer.assignmentCost,
          baselineNearestDistanceKm: Math.round((offer.baselineNearestDistanceKm ?? offer.distanceKm) * 10) / 10,
          components: offer.components,
          outcome: offer.outcome,
          responseSeconds: offer.responseSeconds,
          explanation: offer.algorithmVersion === "batch-mincost-v1"
            ? `Selected by the batch optimizer using ${offer.priority} priority and ${Math.max(1, Math.round((offer.travelDurationSeconds || 0) / 60))}-minute travel time (${offer.routeSource}).`
            : `Selected using proximity ${Math.round(offer.components.proximity * 100)}%, adjusted rating ${Math.round(offer.components.rating * 100)}%, experience ${Math.round(offer.components.experience * 100)}%, and response speed ${Math.round(offer.components.responseSpeed * 100)}%.`
        } : null
      };
    });
    res.json({
      ok: true,
      serverTime: new Date(),
      matchingAnalytics: matchingSummary ? {
        algorithmVersion: matchingSummary._id,
        offers: matchingSummary.offers,
        accepted: matchingSummary.accepted,
        acceptanceRate: matchingSummary.offers ? Math.round(matchingSummary.accepted / matchingSummary.offers * 1000) / 10 : 0,
        averageSelectedDistanceKm: Math.round((matchingSummary.averageSelectedDistanceKm || 0) * 10) / 10,
        averageNearestBaselineKm: Math.round((matchingSummary.averageNearestBaselineKm || 0) * 10) / 10,
        averageTravelDurationMinutes: Math.round((matchingSummary.averageTravelDurationSeconds || 0) / 6) / 10,
        averageAcceptedResponseSeconds: Math.round((matchingSummary.averageAcceptedResponseSeconds || 0) * 10) / 10
      } : null,
      jobs
    });
  } catch (err) { next(err); }
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
