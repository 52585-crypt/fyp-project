const mongoose = require("mongoose");
const {
  ServiceRequest,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  FUEL_TYPES,
  MECHANIC_ISSUES,
  REQUEST_PRIORITIES
} = require("../models/ServiceRequest");
const { Vehicle } = require("../models/Vehicle");
const { User } = require("../models/User");
const { ChatMessage } = require("../models/ChatMessage");
const { Payment } = require("../models/Payment");
const {
  newDispatch,
  acceptOffer,
  cancelDispatchOffer,
  declineOffer
} = require("../services/dispatch");
const { notifyRequest, notifyUser } = require("../services/realtime");
const { createNotificationSafely } = require("../services/notifications");
const { ensureFinalizedInvoice } = require("../services/payments");

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function requireProvider(req) {
  if (req.user?.role !== "mechanic") throw forbidden("Provider account required");
}

function normalizeStr(v) {
  return v == null ? "" : String(v).trim();
}

function parseNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function distanceKm(from, to) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function normalizeCategory(category) {
  const aliases = {
    towing: "car_towing",
    car: "car_towing",
    fuel: "fuel_delivery",
    mechanic: "mechanic"
  };
  return aliases[category] || category;
}

function providerCategoryForRequest(category) {
  if (category === "car_towing") return "towing";
  return category;
}

function defaultSearchRadiusKm(category) {
  if (category === "car_towing") return 15;
  if (category === "fuel_delivery") return 8;
  return 5;
}

function estimateArrivalMinutes(distance) {
  return Math.max(3, Math.round((distance / 25) * 60));
}

function nearbyProviderScore(provider, distance) {
  const rating = Number(provider.ratingAvg || 0);
  const completedJobs = Number(provider.completedJobs || 0);
  const distanceScore = Math.max(0, 50 - distance * 3);
  const ratingScore = rating * 8;
  const experienceScore = Math.min(15, completedJobs / 4);
  return Math.round((distanceScore + ratingScore + experienceScore) * 10) / 10;
}

function canAccessRequestChat(request, user) {
  const userId = user?._id?.toString();
  if (!userId) return false;
  if (request.userId?.toString() === userId) return true;
  return Boolean(request.providerId && request.providerId.toString() === userId);
}

function canAccessRequestDetails(request, user) {
  const userId = user?._id?.toString();
  if (!userId) return false;
  if (request.userId?.toString() === userId) return true;
  if (request.providerId && request.providerId.toString() === userId) return true;
  if (user.role !== "mechanic") return false;

  return (
    request.status === "searching_provider" &&
    !request.providerId &&
    request.dispatch?.state === "offered" &&
    String(request.dispatch.offeredProviderId) === userId && request.dispatch.expiresAt > new Date()
  );
}

async function refreshProviderRating(providerId) {
  if (!providerId) return;

  const [summary] = await ServiceRequest.aggregate([
    {
      $match: {
        providerId: new mongoose.Types.ObjectId(providerId.toString()),
        "review.rating": { $gte: 1, $lte: 5 }
      }
    },
    {
      $group: {
        _id: "$providerId",
        ratingAvg: { $avg: "$review.rating" },
        ratingCount: { $sum: 1 }
      }
    }
  ]);

  await User.updateOne(
    { _id: providerId },
    {
      $set: {
        ratingAvg: summary ? Math.round(summary.ratingAvg * 10) / 10 : 0,
        ratingCount: summary?.ratingCount || 0
      }
    }
  );
}

function normalizeLocation(input, label) {
  const lat = parseNum(input?.lat);
  const lng = parseNum(input?.lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw badRequest(`${label} valid lat/lng required`);
  return {
    lat,
    lng,
    addressText: normalizeStr(input?.addressText) || null
  };
}

function optionalLocation(input) {
  if (!input) return null;
  const lat = parseNum(input.lat);
  const lng = parseNum(input.lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw badRequest("Valid location lat/lng required");
  const now = new Date();
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : now;
  if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw badRequest("Invalid location capture time");
  }
  const optionalNumber = (value) => {
    const parsed = parseNum(value);
    return parsed == null ? null : parsed;
  };
  return {
    lat,
    lng,
    addressText: normalizeStr(input.addressText) || null,
    accuracy: optionalNumber(input.accuracy),
    heading: optionalNumber(input.heading),
    speed: optionalNumber(input.speed),
    capturedAt,
    receivedAt: now,
    updatedAt: now
  };
}

function locationFromMechanicProfile(provider) {
  const saved = provider?.mechanicProfile?.liveLocation;
  const lat = parseNum(saved?.lat);
  const lng = parseNum(saved?.lng);
  if (lat == null || lng == null) return null;

  return {
    lat,
    lng,
    addressText: normalizeStr(saved?.addressText) || "Saved provider location",
    updatedAt: new Date()
  };
}

function providerLocationFromUser(provider) {
  const location = provider?.providerState?.currentLocation;
  const lat = parseNum(location?.lat);
  const lng = parseNum(location?.lng);
  if (lat == null || lng == null) return null;

  return {
    lat,
    lng,
    addressText: normalizeStr(location?.addressText) || null,
    accuracy: location?.accuracy ?? null,
    heading: location?.heading ?? null,
    speed: location?.speed ?? null,
    capturedAt: location?.capturedAt || null,
    receivedAt: location?.receivedAt || location?.updatedAt || null,
    updatedAt: location?.updatedAt || null
  };
}

async function attachProviderLocations(requests) {
  const providerIds = [
    ...new Set(
      requests
        .map((request) => request.providerId?.toString())
        .filter(Boolean)
    )
  ];

  if (!providerIds.length) {
    return requests.map((request) => ({
      ...request.toJSONSafe(),
      providerLocation: null
    }));
  }

  const providers = await User.find({ _id: { $in: providerIds } }).select("name phone ratingAvg ratingCount providerState");
  const providerMap = new Map(providers.map((provider) => [provider._id.toString(), provider]));

  return requests.map((request) => ({
    ...request.toJSONSafe(),
    providerLocation: ["completed", "cancelled"].includes(request.status) ? null : providerLocationFromUser(providerMap.get(request.providerId?.toString())),
    provider: (() => { const p = providerMap.get(request.providerId?.toString()); return p ? { id: p.id, name: p.name, phone: p.phone, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount } : null; })()
  }));
}

function activeStatuses() {
  return [
    "provider_assigned",
    "provider_on_way",
    "provider_arrived",
    "in_progress",
    "waiting_user_approval",
    "vehicle_loaded",
    "reached_destination",
    "fuel_delivered",
    "inspection_started",
    "extra_work_requested",
    "work_started",
    "service_finished"
  ];
}

function estimateFor(category, body) {
  if (category === "car_towing") {
    const distanceKm = Math.max(1, parseNum(body.distanceKm) || 8);
    const lines = [
      { label: "Base towing fee", amount: 1200 },
      { label: `Distance charge (${distanceKm} km)`, amount: Math.round(distanceKm * 180) },
      { label: "Service fee", amount: 250 }
    ];
    return { currency: "PKR", lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
  }

  if (category === "fuel_delivery") {
    const liters = Math.max(1, parseNum(body.fuelDetails?.liters) || 5);
    const fuelType = normalizeStr(body.fuelDetails?.fuelType).toLowerCase();
    const perLiter = fuelType === "diesel" ? 290 : 275;
    const lines = [
      { label: `${fuelType === "diesel" ? "Diesel" : "Petrol"} (${liters}L)`, amount: Math.round(perLiter * liters) },
      { label: "Delivery fee", amount: 450 },
      { label: "Service fee", amount: 150 }
    ];
    return { currency: "PKR", lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
  }

  const lines = [
    { label: "Inspection fee", amount: 900 },
    { label: "Visit fee", amount: 350 }
  ];
  return { currency: "PKR", lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

function validateServiceDetails(category, body) {
  if (category === "car_towing") {
    normalizeLocation(body.destinationLocation, "Destination location");
    return;
  }

  if (category === "fuel_delivery") {
    const fuelType = normalizeStr(body.fuelDetails?.fuelType).toLowerCase();
    const liters = parseNum(body.fuelDetails?.liters);
    if (!FUEL_TYPES.includes(fuelType)) throw badRequest("fuelDetails.fuelType must be petrol or diesel");
    if (liters == null || liters < 1 || liters > 50) throw badRequest("fuelDetails.liters must be between 1 and 50");
    return;
  }

  const issueCategory = normalizeStr(body.mechanicDetails?.issueCategory || body.issueType).toLowerCase();
  if (!MECHANIC_ISSUES.includes(issueCategory)) {
    throw badRequest(`mechanicDetails.issueCategory must be one of: ${MECHANIC_ISSUES.join(", ")}`);
  }
}

async function buildVehicleData(req, vehicleId, vehicleInfo) {
  if (!vehicleId) {
    const info = vehicleInfo || {};
    return {
      vehicleId: null,
      vehicleInfo: {
        type: normalizeStr(info.type) || "car",
        make: normalizeStr(info.make) || null,
        model: normalizeStr(info.model) || null,
        registrationNumber: normalizeStr(info.registrationNumber) || null
      }
    };
  }

  if (!mongoose.isValidObjectId(vehicleId)) throw badRequest("Invalid vehicleId");
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw notFound("Vehicle not found");
  if (vehicle.userId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");

  return {
    vehicleId: vehicle._id,
    vehicleInfo: {
      type: vehicle.type,
      make: vehicle.make,
      model: vehicle.model,
      registrationNumber: vehicle.registrationNumber || null
    }
  };
}

async function createRequest(req, res, next) {
  try {
    if (req.user.role !== "user") throw forbidden("Customer account required");
    const body = req.body || {};
    const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : null;
    if (clientRequestId && (clientRequestId.length < 12 || clientRequestId.length > 100)) throw badRequest("Invalid submission ID");
    if (clientRequestId) {
      const previous = await ServiceRequest.findOne({ userId: req.user._id, clientRequestId });
      if (previous) return res.json({ ok: true, request: previous.toJSONSafe() });
    }
    const category = normalizeCategory(body.category);
    const priority = (normalizeStr(body.priority) || "normal").toLowerCase();

    if (!category || !REQUEST_CATEGORIES.includes(category)) {
      throw badRequest(`category must be one of: ${REQUEST_CATEGORIES.join(", ")}`);
    }
    if (!REQUEST_PRIORITIES.includes(priority)) {
      throw badRequest(`priority must be one of: ${REQUEST_PRIORITIES.join(", ")}`);
    }

    const pickupLocation = normalizeLocation(body.pickupLocation || body.location, "Pickup location");
    validateServiceDetails(category, body);

    const vehicleData = await buildVehicleData(req, body.vehicleId, body.vehicleInfo);
    const estimate = estimateFor(category, body);
    const issueType =
      category === "mechanic"
        ? normalizeStr(body.mechanicDetails?.issueCategory || body.issueType).toLowerCase()
        : normalizeStr(body.issueType) || null;

    const request = new ServiceRequest({
      userId: req.user._id,
      ...(clientRequestId ? { clientRequestId } : {}),
      vehicleId: vehicleData.vehicleId,
      vehicleInfo: vehicleData.vehicleInfo,
      category,
      priority,
      pickupLocation,
      destinationLocation: category === "car_towing" ? normalizeLocation(body.destinationLocation, "Destination location") : null,
      issueType,
      description: normalizeStr(body.description) || null,
      photos: Array.isArray(body.photos) ? body.photos.filter(Boolean).map(String).slice(0, 5) : [],
      fuelDetails:
        category === "fuel_delivery"
          ? {
              fuelType: normalizeStr(body.fuelDetails?.fuelType).toLowerCase(),
              liters: parseNum(body.fuelDetails?.liters)
            }
          : undefined,
      mechanicDetails:
        category === "mechanic"
          ? {
              issueCategory: issueType
            }
          : undefined,
      estimate,
      status: "searching_provider",
      dispatch: newDispatch(category)
    });

    request.addStatus("searching_provider", req.user._id, "Request created");
    try { await request.save(); }
    catch (error) {
      if (error.code !== 11000 || !clientRequestId) throw error;
      const previous = await ServiceRequest.findOne({ userId: req.user._id, clientRequestId });
      if (!previous) throw error;
      return res.json({ ok: true, request: previous.toJSONSafe() });
    }

    notifyRequest(request, "dispatch");
    res.status(201).json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function listMyRequests(req, res, next) {
  try {
    const requests = await ServiceRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ ok: true, requests: await attachProviderLocations(requests) });
  } catch (err) {
    next(err);
  }
}

async function getRequest(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest("Invalid request id");

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (!canAccessRequestDetails(request, req.user)) throw forbidden("Forbidden");

    res.json({ ok: true, request: (await attachProviderLocations([request]))[0] });
  } catch (err) {
    next(err);
  }
}

async function listProviderRequests(req, res, next) {
  try {
    requireProvider(req);
    if (req.user.verificationStatus !== "verified" || !req.user.providerState?.isOnline || req.user.providerState?.activeRequestId) {
      return res.json({ ok: true, requests: [], serverTime: new Date() });
    }
    const requests = await ServiceRequest.find({
      status: "searching_provider", providerId: null, "dispatch.state": "offered",
      "dispatch.offeredProviderId": req.user._id, "dispatch.expiresAt": { $gt: new Date() }
    }).sort({ "dispatch.expiresAt": 1 });
    res.json({ ok: true, requests: requests.map((r) => r.toJSONSafe()), serverTime: new Date() });
  } catch (err) { next(err); }
}

async function listNearbyProviders(req, res, next) {
  try {
    const category = normalizeCategory(req.query?.category);
    if (!category || !REQUEST_CATEGORIES.includes(category)) {
      throw badRequest(`category must be one of: ${REQUEST_CATEGORIES.join(", ")}`);
    }

    const origin = {
      lat: parseNum(req.query?.lat),
      lng: parseNum(req.query?.lng)
    };
    if (origin.lat == null || origin.lng == null) throw badRequest("lat and lng are required");

    const requestedRadius = parseNum(req.query?.radiusKm);
    const radiusKm = Math.min(50, Math.max(1, requestedRadius || defaultSearchRadiusKm(category)));
    const staleAfter = new Date(Date.now() - 30 * 60 * 1000);

    const candidates = await User.find({
      role: "mechanic",
      verificationStatus: "verified",
      "mechanicProfile.serviceCategory": providerCategoryForRequest(category),
      "providerState.isOnline": true,
      "providerState.activeRequestId": null,
      "providerState.currentLocation.lat": { $type: "number" },
      "providerState.currentLocation.lng": { $type: "number" },
      "providerState.lastSeenAt": { $gte: staleAfter }
    })
      .select("name mechanicProfile.serviceCategory providerState ratingAvg ratingCount completedJobs")
      .limit(100);

    const providers = candidates
      .map((provider) => {
        const location = provider.providerState?.currentLocation;
        const distance = distanceKm(origin, { lat: location.lat, lng: location.lng });
        return {
          id: provider._id.toString(),
          name: provider.name,
          serviceCategory: provider.mechanicProfile?.serviceCategory || null,
          ratingAvg: provider.ratingAvg || 0,
          ratingCount: provider.ratingCount || 0,
          completedJobs: provider.completedJobs || 0,
          distanceKm: Math.round(distance * 10) / 10,
          etaMinutes: estimateArrivalMinutes(distance),
          score: nearbyProviderScore(provider, distance),
          location: {
            lat: location.lat,
            lng: location.lng,
            addressText: location.addressText || null,
            updatedAt: location.updatedAt || provider.providerState?.lastSeenAt || null
          }
        };
      })
      .filter((provider) => provider.distanceKm <= radiusKm)
      .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
      .slice(0, 20);

    res.json({ ok: true, radiusKm, providers });
  } catch (err) {
    next(err);
  }
}

async function acceptRequest(req, res, next) {
  try {
    requireProvider(req);
    const request = await acceptOffer(req.params.id, req.user._id, req.body?.offerId);
    res.json({ ok: true, request: (await attachProviderLocations([request]))[0] });
  } catch (err) { next(err); }
}

async function declineRequest(req, res, next) {
  try {
    requireProvider(req);
    await declineOffer(req.params.id, req.user._id, req.body?.offerId);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function retryDispatch(req, res, next) {
  try {
    const existing = await ServiceRequest.findOne({ _id: req.params.id, userId: req.user._id });
    if (!existing) throw badRequest("Only the customer can restart a search.");
    const request = await ServiceRequest.findOneAndUpdate({
      _id: req.params.id, userId: req.user._id, providerId: null,
      status: "searching_provider", "dispatch.version": existing.dispatch.version,
      $or: [{ "dispatch.state": "unavailable" }, { "dispatch.enabled": { $ne: true } }]
    }, { $set: { dispatch: { ...newDispatch(existing.category), version: existing.dispatch.version + 1 } } }, { new: true });
    if (!request) throw badRequest("Only the customer can restart an exhausted search.");
    notifyRequest(request, "dispatch");
    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) { next(err); }
}

async function updateRequestStatus(req, res, next) {
  try {
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    const status = normalizeStr(req.body?.status);
    const isOwner = String(request.userId) === String(req.user._id);
    const isProvider = String(request.providerId) === String(req.user._id);
    if (!isOwner && !isProvider) throw forbidden("Only the customer or assigned provider can update this job");
    if (request.status === status) return res.json({ ok: true, request: (await attachProviderLocations([request]))[0] });
    if (["completed", "cancelled"].includes(request.status)) throw badRequest("This job is already closed.");
    if (status === "completed") {
      if (!isOwner || request.status !== "service_finished") throw forbidden("Customer confirmation is required after service finishes");
    } else if (status !== "cancelled") {
      if (!isProvider) throw forbidden("Only the assigned provider can advance this job");
      const transitions = {
        provider_assigned: ["provider_on_way"],
        provider_on_way: ["provider_arrived"],
        provider_arrived: request.category === "car_towing" ? ["vehicle_loaded"] : request.category === "fuel_delivery" ? ["fuel_delivered"] : ["inspection_started"],
        vehicle_loaded: ["reached_destination"],
        reached_destination: ["service_finished"],
        fuel_delivered: ["service_finished"],
        inspection_started: ["work_started"],
        work_started: ["service_finished"],
        in_progress: ["service_finished"]
      };
      if (!(transitions[request.status] || []).includes(status)) throw badRequest("Invalid job status transition.");
    }
    const now = new Date();
    const closed = ["completed", "cancelled"].includes(status);
    const updated = await ServiceRequest.findOneAndUpdate({
      _id: request._id, status: request.status, providerId: request.providerId,
      ...(request.dispatch?.enabled ? { "dispatch.version": request.dispatch.version } : {})
    }, {
      $set: {
        status, ...(closed ? { assignmentActive: false } : {}),
        ...(status === "completed" ? { completedAt: now } : {}),
        ...(status === "cancelled" ? { cancelledAt: now, "dispatch.state": "cancelled", "dispatch.expiresAt": null } : {})
      },
      $inc: { "dispatch.version": 1, __v: 1 },
      $push: { statusTimeline: { status, byUserId: req.user._id, at: now, note: normalizeStr(req.body?.note) || null } }
    }, { new: true });
    if (!updated) throw Object.assign(new Error("Request changed. Refresh and try again."), { statusCode: 409 });
    if (status === "cancelled") await cancelDispatchOffer(request, now);
    if (closed && request.providerId) {
      await User.updateOne({ _id: request.providerId, "providerState.activeRequestId": request._id }, {
        $set: { "providerState.activeRequestId": null, "providerState.claimedAt": null },
        ...(status === "completed" ? { $inc: { completedJobs: 1 } } : {})
      });
    }
    if (status === "completed") await ensureFinalizedInvoice(updated);
    notifyRequest(updated, status === "provider_arrived" ? "arrived" : "status");
    const statusText = status.replaceAll("_", " ");
    const recipientId = isProvider ? updated.userId : updated.providerId;
    createNotificationSafely({
      userId: recipientId,
      type: status === "cancelled" ? "request_cancelled" : "status_update",
      title: status === "provider_arrived" ? "Provider arrived" : status === "cancelled" ? "Request cancelled" : "Job status updated",
      body: status === "provider_arrived" ? "Your provider is now at the pickup point." : `The job is now ${statusText}.`,
      data: { requestId: updated.id, status, route: isProvider ? "/(user)/tracking" : "/(provider)/jobs" }
    });
    res.json({ ok: true, request: (await attachProviderLocations([updated]))[0] });
  } catch (err) { next(err); }
}

async function submitRequestReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest("Invalid request id");

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (request.userId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");
    if (request.status !== "completed") throw badRequest("Only completed requests can be reviewed");
    if (!request.providerId) throw badRequest("Cannot review a request without an assigned provider");

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw badRequest("rating must be an integer between 1 and 5");
    }

    const comment = normalizeStr(req.body?.comment);
    if (comment.length > 400) throw badRequest("comment must be 400 characters or less");

    request.review = {
      rating,
      comment: comment || null,
      byUserId: req.user._id,
      reviewedAt: new Date()
    };
    await request.save();
    await refreshProviderRating(request.providerId);

    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function updateProviderAvailability(req, res, next) {
  try {
    requireProvider(req);
    const isOnline = Boolean(req.body?.isOnline);
    if (isOnline && req.user.verificationStatus !== "verified") throw forbidden("Complete provider verification before going online.");
    const location = optionalLocation(req.body?.location);
    if (isOnline && !location) throw badRequest("A fresh GPS location is required to go online.");

    const $set = {
      "providerState.isOnline": isOnline,
      "providerState.lastSeenAt": new Date()
    };
    if (location) $set["providerState.currentLocation"] = location;

    const provider = await User.findByIdAndUpdate(req.user._id, { $set }, { new: true });
    res.json({ ok: true, provider: provider.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function updateProviderLocation(req, res, next) {
  try {
    requireProvider(req);
    const location = optionalLocation(req.body?.location || req.body);
    if (!location) throw badRequest("Location is required");

    if (!req.user.providerState?.isOnline && !req.user.providerState?.activeRequestId) {
      throw forbidden("Go online before sharing provider location");
    }

    const provider = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        $or: [
          { "providerState.currentLocation.capturedAt": null },
          { "providerState.currentLocation.capturedAt": { $lt: location.capturedAt } }
        ]
      },
      {
        $set: {
          "providerState.currentLocation": location,
          "providerState.lastSeenAt": new Date()
        }
      },
      { new: true }
    );

    if (!provider) {
      const err = new Error("Older location update ignored");
      err.statusCode = 409;
      throw err;
    }

    if (provider.providerState?.activeRequestId) {
      const request = await ServiceRequest.findOne({ _id: provider.providerState.activeRequestId, providerId: provider._id, status: { $nin: ["completed", "cancelled"] } });
      if (request) notifyRequest(request, "location");
    }
    res.json({ ok: true, provider: provider.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function getProviderActiveRequest(req, res, next) {
  try {
    requireProvider(req);
    const request = await ServiceRequest.findOne({
      providerId: req.user._id,
      status: { $in: activeStatuses() }
    }).sort({ updatedAt: -1 });

    res.json({ ok: true, request: request ? (await attachProviderLocations([request]))[0] : null });
  } catch (err) {
    next(err);
  }
}

async function getProviderHistory(req, res, next) {
  try {
    requireProvider(req);
    const requests = await ServiceRequest.find({
      providerId: req.user._id,
      status: { $in: ["completed", "cancelled"] }
    })
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json({ ok: true, requests: requests.map((r) => r.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
}

async function getProviderEarnings(req, res, next) {
  try {
    requireProvider(req);
    const payments = await Payment.find({ providerId: req.user._id, status: "paid" })
      .sort({ paidAt: -1 })
      .populate("invoiceId");

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    const totals = payments.reduce(
      (acc, payment) => {
        const amount = Number(payment.invoiceId?.providerEarningsMinor || 0) / 100;
        const paidAt = payment.paidAt || payment.updatedAt;
        acc.total += amount;
        if (paidAt >= todayStart) acc.today += amount;
        if (paidAt >= weekStart) acc.week += amount;
        return acc;
      },
      { today: 0, week: 0, total: 0 }
    );
    const recentRequests = await ServiceRequest.find({ providerId: req.user._id, status: "completed" })
      .sort({ completedAt: -1 })
      .limit(10);
    const completedJobs = await ServiceRequest.countDocuments({ providerId: req.user._id, status: "completed" });

    res.json({
      ok: true,
      earnings: {
        currency: "PKR",
        today: totals.today,
        week: totals.week,
        total: totals.total,
        completedJobs,
        paidJobs: payments.length,
        recent: recentRequests.map((r) => r.toJSONSafe())
      }
    });
  } catch (err) {
    next(err);
  }
}

async function requestExtraWork(req, res, next) {
  try {
    requireProvider(req);
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (!request.providerId || request.providerId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");
    if (request.category !== "mechanic") throw badRequest("Extra work is only available for mechanic requests");
    if (request.status !== "inspection_started") throw badRequest("Start the inspection before requesting extra work");

    const partName = normalizeStr(req.body?.partName);
    const partPrice = Math.max(0, parseNum(req.body?.partPrice) || 0);
    const laborCharge = Math.max(0, parseNum(req.body?.laborCharge) || 0);
    const estimatedTime = normalizeStr(req.body?.estimatedTime) || null;
    const description = normalizeStr(req.body?.description) || null;
    if (!description && !partName) throw badRequest("Extra work description or partName is required");

    request.mechanicDetails.extraWork = {
      partName: partName || null,
      partPrice,
      laborCharge,
      estimatedTime,
      description,
      approvedByUser: false,
      status: "pending",
      requestedAt: new Date(),
      decidedAt: null
    };
    request.addStatus("extra_work_requested", req.user._id, "Provider requested extra work approval");
    await request.save();

    notifyRequest(request, "extra-work");
    createNotificationSafely({
      userId: request.userId,
      type: "extra_work_requested",
      title: "Extra work approval needed",
      body: `${description || partName}: PKR ${(partPrice + laborCharge).toLocaleString()}`,
      data: { requestId: request.id, route: "/(user)/tracking" }
    });

    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function approveExtraWork(req, res, next) {
  try {
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (request.userId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");
    if (request.category !== "mechanic") throw badRequest("Extra work is only available for mechanic requests");
    if (request.status !== "extra_work_requested" || request.mechanicDetails?.extraWork?.status !== "pending") {
      throw badRequest("This extra-work request was already decided or is unavailable");
    }

    const approved = Boolean(req.body?.approved ?? true);
    request.mechanicDetails.extraWork.approvedByUser = approved;
    request.mechanicDetails.extraWork.status = approved ? "approved" : "rejected";
    request.mechanicDetails.extraWork.decidedAt = new Date();
    if (approved) {
      const amount = Number(request.mechanicDetails.extraWork.partPrice || 0) + Number(request.mechanicDetails.extraWork.laborCharge || 0);
      request.estimate.lines.push({ label: "Approved extra work", amount });
      request.estimate.total += amount;
    }
    request.addStatus(approved ? "work_started" : "inspection_started", req.user._id, approved ? "User approved extra work" : "User rejected extra work");
    await request.save();

    notifyRequest(request, "extra-work-decision");
    createNotificationSafely({
      userId: request.providerId,
      type: "extra_work_decision",
      title: request.mechanicDetails.extraWork.approvedByUser ? "Extra work approved" : "Extra work rejected",
      body: request.mechanicDetails.extraWork.approvedByUser ? "The customer approved the additional repair." : "The customer declined the additional repair.",
      data: { requestId: request.id, route: "/(provider)/jobs" }
    });

    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function getRequestMessages(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest("Invalid request id");

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (!canAccessRequestChat(request, req.user)) throw forbidden("Forbidden");

    const messages = await ChatMessage.find({ requestId: request._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate({ path: "senderId", select: "name phone role" });

    res.json({ ok: true, messages: messages.map((message) => message.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
}

async function sendRequestMessage(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest("Invalid request id");

    const body = normalizeStr(req.body?.body);
    const clientMessageId = normalizeStr(req.body?.clientMessageId) || null;
    if (!body) throw badRequest("Message is required");
    if (body.length > 1000) throw badRequest("Message must be 1000 characters or less");

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (!canAccessRequestChat(request, req.user)) throw forbidden("Forbidden");
    if (!request.providerId) throw badRequest("Chat is available after provider assignment");

    if (clientMessageId && (clientMessageId.length < 8 || clientMessageId.length > 100)) throw badRequest("Invalid message ID");
    let message;
    let createdNew = true;
    try {
      message = await ChatMessage.create({ requestId: request._id, senderId: req.user._id, senderRole: req.user.role, clientMessageId, body });
    } catch (error) {
      if (error.code !== 11000 || !clientMessageId) throw error;
      message = await ChatMessage.findOne({ requestId: request._id, senderId: req.user._id, clientMessageId });
      if (!message) throw error;
      createdNew = false;
    }

    await message.populate({ path: "senderId", select: "name phone role" });
    const safeMessage = message.toJSONSafe();
    const recipientId = String(request.userId) === String(req.user._id) ? request.providerId : request.userId;
    if (createdNew) {
      notifyUser(recipientId, { requestId: request.id, message: safeMessage }, "chat:message");
      createNotificationSafely({
        userId: recipientId,
        type: "chat_message",
        title: req.user.role === "mechanic" ? "Message from provider" : "Message from customer",
        body: body.length > 100 ? `${body.slice(0, 97)}...` : body,
        data: { requestId: request.id, route: req.user.role === "mechanic" ? "/(user)/chat" : "/(provider)/chat" }
      });
    }
    res.status(createdNew ? 201 : 200).json({ ok: true, message: safeMessage });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRequest,
  getRequest,
  listMyRequests,
  listNearbyProviders,
  listOpenRequests: listProviderRequests,
  listProviderRequests,
  acceptRequest,
  declineRequest,
  retryDispatch,
  updateRequestStatus,
  updateProviderAvailability,
  updateProviderLocation,
  getProviderActiveRequest,
  getProviderHistory,
  getProviderEarnings,
  getRequestMessages,
  requestExtraWork,
  approveExtraWork,
  submitRequestReview,
  sendRequestMessage
};
