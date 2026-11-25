const express = require("express");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { roleFilter } = require("../utils/accountRoles");
const { Vehicle } = require("../models/Vehicle");
const { Payment, recordedCashFilter } = require("../models/Payment");
const { DispatchOffer } = require("../models/DispatchOffer");
const { matchingExplanation } = require("../services/matchingExplanation");
const { requireAdmin } = require("../middleware/auth.middleware");
const adminRequests = require("./adminRequests.routes");
const adminCustomers = require("./adminCustomers.routes");
const adminProviders = require("./adminProviders.routes");
const adminFinance = require("./adminFinance.routes");
const adminActivity = require("./adminActivity.routes");
const { objectId } = require("../services/adminHistory");
const { heatmapOptions, requestHeatmap } = require("../services/requestHeatmap");

const router = express.Router();
const PROVIDER_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(...requireAdmin);
router.use("/requests", adminRequests);
router.use("/customers", adminCustomers);
router.use("/provider-directory", adminProviders);
router.use("/finance", adminFinance);
router.use("/activity", adminActivity);

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// Provider list rows carry no image data (up to 100 rows); a single provider (?id=) includes the stored photos.
const PROVIDER_LIST_FIELDS = "name phone verificationStatus isCertified ratingAvg ratingCount completedJobs complaintsCount createdAt updatedAt mechanicProfile.serviceCategory mechanicProfile.liveLocation.addressText mechanicVerification.faceChecks.status";
const PROVIDER_IMAGE_FIELDS = "mechanicProfile.workshopPhotoUrl mechanicProfile.certificateUrl mechanicProfile.drivingLicenseUrl";

function providerToAdminJSON(provider, { includeImages = false } = {}) {
  const profile = provider.mechanicProfile;
  return {
    id: provider._id.toString(),
    name: provider.name,
    phone: provider.phone,
    role: "mechanic",
    verificationStatus: provider.verificationStatus,
    isCertified: provider.isCertified,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    completedJobs: provider.completedJobs,
    complaintsCount: provider.complaintsCount,
    mechanicProfile: profile ? {
      serviceCategory: profile.serviceCategory,
      ...(includeImages ? {
        workshopPhotoUrl: profile.workshopPhotoUrl,
        certificateUrl: profile.certificateUrl,
        drivingLicenseUrl: profile.drivingLicenseUrl
      } : {}),
      liveLocation: profile.liveLocation?.addressText ? { addressText: profile.liveLocation.addressText } : null
    } : null,
    // passed | flagged (possible duplicate account) | error | null (no verification submitted yet)
    faceCheckStatus: provider.mechanicVerification?.faceChecks?.status ?? null,
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

router.get("/payments", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw badRequest("Invalid payment page.");
    const pageSize = 25;
    const rows = await Payment.find().sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize).limit(pageSize + 1)
      .populate("userId providerId", "name");
    res.json({
      ok: true,
      hasNext: rows.length > pageSize,
      payments: rows.slice(0, pageSize).map((payment) => ({
        ...payment.toJSONSafe(),
        customer: payment.userId?.name ?? null,
        provider: payment.providerId?.name ?? null
      }))
    });
  } catch (error) { next(error); }
});

// Twin-cities heatmap: request counts and online-provider counts per ~1 km cell (never raw customer coordinates).
// ?days=1..365 (default 30) limits requests by creation time; ?category= one of the request categories.
router.get("/heatmap", async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await requestHeatmap(heatmapOptions(req.query))) });
  } catch (err) {
    next(err);
  }
});

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
      onlineProviders,
      unverifiedCashPayments
    ] = await Promise.all([
      User.countDocuments(roleFilter("user")),
      User.countDocuments(roleFilter("mechanic")),
      Vehicle.countDocuments({}),
      ServiceRequest.countDocuments({ status: { $nin: ["completed", "cancelled"] } }),
      ServiceRequest.countDocuments({ status: "completed" }),
      ServiceRequest.countDocuments({ status: "cancelled" }),
      User.countDocuments({ ...roleFilter("mechanic"), verificationStatus: "pending" }),
      ServiceRequest.countDocuments({ createdAt: { $gte: today } }),
      ServiceRequest.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .populate({ path: "userId", select: "name phone role" })
        .populate({ path: "providerId", select: "name phone role" }),
      User.find({ ...roleFilter("mechanic"), verificationStatus: "pending" })
        .sort({ createdAt: -1 })
        .select("name phone createdAt mechanicProfile.serviceCategory")
        .limit(5),
      ServiceRequest.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      ServiceRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      User.countDocuments({ ...roleFilter("mechanic"), "providerState.isOnline": true }),
      Payment.countDocuments({ method: "cash", status: "paid", $nor: [recordedCashFilter] })
    ]);

    const totalRevenueResult = await Payment.aggregate([
      { $match: recordedCashFilter },
      { $lookup: { from: "invoices", localField: "invoiceId", foreignField: "_id", as: "invoice" } },
      { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, grossMinor: { $sum: "$amountMinor" }, serviceFeeMinor: { $sum: "$invoice.serviceFeeMinor" }, providerEarningsMinor: { $sum: { $ifNull: ["$providerNetMinor", "$invoice.providerEarningsMinor"] } } } }
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
        unverifiedCashPayments,
        reviewedRequests: ratingSummary.reviewedRequests || 0,
        averageRating: ratingSummary.averageRating ? Math.round(ratingSummary.averageRating * 10) / 10 : 0
      },
      breakdowns: {
        byCategory: formatCountBreakdown(categoryBreakdownRows, emptyRequestCategoryBreakdown()),
        byStatus: formatCountBreakdown(statusBreakdownRows, emptyRequestStatusBreakdown())
      },
      pendingProvidersList: pendingProviderList.map(provider => ({
        id: provider.id, name: provider.name, phone: provider.phone, createdAt: provider.createdAt,
        mechanicProfile: { serviceCategory: provider.mechanicProfile?.serviceCategory ?? null }
      })),
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
  res.set("Cache-Control", "no-store");
  try {
    const status = String(req.query.status || "pending").trim();
    const query = roleFilter("mechanic");
    if (req.query.id !== undefined) {
      query._id = objectId(req.query.id);
      if (!query._id) throw badRequest("Invalid provider ID");
    }

    if (status !== "all") {
      if (!PROVIDER_VERIFICATION_STATUSES.includes(status)) throw badRequest("Invalid provider status");
      query.verificationStatus = status;
    }

    const includeImages = Boolean(query._id);
    const fields = includeImages ? `${PROVIDER_LIST_FIELDS} ${PROVIDER_IMAGE_FIELDS}` : PROVIDER_LIST_FIELDS;
    const providers = await User.find(query, fields).sort({ createdAt: -1 }).limit(100);
    res.json({ ok: true, providers: providers.map((provider) => providerToAdminJSON(provider, { includeImages })) });
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
          explanation: matchingExplanation(offer)
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

module.exports = router;
