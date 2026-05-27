const mongoose = require("mongoose");
const {
  ServiceRequest,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  FUEL_TYPES,
  MECHANIC_ISSUES
} = require("../models/ServiceRequest");
const { Vehicle } = require("../models/Vehicle");
const { User } = require("../models/User");
const { ChatMessage } = require("../models/ChatMessage");

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
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    providerCategoryForRequest(request.category) === user.mechanicProfile?.serviceCategory
  );
}

function canCancelRequest(request, user) {
  const userId = user?._id?.toString();
  if (!userId) return false;
  if (request.userId?.toString() === userId) return true;
  if (request.providerId && request.providerId.toString() === userId) return true;
  if (user.role !== "mechanic") return false;

  return (
    request.status === "searching_provider" &&
    !request.providerId &&
    providerCategoryForRequest(request.category) === user.mechanicProfile?.serviceCategory
  );
}

function normalizeLocation(input, label) {
  const lat = parseNum(input?.lat);
  const lng = parseNum(input?.lng);
  if (lat == null || lng == null) throw badRequest(`${label} lat/lng required`);
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
  if (lat == null || lng == null) throw badRequest("Location lat/lng required");
  return {
    lat,
    lng,
    addressText: normalizeStr(input.addressText) || null,
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

  const providers = await User.find({ _id: { $in: providerIds } }).select("providerState");
  const providerMap = new Map(providers.map((provider) => [provider._id.toString(), providerLocationFromUser(provider)]));

  return requests.map((request) => ({
    ...request.toJSONSafe(),
    providerLocation: providerMap.get(request.providerId?.toString()) || null
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
    "work_started"
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
    const body = req.body || {};
    const category = normalizeCategory(body.category);

    if (!category || !REQUEST_CATEGORIES.includes(category)) {
      throw badRequest(`category must be one of: ${REQUEST_CATEGORIES.join(", ")}`);
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
      vehicleId: vehicleData.vehicleId,
      vehicleInfo: vehicleData.vehicleInfo,
      category,
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
      status: "searching_provider"
    });

    request.addStatus("searching_provider", req.user._id, "Request created");
    await request.save();

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

    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function listProviderRequests(req, res, next) {
  try {
    requireProvider(req);
    const serviceCategory = req.user?.mechanicProfile?.serviceCategory;
    const category = REQUEST_CATEGORIES.find((item) => providerCategoryForRequest(item) === serviceCategory);

    if (!category) {
      res.json({ ok: true, requests: [] });
      return;
    }

    const requests = await ServiceRequest.find({
      category,
      status: "searching_provider",
      providerId: null
    })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ ok: true, requests: requests.map((r) => r.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
}

async function acceptRequest(req, res, next) {
  try {
    requireProvider(req);
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (request.providerId) throw badRequest("Request already assigned");

    const providerCategory = req.user?.mechanicProfile?.serviceCategory;
    if (providerCategoryForRequest(request.category) !== providerCategory) {
      throw forbidden("Provider service category does not match this request");
    }

    request.providerId = req.user._id;
    request.acceptedAt = new Date();
    request.addStatus("provider_assigned", req.user._id, "Provider accepted request");
    await request.save();

    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "providerState.activeRequestId": request._id,
          "providerState.lastSeenAt": new Date()
        }
      }
    );

    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function updateRequestStatus(req, res, next) {
  try {
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");

    const status = normalizeStr(req.body?.status);
    if (!REQUEST_STATUSES.includes(status)) throw badRequest("Invalid status");

    const isOwner = request.userId.toString() === req.user._id.toString();
    const isProvider = request.providerId && request.providerId.toString() === req.user._id.toString();
    const isOpenMatchingProviderCancel = status === "cancelled" && canCancelRequest(request, req.user);
    if (!isOwner && !isProvider && !isOpenMatchingProviderCancel) throw forbidden("Forbidden");

    if (["completed", "provider_on_way", "provider_arrived", "in_progress", "vehicle_loaded", "reached_destination", "fuel_delivered", "inspection_started", "extra_work_requested", "work_started"].includes(status) && !isProvider) {
      throw forbidden("Only assigned provider can set this status");
    }

    request.addStatus(status, req.user._id, normalizeStr(req.body?.note) || null);
    await request.save();

    if (status === "completed" || status === "cancelled") {
      await User.updateOne(
        { _id: request.providerId },
        {
          $set: {
            "providerState.activeRequestId": null,
            "providerState.lastSeenAt": new Date()
          },
          ...(status === "completed" ? { $inc: { completedJobs: 1 } } : {})
        }
      );
    }

    res.json({ ok: true, request: request.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function updateProviderAvailability(req, res, next) {
  try {
    requireProvider(req);
    const isOnline = Boolean(req.body?.isOnline);
    const location = optionalLocation(req.body?.location);

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

    const provider = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "providerState.currentLocation": location,
          "providerState.lastSeenAt": new Date()
        }
      },
      { new: true }
    );

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

    res.json({ ok: true, request: request ? request.toJSONSafe() : null });
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
    const completed = await ServiceRequest.find({
      providerId: req.user._id,
      status: "completed"
    }).sort({ completedAt: -1 });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    const totals = completed.reduce(
      (acc, request) => {
        const total = request.estimate?.total || 0;
        const completedAt = request.completedAt || request.updatedAt;
        acc.total += total;
        if (completedAt >= todayStart) acc.today += total;
        if (completedAt >= weekStart) acc.week += total;
        return acc;
      },
      { today: 0, week: 0, total: 0 }
    );

    res.json({
      ok: true,
      earnings: {
        currency: "PKR",
        today: totals.today,
        week: totals.week,
        total: totals.total,
        completedJobs: completed.length,
        recent: completed.slice(0, 10).map((r) => r.toJSONSafe())
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
      approvedByUser: false
    };
    request.estimate.lines.push({ label: "Extra work estimate", amount: partPrice + laborCharge });
    request.estimate.total += partPrice + laborCharge;
    request.addStatus("extra_work_requested", req.user._id, "Provider requested extra work approval");
    await request.save();

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

    request.mechanicDetails.extraWork.approvedByUser = Boolean(req.body?.approved ?? true);
    request.addStatus(request.mechanicDetails.extraWork.approvedByUser ? "work_started" : "waiting_user_approval", req.user._id, request.mechanicDetails.extraWork.approvedByUser ? "User approved extra work" : "User rejected extra work");
    await request.save();

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
    if (!body) throw badRequest("Message is required");
    if (body.length > 1000) throw badRequest("Message must be 1000 characters or less");

    const request = await ServiceRequest.findById(req.params.id);
    if (!request) throw notFound("Request not found");
    if (!canAccessRequestChat(request, req.user)) throw forbidden("Forbidden");
    if (!request.providerId) throw badRequest("Chat is available after provider assignment");

    const message = await ChatMessage.create({
      requestId: request._id,
      senderId: req.user._id,
      senderRole: req.user.role,
      body
    });

    await message.populate({ path: "senderId", select: "name phone role" });
    res.status(201).json({ ok: true, message: message.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRequest,
  getRequest,
  listMyRequests,
  listOpenRequests: listProviderRequests,
  listProviderRequests,
  acceptRequest,
  updateRequestStatus,
  updateProviderAvailability,
  updateProviderLocation,
  getProviderActiveRequest,
  getProviderHistory,
  getProviderEarnings,
  getRequestMessages,
  requestExtraWork,
  approveExtraWork,
  sendRequestMessage
};
