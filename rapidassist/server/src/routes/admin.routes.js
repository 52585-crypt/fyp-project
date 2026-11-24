const express = require("express");
const mongoose = require("mongoose");
const { ServiceRequest, REQUEST_CATEGORIES, REQUEST_STATUSES } = require("../models/ServiceRequest");
const { User, VERIFICATION_STATUSES } = require("../models/User");
const { Vehicle } = require("../models/Vehicle");
const { requireAuth, requireAdmin } = require("../middleware/auth.middleware");
const { signAccessToken } = require("../utils/jwt");
const { clearAccessTokenCookie, setAccessTokenCookie } = require("../utils/authCookie");
const { adminLoginLimiter, loginKey } = require("../middleware/rateLimit");
const { Complaint, COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, COMPLAINT_PRIORITIES } = require("../models/Complaint");

const router = express.Router();

const CLOSED_STATUSES = ["completed", "cancelled"];
const MAX_PAGE_SIZE = 50;
const TREND_DAYS = 7;

// Image fields are large base64 blobs; keep them out of list responses.
const PROVIDER_LIST_PROJECTION = {
  "mechanicProfile.selfieUrl": 0,
  "mechanicProfile.idCardFrontUrl": 0,
  "mechanicProfile.idCardBackUrl": 0,
  "mechanicProfile.workshopPhotoUrl": 0,
  "mechanicProfile.certificateUrl": 0,
  "mechanicProfile.drivingLicenseUrl": 0,
  certificateUrl: 0
};

/* ------------------------------------------------------------------ helpers */

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const badRequest = (message) => httpError(400, message);
const notFound = (message) => httpError(404, message);

function normalizeStr(v) {
  return v == null ? "" : String(v).trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function paginationMeta(page, limit, total) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

function assertObjectId(id, label = "id") {
  if (!mongoose.isValidObjectId(id)) throw badRequest(`Invalid ${label}`);
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function personSummary(doc) {
  if (!doc || !doc._id) return null;
  return { id: doc._id.toString(), name: doc.name, phone: doc.phone, role: doc.role };
}

function adminSummary(user) {
  return { id: user._id.toString(), name: user.name, phone: user.phone, role: user.role };
}

function providerToAdminJSON(provider, { includeDocuments = false } = {}) {
  const profile = provider.mechanicProfile || null;
  const review = provider.verificationReview || {};

  return {
    id: provider._id.toString(),
    name: provider.name,
    phone: provider.phone,
    role: provider.role,
    isBlocked: Boolean(provider.isBlocked),
    verificationStatus: provider.verificationStatus,
    verificationReview: {
      note: review.note || null,
      reviewedBy: review.reviewedBy && review.reviewedBy._id ? personSummary(review.reviewedBy) : null,
      reviewedAt: review.reviewedAt || null
    },
    isCertified: provider.isCertified,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    completedJobs: provider.completedJobs,
    complaintsCount: provider.complaintsCount,
    mechanicProfile: profile
      ? {
          serviceCategory: profile.serviceCategory,
          liveLocation: profile.liveLocation,
          identityMatch: profile.identityMatch,
          ...(includeDocuments
            ? {
                selfieUrl: profile.selfieUrl,
                idCardFrontUrl: profile.idCardFrontUrl,
                idCardBackUrl: profile.idCardBackUrl,
                workshopPhotoUrl: profile.workshopPhotoUrl,
                certificateUrl: profile.certificateUrl || provider.certificateUrl,
                drivingLicenseUrl: profile.drivingLicenseUrl
              }
            : {})
        }
      : null,
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

function userToAdminJSON(user, extra = {}) {
  return {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    role: user.role,
    isBlocked: Boolean(user.isBlocked),
    blockedReason: user.blockedReason || null,
    blockedAt: user.blockedAt || null,
    verificationStatus: user.verificationStatus,
    serviceCategory: user.mechanicProfile?.serviceCategory || null,
    ratingAvg: user.ratingAvg,
    completedJobs: user.completedJobs,
    isOnline: Boolean(user.providerState?.isOnline),
    createdAt: user.createdAt,
    ...extra
  };
}

function requestToAdminJSON(request) {
  const json = request.toJSONSafe();
  return {
    ...json,
    // populated refs collapse to ids in toJSONSafe; restore the people summaries.
    userId: request.userId?._id ? request.userId._id.toString() : json.userId,
    providerId: request.providerId?._id ? request.providerId._id.toString() : json.providerId,
    user: personSummary(request.userId),
    provider: personSummary(request.providerId)
  };
}

function formatCountBreakdown(rows, keys) {
  const base = Object.fromEntries(keys.map((key) => [key, 0]));
  return rows.reduce((acc, row) => ({ ...acc, [row._id || "unknown"]: row.count }), base);
}

/* --------------------------------------------------------------- admin auth */

router.post("/auth/login", async (req, res, next) => {
  try {
    const phone = normalizeStr(req.body?.phone);
    const password = String(req.body?.password || "");
    if (!phone || !password) throw badRequest("Phone and password are required");

    const limitKey = loginKey(req, phone);
    adminLoginLimiter.assertAllowed(limitKey, res);

    const user = await User.findOne({ phone, role: "admin" }).select("+passwordHash");
    // Same message for unknown account and wrong password so we don't leak which admins exist.
    if (!user || !(await user.verifyPassword(password))) {
      adminLoginLimiter.recordFailure(limitKey);
      throw httpError(401, "Invalid admin credentials");
    }
    if (user.isBlocked) throw httpError(403, "This admin account is suspended");
    adminLoginLimiter.reset(limitKey);

    const token = signAccessToken({ sub: user._id.toString(), role: user.role });
    setAccessTokenCookie(res, token);
    res.json({ ok: true, admin: adminSummary(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", (req, res) => {
  clearAccessTokenCookie(res);
  res.json({ ok: true });
});

// Everything below requires a logged-in admin.
router.use(requireAuth, requireAdmin);

router.get("/auth/me", (req, res) => {
  res.json({ ok: true, admin: adminSummary(req.user) });
});

/* ---------------------------------------------------------------- dashboard */

router.get("/dashboard", async (req, res, next) => {
  try {
    const today = startOfDay();
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));

    const [
      users,
      providers,
      vehicles,
      activeRequests,
      completedRequests,
      cancelledRequests,
      pendingProviders,
      todayRequests,
      blockedAccounts,
      onlineProviders,
      recentRequests,
      pendingProviderList,
      categoryRows,
      statusRows,
      revenueRows,
      ratingRows,
      trendRows,
      openComplaints,
      urgentComplaints
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "mechanic" }),
      Vehicle.countDocuments({}),
      ServiceRequest.countDocuments({ status: { $nin: CLOSED_STATUSES } }),
      ServiceRequest.countDocuments({ status: "completed" }),
      ServiceRequest.countDocuments({ status: "cancelled" }),
      User.countDocuments({ role: "mechanic", verificationStatus: "pending" }),
      ServiceRequest.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ role: { $ne: "admin" }, isBlocked: true }),
      User.countDocuments({ role: "mechanic", "providerState.isOnline": true }),
      ServiceRequest.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .select("-photos")
        .populate({ path: "userId", select: "name phone role" })
        .populate({ path: "providerId", select: "name phone role" }),
      User.find({ role: "mechanic", verificationStatus: "pending" }, PROVIDER_LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .limit(5),
      ServiceRequest.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      ServiceRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ServiceRequest.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$estimate.total" } } }
      ]),
      ServiceRequest.aggregate([
        { $match: { "review.rating": { $gte: 1, $lte: 5 } } },
        { $group: { _id: null, averageRating: { $avg: "$review.rating" }, reviewedRequests: { $sum: 1 } } }
      ]),
      ServiceRequest.find({ createdAt: { $gte: trendStart } }).select("createdAt status").lean(),
      Complaint.countDocuments({ status: { $in: ["open", "in_review"] } }),
      Complaint.countDocuments({ status: { $in: ["open", "in_review"] }, priority: "high" })
    ]);

    // Bucket in server-local days so "today" matches the todayRequests count above.
    const trendMap = new Map();
    for (let i = 0; i < TREND_DAYS; i += 1) {
      const day = new Date(trendStart);
      day.setDate(day.getDate() + i);
      trendMap.set(dayKey(day), { date: dayKey(day), total: 0, completed: 0, cancelled: 0 });
    }
    for (const row of trendRows) {
      const bucket = trendMap.get(dayKey(new Date(row.createdAt)));
      if (!bucket) continue;
      bucket.total += 1;
      if (row.status === "completed") bucket.completed += 1;
      if (row.status === "cancelled") bucket.cancelled += 1;
    }

    const rating = ratingRows[0] || {};

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
        blockedAccounts,
        onlineProviders,
        openComplaints,
        urgentComplaints,
        revenue: revenueRows[0]?.total || 0,
        reviewedRequests: rating.reviewedRequests || 0,
        averageRating: rating.averageRating ? Math.round(rating.averageRating * 10) / 10 : 0
      },
      breakdowns: {
        byCategory: formatCountBreakdown(categoryRows, REQUEST_CATEGORIES),
        byStatus: formatCountBreakdown(statusRows, [])
      },
      trend: Array.from(trendMap.values()),
      pendingProvidersList: pendingProviderList.map((p) => providerToAdminJSON(p)),
      recentRequests: recentRequests.map(requestToAdminJSON)
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------- providers */

router.get("/providers", async (req, res, next) => {
  try {
    const status = normalizeStr(req.query.status) || "pending";
    const search = normalizeStr(req.query.search);
    const category = normalizeStr(req.query.category);
    const { page, limit, skip } = parsePagination(req.query);

    const query = { role: "mechanic" };
    if (status !== "all") {
      if (!VERIFICATION_STATUSES.includes(status)) throw badRequest("Invalid provider status");
      query.verificationStatus = status;
    }
    if (category) query["mechanicProfile.serviceCategory"] = category;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      query.$or = [{ name: rx }, { phone: rx }];
    }

    const [providers, total, countRows] = await Promise.all([
      User.find(query, PROVIDER_LIST_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
      User.aggregate([{ $match: { role: "mechanic" } }, { $group: { _id: "$verificationStatus", count: { $sum: 1 } } }])
    ]);

    const counts = formatCountBreakdown(countRows, VERIFICATION_STATUSES);
    counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);

    res.json({
      ok: true,
      providers: providers.map((p) => providerToAdminJSON(p)),
      counts,
      pagination: paginationMeta(page, limit, total)
    });
  } catch (err) {
    next(err);
  }
});

router.get("/providers/:id", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "provider id");
    const provider = await User.findOne({ _id: req.params.id, role: "mechanic" }).populate({
      path: "verificationReview.reviewedBy",
      select: "name phone role"
    });
    if (!provider) throw notFound("Provider not found");

    const recentJobs = await ServiceRequest.find({ providerId: provider._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("category status estimate.total createdAt review.rating");

    res.json({
      ok: true,
      provider: providerToAdminJSON(provider, { includeDocuments: true }),
      recentJobs: recentJobs.map((job) => ({
        id: job._id.toString(),
        category: job.category,
        status: job.status,
        total: job.estimate?.total || 0,
        rating: job.review?.rating || null,
        createdAt: job.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/providers/:id/verification", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "provider id");
    const status = normalizeStr(req.body?.status);
    const note = normalizeStr(req.body?.note).slice(0, 500);

    if (!["pending", "verified", "rejected"].includes(status)) {
      throw badRequest("status must be pending, verified, or rejected");
    }
    if (status === "rejected" && note.length < 5) {
      throw badRequest("Please give the provider a reason for rejection (at least 5 characters)");
    }

    const provider = await User.findOneAndUpdate(
      { _id: req.params.id, role: "mechanic" },
      {
        $set: {
          verificationStatus: status,
          isCertified: status === "verified",
          "verificationReview.note": note || null,
          "verificationReview.reviewedBy": req.user._id,
          "verificationReview.reviewedAt": new Date()
        }
      },
      { new: true, projection: PROVIDER_LIST_PROJECTION }
    ).populate({ path: "verificationReview.reviewedBy", select: "name phone role" });

    if (!provider) throw notFound("Provider not found");

    res.json({ ok: true, provider: providerToAdminJSON(provider) });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------- users */

router.get("/users", async (req, res, next) => {
  try {
    const role = normalizeStr(req.query.role) || "all";
    const status = normalizeStr(req.query.status) || "all";
    const search = normalizeStr(req.query.search);
    const { page, limit, skip } = parsePagination(req.query);

    const query = { role: { $in: ["user", "mechanic"] } };
    if (role !== "all") {
      if (!["user", "mechanic"].includes(role)) throw badRequest("Invalid role filter");
      query.role = role;
    }
    if (status === "active") query.isBlocked = { $ne: true };
    if (status === "blocked") query.isBlocked = true;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      query.$or = [{ name: rx }, { phone: rx }];
    }

    const [users, total] = await Promise.all([
      User.find(query, PROVIDER_LIST_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);

    const ids = users.map((u) => u._id);
    const requestCounts = ids.length
      ? await ServiceRequest.aggregate([
          { $match: { $or: [{ userId: { $in: ids } }, { providerId: { $in: ids } }] } },
          { $project: { people: ["$userId", "$providerId"] } },
          { $unwind: "$people" },
          { $match: { people: { $in: ids } } },
          { $group: { _id: "$people", count: { $sum: 1 } } }
        ])
      : [];
    const countById = new Map(requestCounts.map((row) => [row._id.toString(), row.count]));

    res.json({
      ok: true,
      users: users.map((u) => userToAdminJSON(u, { requestCount: countById.get(u._id.toString()) || 0 })),
      pagination: paginationMeta(page, limit, total)
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id/block", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "user id");
    const blocked = Boolean(req.body?.blocked);
    const reason = normalizeStr(req.body?.reason).slice(0, 300);
    if (blocked && reason.length < 3) throw badRequest("Please add a reason for suspending this account");

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: ["user", "mechanic"] } },
      {
        $set: {
          isBlocked: blocked,
          blockedReason: blocked ? reason : null,
          blockedAt: blocked ? new Date() : null,
          // A suspended provider must not keep receiving jobs.
          ...(blocked ? { "providerState.isOnline": false } : {})
        }
      },
      { new: true, projection: PROVIDER_LIST_PROJECTION }
    );
    if (!user) throw notFound("User not found");

    res.json({ ok: true, user: userToAdminJSON(user) });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- requests */

router.get("/requests", async (req, res, next) => {
  try {
    const status = normalizeStr(req.query.status) || "all";
    const category = normalizeStr(req.query.category) || "all";
    const search = normalizeStr(req.query.search);
    const { page, limit, skip } = parsePagination(req.query);

    const query = {};
    if (status === "active") query.status = { $nin: CLOSED_STATUSES };
    else if (status !== "all") {
      if (!REQUEST_STATUSES.includes(status)) throw badRequest("Invalid status filter");
      query.status = status;
    }
    if (category !== "all") {
      if (!REQUEST_CATEGORIES.includes(category)) throw badRequest("Invalid category filter");
      query.category = category;
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      const people = await User.find({ $or: [{ name: rx }, { phone: rx }] }).select("_id").limit(200);
      const peopleIds = people.map((p) => p._id);
      query.$or = [
        { "pickupLocation.addressText": rx },
        { "vehicleInfo.registrationNumber": rx },
        { userId: { $in: peopleIds } },
        { providerId: { $in: peopleIds } },
        ...(mongoose.isValidObjectId(search) ? [{ _id: search }] : [])
      ];
    }

    const [requests, total] = await Promise.all([
      ServiceRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-photos -statusTimeline")
        .populate({ path: "userId", select: "name phone role" })
        .populate({ path: "providerId", select: "name phone role" }),
      ServiceRequest.countDocuments(query)
    ]);

    res.json({ ok: true, requests: requests.map(requestToAdminJSON), pagination: paginationMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
});

router.get("/requests/:id", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "request id");
    const request = await ServiceRequest.findById(req.params.id)
      .populate({ path: "userId", select: "name phone role" })
      .populate({ path: "providerId", select: "name phone role" })
      .populate({ path: "statusTimeline.byUserId", select: "name role" });
    if (!request) throw notFound("Request not found");

    const json = requestToAdminJSON(request);
    json.statusTimeline = (request.statusTimeline || []).map((entry) => ({
      status: entry.status,
      note: entry.note,
      at: entry.at,
      by: entry.byUserId?._id ? { name: entry.byUserId.name, role: entry.byUserId.role } : null
    }));

    res.json({ ok: true, request: json });
  } catch (err) {
    next(err);
  }
});

router.patch("/requests/:id/cancel", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "request id");
    const reason = normalizeStr(req.body?.reason).slice(0, 300);
    if (reason.length < 3) throw badRequest("Please add a reason for cancelling this request");

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (CLOSED_STATUSES.includes(request.status)) throw badRequest(`Request is already ${request.status}`);

    request.addStatus("cancelled", req.user._id, `Cancelled by admin: ${reason}`);
    await request.save();

    if (request.providerId) {
      await User.updateOne(
        { _id: request.providerId, "providerState.activeRequestId": request._id },
        { $set: { "providerState.activeRequestId": null } }
      );
    }

    const populated = await ServiceRequest.findById(request._id)
      .select("-photos -statusTimeline")
      .populate({ path: "userId", select: "name phone role" })
      .populate({ path: "providerId", select: "name phone role" });

    res.json({ ok: true, request: requestToAdminJSON(populated) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- live map */

router.get("/live", async (req, res, next) => {
  try {
    const staleAfter = new Date(Date.now() - 30 * 60 * 1000);
    const [providers, requests] = await Promise.all([
      User.find(
        {
          role: "mechanic",
          "providerState.isOnline": true,
          "providerState.currentLocation.lat": { $type: "number" },
          "providerState.currentLocation.lng": { $type: "number" }
        },
        PROVIDER_LIST_PROJECTION
      ).limit(500),
      ServiceRequest.find({ status: { $nin: CLOSED_STATUSES } })
        .select("category status pickupLocation destinationLocation createdAt estimate.total userId providerId")
        .populate({ path: "userId", select: "name phone role" })
        .populate({ path: "providerId", select: "name phone role" })
        .sort({ createdAt: -1 })
        .limit(500)
    ]);

    res.json({
      ok: true,
      generatedAt: new Date(),
      providers: providers.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        phone: p.phone,
        serviceCategory: p.mechanicProfile?.serviceCategory || null,
        verificationStatus: p.verificationStatus,
        location: p.providerState.currentLocation,
        lastSeenAt: p.providerState.lastSeenAt,
        // Online flag but no ping for 30 min usually means the app was killed.
        isStale: !p.providerState.lastSeenAt || p.providerState.lastSeenAt < staleAfter,
        busy: Boolean(p.providerState.activeRequestId)
      })),
      requests: requests.map((r) => ({
        id: r._id.toString(),
        category: r.category,
        status: r.status,
        pickupLocation: r.pickupLocation,
        destinationLocation: r.destinationLocation,
        total: r.estimate?.total || 0,
        createdAt: r.createdAt,
        user: personSummary(r.userId),
        provider: personSummary(r.providerId)
      }))
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- complaints */

const OPEN_COMPLAINT_STATUSES = ["open", "in_review"];

function complaintToAdminJSON(c, { full = false } = {}) {
  const json = {
    id: c._id.toString(),
    category: c.category,
    description: c.description,
    status: c.status,
    priority: c.priority,
    resolution: c.resolution,
    resolvedAt: c.resolvedAt,
    raisedBy: personSummary(c.raisedBy),
    against: personSummary(c.against),
    assignedTo: personSummary(c.assignedTo),
    resolvedBy: personSummary(c.resolvedBy),
    requestId: c.requestId?._id ? c.requestId._id.toString() : c.requestId ? c.requestId.toString() : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
  if (full) {
    const r = c.requestId?._id ? c.requestId : null;
    json.request = r
      ? {
          id: r._id.toString(),
          category: r.category,
          status: r.status,
          total: r.estimate?.total || 0,
          pickupAddress: r.pickupLocation?.addressText || null,
          createdAt: r.createdAt
        }
      : null;
    json.updates = (c.updates || []).map((u) => ({
      type: u.type,
      text: u.text,
      internal: u.internal,
      status: u.status,
      at: u.at,
      by: u.byUserId?._id ? { name: u.byUserId.name, role: u.byUserId.role } : null
    }));
    json.againstStats = c.against?._id
      ? { complaintsCount: c.against.complaintsCount || 0, isBlocked: Boolean(c.against.isBlocked) }
      : null;
  }
  return json;
}

async function loadComplaint(id) {
  assertObjectId(id, "complaint id");
  const complaint = await Complaint.findById(id)
    .populate({ path: "raisedBy", select: "name phone role" })
    .populate({ path: "against", select: "name phone role complaintsCount isBlocked" })
    .populate({ path: "assignedTo", select: "name phone role" })
    .populate({ path: "resolvedBy", select: "name phone role" })
    .populate({ path: "requestId", select: "category status estimate.total pickupLocation createdAt" })
    .populate({ path: "updates.byUserId", select: "name role" });
  if (!complaint) throw notFound("Complaint not found");
  return complaint;
}

router.get("/complaints", async (req, res, next) => {
  try {
    const status = normalizeStr(req.query.status) || "active";
    const category = normalizeStr(req.query.category) || "all";
    const priority = normalizeStr(req.query.priority) || "all";
    const search = normalizeStr(req.query.search);
    const { page, limit, skip } = parsePagination(req.query);

    const query = {};
    if (status === "active") query.status = { $in: OPEN_COMPLAINT_STATUSES };
    else if (status !== "all") {
      if (!COMPLAINT_STATUSES.includes(status)) throw badRequest("Invalid status filter");
      query.status = status;
    }
    if (category !== "all") {
      if (!COMPLAINT_CATEGORIES.includes(category)) throw badRequest("Invalid category filter");
      query.category = category;
    }
    if (priority !== "all") {
      if (!COMPLAINT_PRIORITIES.includes(priority)) throw badRequest("Invalid priority filter");
      query.priority = priority;
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      const people = await User.find({ $or: [{ name: rx }, { phone: rx }] }).select("_id").limit(200);
      const ids = people.map((p) => p._id);
      query.$or = [{ description: rx }, { raisedBy: { $in: ids } }, { against: { $in: ids } }];
    }

    const [complaints, total, countRows] = await Promise.all([
      Complaint.find(query)
        // high priority first, then oldest open first so nothing waits forever
        .sort(status === "active" ? { priorityRank: 1, createdAt: 1 } : { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "raisedBy", select: "name phone role" })
        .populate({ path: "against", select: "name phone role" })
        .populate({ path: "assignedTo", select: "name phone role" }),
      Complaint.countDocuments(query),
      Complaint.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    ]);

    const counts = formatCountBreakdown(countRows, COMPLAINT_STATUSES);
    counts.active = counts.open + counts.in_review;
    counts.all = COMPLAINT_STATUSES.reduce((sum, key) => sum + counts[key], 0);

    res.json({
      ok: true,
      complaints: complaints.map((c) => complaintToAdminJSON(c)),
      counts,
      pagination: paginationMeta(page, limit, total)
    });
  } catch (err) {
    next(err);
  }
});

router.get("/complaints/:id", async (req, res, next) => {
  try {
    const complaint = await loadComplaint(req.params.id);
    res.json({ ok: true, complaint: complaintToAdminJSON(complaint, { full: true }) });
  } catch (err) {
    next(err);
  }
});

router.patch("/complaints/:id", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "complaint id");
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw notFound("Complaint not found");

    const { status, priority, assign } = req.body || {};
    const resolution = normalizeStr(req.body?.resolution).slice(0, 1000);

    if (priority != null) {
      if (!COMPLAINT_PRIORITIES.includes(priority)) throw badRequest("Invalid priority");
      complaint.priority = priority;
    }

    if (assign === "me") complaint.assignedTo = req.user._id;
    else if (assign === "none") complaint.assignedTo = null;

    if (status != null && status !== complaint.status) {
      if (!COMPLAINT_STATUSES.includes(status)) throw badRequest("Invalid status");
      const closing = status === "resolved" || status === "dismissed";
      if (closing && resolution.length < 5) {
        throw badRequest("Please write what was done (at least 5 characters) — the customer will see it");
      }

      complaint.status = status;
      if (closing) {
        complaint.resolution = resolution;
        complaint.resolvedAt = new Date();
        complaint.resolvedBy = req.user._id;
      } else {
        complaint.resolution = null;
        complaint.resolvedAt = null;
        complaint.resolvedBy = null;
      }
      if (status === "in_review" && !complaint.assignedTo) complaint.assignedTo = req.user._id;

      complaint.updates.push({
        type: "status",
        status,
        text: closing ? resolution : null,
        internal: false,
        byUserId: req.user._id
      });
    }

    await complaint.save();
    const fresh = await loadComplaint(complaint._id);
    res.json({ ok: true, complaint: complaintToAdminJSON(fresh, { full: true }) });
  } catch (err) {
    next(err);
  }
});

router.post("/complaints/:id/notes", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "complaint id");
    const text = normalizeStr(req.body?.text).slice(0, 1000);
    const internal = req.body?.internal !== false;
    if (text.length < 2) throw badRequest("Write a message first");

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw notFound("Complaint not found");

    complaint.updates.push({ type: internal ? "note" : "reply", text, internal, byUserId: req.user._id });
    // Replying to the customer means someone is on it.
    if (!internal && complaint.status === "open") {
      complaint.status = "in_review";
      complaint.updates.push({ type: "status", status: "in_review", internal: false, byUserId: req.user._id });
    }
    if (!complaint.assignedTo) complaint.assignedTo = req.user._id;
    await complaint.save();

    const fresh = await loadComplaint(complaint._id);
    res.json({ ok: true, complaint: complaintToAdminJSON(fresh, { full: true }) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
