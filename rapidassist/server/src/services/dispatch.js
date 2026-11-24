const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { DispatchOffer } = require("../models/DispatchOffer");
const { solveAssignment, waitingCostFor } = require("./assignmentSolver");
const { getTravelTimeMatrix } = require("./travelTimeMatrix");
const { createNotificationSafely } = require("./notifications");
const { notifyRequest, notifyUser } = require("./realtime");
const { ensureOperationalLocation } = require("./operationalLocation");
const { isGoogleLocationExpired } = require("./googleLocationPolicy");
const { roleFilter } = require("../utils/accountRoles");

const OFFER_MS = 20000;
const SEARCH_MS = 180000;
const FRESH_MS = 180000;
const BATCH_WINDOW_MS = 2000;
const categoryFor = (category) => category === "car_towing" ? "towing" : category;
const radiusFor = () => 8;
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function withinDispatchRadius(distance, radius) {
  const bypass = process.env.NODE_ENV === "test" && process.env.DISPATCH_TEST_BYPASS_RADIUS === "true";
  return Number.isFinite(distance) && (bypass || distance <= radius);
}

function scoreBreakdown(provider, distance, radius) {
  const count = Math.max(0, provider.ratingCount || 0);
  const rating = ((provider.ratingAvg || 0) * count + 4 * 5) / (count + 5);
  const responseSamples = provider.providerPerformance?.responseSamples || 0;
  const averageResponseSeconds = provider.providerPerformance?.averageResponseSeconds;
  const responseSpeed = responseSamples > 0 && Number.isFinite(averageResponseSeconds)
    ? Math.max(0, Math.min(1, 1 - (averageResponseSeconds - 10) / 110))
    : 0.5;
  const components = {
    proximity: Math.max(0, 1 - distance / radius),
    rating: rating / 5,
    experience: Math.min(1, (provider.completedJobs || 0) / 100),
    responseSpeed
  };
  return {
    components,
    score: 100 * (
      0.45 * components.proximity +
      0.25 * components.rating +
      0.15 * components.experience +
      0.15 * components.responseSpeed
    )
  };
}

function scoreProvider(provider, distance, radius) {
  return scoreBreakdown(provider, distance, radius).score;
}

function isFreshProviderLocation(location, now = new Date()) {
  const cutoff = new Date(+now - FRESH_MS);
  return location?.updatedAt >= cutoff && (location.capturedAt == null || location.capturedAt >= cutoff);
}

function baseEligibleQuery(category, now = new Date()) {
  const cutoff = new Date(+now - FRESH_MS);
  return {
    $and: [roleFilter("mechanic"), { $or: [
      { "providerState.currentLocation.capturedAt": null },
      { "providerState.currentLocation.capturedAt": { $gte: cutoff } }
    ] }],
    verificationStatus: "verified",
    ...(category ? { "mechanicProfile.serviceCategory": categoryFor(category) } : {}),
    "providerState.isOnline": true,
    "providerState.activeRequestId": null,
    "providerState.currentLocation.updatedAt": { $gte: cutoff }
  };
}

function reservationAvailable(now = new Date()) {
  return {
    $or: [
      { "providerState.reservedOfferId": null },
      { "providerState.reservedOfferId": { $exists: false } },
      { "providerState.reservedUntil": { $lte: now } }
    ]
  };
}

function eligibleQuery(category, now = new Date()) {
  return { ...baseEligibleQuery(category, now), ...reservationAvailable(now) };
}

async function recordOffer(request, selected, offerId, batchId, offeredAt, expiresAt) {
  const scoring = scoreBreakdown(selected.provider, selected.distanceKm, request.dispatch.radiusKm);
  await DispatchOffer.updateOne(
    { offerId },
    { $setOnInsert: {
      requestId: request._id,
      providerId: selected.provider._id,
      offerId,
      algorithmVersion: "batch-mincost-v1",
      batchId,
      priority: request.priority || "normal",
      distanceKm: selected.distanceKm,
      routeDistanceKm: selected.routeDistanceKm,
      travelDurationSeconds: selected.durationSeconds,
      routeSource: selected.source,
      assignmentCost: selected.cost,
      waitingCost: waitingCostFor(request, offeredAt),
      baselineNearestDistanceKm: selected.baselineNearestDistanceKm,
      score: scoring.score,
      components: scoring.components,
      offeredAt,
      expiresAt,
      outcome: "offered"
    } },
    { upsert: true }
  );
}

async function refreshResponseMetrics(providerId) {
  const [summary] = await DispatchOffer.aggregate([
    { $match: { providerId: providerId instanceof mongoose.Types.ObjectId ? providerId : new mongoose.Types.ObjectId(providerId), outcome: { $in: ["accepted", "declined"] } } },
    { $group: { _id: null, average: { $avg: "$responseSeconds" }, samples: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ["$outcome", "accepted"] }, 1, 0] } }, declined: { $sum: { $cond: [{ $eq: ["$outcome", "declined"] }, 1, 0] } } } }
  ]);
  await User.updateOne({ _id: providerId }, { $set: {
    "providerPerformance.averageResponseSeconds": summary?.average ?? null,
    "providerPerformance.responseSamples": summary?.samples || 0,
    "providerPerformance.acceptedOffers": summary?.accepted || 0,
    "providerPerformance.declinedOffers": summary?.declined || 0
  } });
}

async function resolveOffer(offerId, outcome, respondedAt = new Date()) {
  if (!offerId) return;
  const offer = await DispatchOffer.findOneAndUpdate(
    { offerId, outcome: "offered" },
    { $set: { outcome, respondedAt, responseSeconds: 0 } },
    { new: true }
  );
  if (!offer) return;
  offer.responseSeconds = Math.max(0, (respondedAt.getTime() - offer.offeredAt.getTime()) / 1000);
  await offer.save();
  if (["accepted", "declined"].includes(outcome)) await refreshResponseMetrics(offer.providerId);
}

async function releaseOfferReservation(providerId, offerId) {
  if (!providerId || !offerId) return;
  await User.updateOne(
    { _id: providerId, "providerState.reservedOfferId": offerId },
    { $set: {
      "providerState.reservedRequestId": null,
      "providerState.reservedOfferId": null,
      "providerState.reservedUntil": null
    } }
  );
}

function newDispatch(_category, now = new Date()) {
  return {
    enabled: true,
    state: "searching",
    version: 0,
    deadline: new Date(+now + SEARCH_MS),
    nextAttemptAt: now,
    radiusKm: radiusFor(),
    attemptedProviderIds: []
  };
}

function providerStillOwnsOffer(provider, request, now) {
  // acceptOffer atomically changes the provider from reserved to claimed before
  // committing the request. Reconciliation must preserve that intermediate state.
  // The caller still enforces offer expiry, and acceptance checks cancellation.
  if (provider?.providerState?.activeRequestId
    && String(provider.providerState.activeRequestId) === String(request._id)) return true;
  return Boolean(
    provider
    && provider.verificationStatus === "verified"
    && provider.providerState?.isOnline
    && !provider.providerState?.activeRequestId
    && categoryFor(request.category) === provider.mechanicProfile?.serviceCategory
    && isFreshProviderLocation(provider.providerState?.currentLocation, now)
    && provider.providerState?.reservedOfferId === request.dispatch.offerId
    && String(provider.providerState?.reservedRequestId) === String(request._id)
    && provider.providerState?.reservedUntil > now
  );
}

async function reconcileOffers(now) {
  const offered = await ServiceRequest.find({
    "dispatch.enabled": true,
    status: "searching_provider",
    "dispatch.state": "offered"
  });
  for (const request of offered) {
    const provider = request.dispatch.offeredProviderId ? await User.findById(request.dispatch.offeredProviderId) : null;
    if (request.dispatch.expiresAt > now && providerStillOwnsOffer(provider, request, now)) continue;
    const outcome = request.dispatch.expiresAt <= now ? "expired" : "withdrawn";
    const unavailable = request.dispatch.deadline <= now;
    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: request._id, status: "searching_provider", "dispatch.state": "offered", "dispatch.offerId": request.dispatch.offerId },
      { $set: {
        "dispatch.state": unavailable ? "unavailable" : "searching",
        "dispatch.offerId": null,
        "dispatch.offeredProviderId": null,
        "dispatch.expiresAt": null,
        "dispatch.nextAttemptAt": unavailable ? null : now
      }, $inc: { "dispatch.version": 1 } },
      { new: true }
    );
    if (updated) {
      await releaseOfferReservation(request.dispatch.offeredProviderId, request.dispatch.offerId);
      await resolveOffer(request.dispatch.offerId, outcome, now);
      notifyUser(request.dispatch.offeredProviderId, { requestId: request.id, kind: outcome === "expired" ? "offer-expired" : "offer-withdrawn" });
      notifyRequest(updated, "dispatch");
    }
  }
}

async function expireSearches(now) {
  const expired = await ServiceRequest.find({
    "dispatch.enabled": true,
    status: "searching_provider",
    "dispatch.state": "searching",
    "dispatch.deadline": { $lte: now }
  });
  for (const request of expired) {
    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: request._id, "dispatch.state": "searching", "dispatch.version": request.dispatch.version },
      { $set: { "dispatch.state": "unavailable", "dispatch.nextAttemptAt": null }, $inc: { "dispatch.version": 1 } },
      { new: true }
    );
    if (updated) notifyRequest(updated, "dispatch");
  }
}

// ---------------------------------------------------------------------------
// Diagnostics: why a searching request found nobody. Mirrors eligibleQuery() + candidatePairs() condition by
// condition. On by default in development; in production/test only with DISPATCH_DEBUG=true. Provider ids only.
const DIAGNOSTIC_INTERVAL_MS = 30000;
const lastDiagnostic = new Map();
const diagnosticsEnabled = () => process.env.DISPATCH_DEBUG === "true"
  || (process.env.DISPATCH_DEBUG !== "false" && !["production", "test"].includes(process.env.NODE_ENV));
const ageSeconds = (date, now) => Math.round((+now - +new Date(date)) / 1000);

/** Every reason this provider cannot be offered this request right now; an empty list means eligible. */
function exclusionReasons(provider, request, now = new Date()) {
  const reasons = [];
  const state = provider.providerState || {};
  const location = state.currentLocation;
  if (provider.id === String(request.userId)) reasons.push("is the customer");
  if (provider.mechanicProfile?.serviceCategory !== categoryFor(request.category)) {
    reasons.push(`category ${provider.mechanicProfile?.serviceCategory ?? "none"} != ${categoryFor(request.category)}`);
  }
  if (provider.verificationStatus !== "verified") reasons.push(`verification ${provider.verificationStatus}`);
  if (!state.isOnline) reasons.push("offline");
  if (state.activeRequestId) reasons.push(`busy with request ${state.activeRequestId}`);
  if (state.reservedOfferId && state.reservedUntil && new Date(state.reservedUntil) > now) reasons.push("reserved for another offer");
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    reasons.push("no location");
  } else {
    const limit = FRESH_MS / 1000;
    if (!location.updatedAt || ageSeconds(location.updatedAt, now) > limit) {
      reasons.push(`location received ${location.updatedAt ? ageSeconds(location.updatedAt, now) + "s" : "never"} ago (max ${limit}s)`);
    }
    if (location.capturedAt && ageSeconds(location.capturedAt, now) > limit) {
      reasons.push(`GPS fix ${ageSeconds(location.capturedAt, now)}s old (max ${limit}s)`);
    }
    const km = distanceKm(request.pickupLocation, location);
    if (!withinDispatchRadius(km, request.dispatch.radiusKm)) reasons.push(`${km.toFixed(1)} km away (radius ${request.dispatch.radiusKm} km)`);
  }
  if ((request.dispatch.attemptedProviderIds || []).map(String).includes(provider.id)) reasons.push("already offered this request");
  return reasons;
}

async function logDispatchDiagnostics(requests, now = new Date()) {
  if (!diagnosticsEnabled()) return;
  for (const request of requests) {
    const last = lastDiagnostic.get(request.id) || 0;
    if (+now - last < DIAGNOSTIC_INTERVAL_MS) continue;
    lastDiagnostic.set(request.id, +now);
    const wanted = categoryFor(request.category);
    const providers = await User.find({ ...roleFilter("mechanic"), "mechanicProfile.serviceCategory": wanted }).limit(25);
    const head = `[dispatch] request ${request.id} ${request.category}->${wanted} radius ${request.dispatch.radiusKm} km: no offer this round`;
    if (!providers.length) {
      const others = await User.countDocuments({ ...roleFilter("mechanic"), "providerState.isOnline": true });
      console.info(`${head}; 0 ${wanted} providers exist (${others} online in other categories)`);
      continue;
    }
    console.info(`${head}; checking ${providers.length} ${wanted} provider(s)`);
    for (const provider of providers) {
      const reasons = exclusionReasons(provider, request, now);
      console.info(`[dispatch]   provider ${provider.id}: ${reasons.length ? "excluded - " + reasons.join("; ") : "eligible (waiting for travel-time/assignment)"}`);
    }
  }
  if (lastDiagnostic.size > 500) lastDiagnostic.clear();
}

function candidatePairs(requests, providers) {
  const pairs = new Map();
  for (const request of requests) {
    if (isGoogleLocationExpired(request.pickupLocation)) continue;
    const attempted = new Set((request.dispatch.attemptedProviderIds || []).map(String));
    const requestPairs = [];
    for (const provider of providers) {
      if (provider.id === String(request.userId)) continue;
      if (provider.mechanicProfile?.serviceCategory !== categoryFor(request.category)) continue;
      if (attempted.has(provider.id)) continue;
      const location = provider.providerState?.currentLocation;
      if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) continue;
      const directDistanceKm = distanceKm(request.pickupLocation, location);
      if (!withinDispatchRadius(directDistanceKm, request.dispatch.radiusKm)) continue;
      const pair = { request, provider, directDistanceKm };
      requestPairs.push(pair);
      pairs.set(`${provider.id}:${request.id}`, pair);
    }
    const baseline = requestPairs.length ? Math.min(...requestPairs.map((pair) => pair.directDistanceKm)) : null;
    requestPairs.forEach((pair) => { pair.baselineNearestDistanceKm = baseline; });
  }
  return pairs;
}

async function createOffer(request, selected, batchId, now) {
  const offerId = randomUUID();
  const expiresAt = new Date(Math.min(+now + OFFER_MS, +request.dispatch.deadline));
  const reserved = await User.findOneAndUpdate(
    { _id: selected.provider._id, ...eligibleQuery(request.category, now) },
    { $set: {
      "providerState.reservedRequestId": request._id,
      "providerState.reservedOfferId": offerId,
      "providerState.reservedUntil": expiresAt
    } },
    { new: true }
  );
  if (!reserved) return null;

  const updated = await ServiceRequest.findOneAndUpdate(
    {
      _id: request._id,
      status: "searching_provider",
      providerId: null,
      "dispatch.state": "searching",
      "dispatch.version": request.dispatch.version,
      "dispatch.deadline": { $gt: now }
    },
    {
      $set: {
        "dispatch.state": "offered",
        "dispatch.offerId": offerId,
        "dispatch.offeredProviderId": reserved._id,
        "dispatch.offeredAt": now,
        "dispatch.expiresAt": expiresAt,
        "dispatch.nextAttemptAt": null
      },
      $inc: { "dispatch.version": 1 },
      $push: { "dispatch.attemptedProviderIds": reserved._id }
    },
    { new: true }
  );
  if (!updated) {
    await releaseOfferReservation(reserved._id, offerId);
    return null;
  }

  await recordOffer(updated, { ...selected, provider: reserved }, offerId, batchId, now, expiresAt);
  createNotificationSafely({
    userId: reserved._id,
    type: "job_offer",
    title: "New roadside job",
    body: `A ${String(updated.category).replaceAll("_", " ")} request is available nearby.`,
    data: { requestId: updated.id, route: "/(provider)/requests", offerId }
  });
  notifyRequest(updated, "offer");
  return updated;
}

async function runDispatchBatchCore(now = new Date()) {
  await reconcileOffers(now);
  await expireSearches(now);
  const pendingRequests = await ServiceRequest.find({
    "dispatch.enabled": true,
    status: "searching_provider",
    providerId: null,
    "dispatch.state": "searching",
    // Retry delays on individual requests must not hide urgent work from a batch.
    // The worker's shared interval throttles rounds for all requests together.
    "dispatch.deadline": { $gt: now }
  }).sort({ priority: -1, createdAt: 1 });
  if (!pendingRequests.length) return { assignments: [], unassignedRequestIds: [], totalCost: 0 };
  const requests = [];
  const unavailableRequestIds = [];
  for (const request of pendingRequests) {
    try {
      requests.push(request.pickupLocation?.source === "google_places" ? await ensureOperationalLocation(request.id, "pickupLocation") : request);
    } catch (error) {
      unavailableRequestIds.push(request.id);
      console.warn("Dispatch location unavailable:", request.id, error.message);
    }
  }
  if (!requests.length) return { assignments: [], unassignedRequestIds: unavailableRequestIds, totalCost: 0 };

  const providers = await User.find(eligibleQuery(null, now));
  if (!providers.length) {
    await logDispatchDiagnostics(requests, now).catch((error) => console.warn("Dispatch diagnostics failed:", error.message));
    return { assignments: [], unassignedRequestIds: [...unavailableRequestIds, ...requests.map((request) => request.id)], totalCost: 0 };
  }

  const pairs = candidatePairs(requests, providers);
  const rawMatrix = await getTravelTimeMatrix(providers, requests);
  const travelTimes = new Map();
  pairs.forEach((pair, key) => {
    const travel = rawMatrix.get(key);
    if (travel) travelTimes.set(key, travel);
  });
  const solution = solveAssignment({ requests, providers, travelTimes, now });
  const batchId = randomUUID();

  for (const assignment of solution.assignments) {
    const pair = pairs.get(`${assignment.providerId}:${assignment.requestId}`);
    if (!pair) continue;
    const distanceFromRoute = Number.isFinite(assignment.distanceMeters) ? assignment.distanceMeters / 1000 : null;
    await createOffer(pair.request, {
      provider: pair.provider,
      durationSeconds: assignment.durationSeconds,
      cost: assignment.cost,
      source: assignment.source,
      distanceKm: pair.directDistanceKm,
      routeDistanceKm: distanceFromRoute,
      baselineNearestDistanceKm: pair.baselineNearestDistanceKm
    }, batchId, now);
  }

  const offered = new Set(solution.assignments.map((assignment) => String(assignment.requestId)));
  await logDispatchDiagnostics(requests.filter((request) => !offered.has(request.id)), now)
    .catch((error) => console.warn("Dispatch diagnostics failed:", error.message));
  return { ...solution, unassignedRequestIds: [...solution.unassignedRequestIds, ...unavailableRequestIds], batchId };
}

let activeBatch = null;
function runDispatchBatch(now = new Date()) {
  if (activeBatch) return activeBatch;
  activeBatch = runDispatchBatchCore(now).finally(() => { activeBatch = null; });
  return activeBatch;
}

async function advanceDispatch(id, now = new Date()) {
  await runDispatchBatch(now);
  return ServiceRequest.findById(id);
}

async function acceptOffer(id, providerId, offerId) {
  const existing = await ServiceRequest.findById(id);
  if (!existing || String(existing.userId) === String(providerId)) throw conflict("Request is no longer available.");
  if (String(existing.providerId) === String(providerId) && existing.assignmentActive) return existing;
  if (!offerId || existing.dispatch?.offerId !== offerId || String(existing.dispatch.offeredProviderId) !== String(providerId)) {
    throw conflict("This offer is no longer available to you.");
  }
  const now = new Date();
  if (existing.status !== "searching_provider" || existing.dispatch.expiresAt <= now) throw conflict("This offer has expired.");

  const provider = await User.findOneAndUpdate({
    _id: providerId,
    ...baseEligibleQuery(existing.category, now),
    "providerState.reservedRequestId": existing._id,
    "providerState.reservedOfferId": offerId,
    "providerState.reservedUntil": { $gt: now }
  }, { $set: {
    "providerState.activeRequestId": id,
    "providerState.claimedAt": now,
    "providerState.reservedRequestId": null,
    "providerState.reservedOfferId": null,
    "providerState.reservedUntil": null
  } }, { new: true });
  if (!provider) throw conflict("You must own a current offer and be verified, online, and available to accept.");

  let updated;
  try {
    updated = await ServiceRequest.findOneAndUpdate({
      _id: id,
      status: "searching_provider",
      providerId: null,
      "dispatch.state": "offered",
      "dispatch.offerId": offerId,
      "dispatch.offeredProviderId": providerId,
      "dispatch.expiresAt": { $gt: new Date() }
    }, {
      $set: {
        providerId,
        assignmentActive: true,
        acceptedAt: now,
        status: "provider_assigned",
        "dispatch.state": "assigned",
        "dispatch.expiresAt": null
      },
      $inc: { "dispatch.version": 1 },
      $push: { statusTimeline: { status: "provider_assigned", byUserId: providerId, at: now, note: "Provider accepted optimized batch offer" } }
    }, { new: true });
    if (!updated) throw conflict("Offer expired or request changed. Refresh for the next offer.");
  } catch (error) {
    const committed = await ServiceRequest.findOne({ _id: id, providerId, assignmentActive: true });
    if (committed) updated = committed;
    else {
      await User.updateOne(
        { _id: providerId, "providerState.activeRequestId": id },
        { $set: { "providerState.activeRequestId": null, "providerState.claimedAt": null } }
      );
      throw error.code === 11000 ? conflict("You already have an active job.") : error;
    }
  }
  notifyRequest(updated, "assigned");
  createNotificationSafely({
    userId: updated.userId,
    type: "request_accepted",
    title: "Provider confirmed",
    body: "Your optimized provider match accepted the request. Live tracking is ready.",
    data: { requestId: updated.id, route: "/(user)/tracking" }
  });
  await resolveOffer(offerId, "accepted", now);
  return updated;
}

async function declineOffer(id, providerId, offerId) {
  if (!offerId) throw conflict("Offer ID is required.");
  const request = await ServiceRequest.findOneAndUpdate({
    _id: id,
    status: "searching_provider",
    "dispatch.state": "offered",
    "dispatch.offeredProviderId": providerId,
    "dispatch.offerId": offerId,
    "dispatch.expiresAt": { $gt: new Date() }
  }, {
    $set: {
      "dispatch.state": "searching",
      "dispatch.offerId": null,
      "dispatch.offeredProviderId": null,
      "dispatch.expiresAt": null,
      "dispatch.nextAttemptAt": new Date()
    },
    $inc: { "dispatch.version": 1 }
  }, { new: true });
  if (!request) throw conflict("Offer has expired or was already handled.");
  await releaseOfferReservation(providerId, offerId);
  await resolveOffer(offerId, "declined", new Date());
  notifyUser(providerId, { requestId: String(id), kind: "declined" });
  notifyRequest(request, "dispatch");
}

async function cancelDispatchOffer(request, now = new Date()) {
  const offerId = request?.dispatch?.offerId;
  const providerId = request?.dispatch?.offeredProviderId;
  if (!offerId || !providerId) return;
  await releaseOfferReservation(providerId, offerId);
  await resolveOffer(offerId, "withdrawn", now);
  notifyUser(providerId, { requestId: request.id, kind: "offer-withdrawn" });
}

async function recoverReservations(now = new Date()) {
  const claims = await User.find({
    "providerState.activeRequestId": { $ne: null },
    "providerState.claimedAt": { $lt: new Date(+now - 30000) }
  });
  for (const provider of claims) {
    const id = provider.providerState.activeRequestId;
    const request = await ServiceRequest.findOne({ _id: id, providerId: provider._id, status: { $nin: ["completed", "cancelled"] } });
    if (!request) {
      await User.updateOne(
        { _id: provider._id, "providerState.activeRequestId": id, "providerState.claimedAt": provider.providerState.claimedAt },
        { $set: { "providerState.activeRequestId": null, "providerState.claimedAt": null } }
      );
    }
  }

  const offerReservations = await User.find({ "providerState.reservedOfferId": { $ne: null } });
  for (const provider of offerReservations) {
    const request = await ServiceRequest.findOne({
      _id: provider.providerState.reservedRequestId,
      status: "searching_provider",
      "dispatch.state": "offered",
      "dispatch.offerId": provider.providerState.reservedOfferId,
      "dispatch.expiresAt": { $gt: now }
    });
    if (!request) await releaseOfferReservation(provider._id, provider.providerState.reservedOfferId);
  }
}

function startDispatchWorker() {
  let running = null;
  let ticks = 0;
  const tick = () => {
    if (running) return;
    running = (async () => {
      try {
        if (ticks++ % 15 === 0) await recoverReservations();
        await runDispatchBatch();
      } catch (error) {
        console.error("Dispatch worker:", error.message);
      }
    })().finally(() => { running = null; });
  };
  // Only this worker dispatches in production. Persisted state changes are picked
  // up together on the next shared tick, including after a server restart.
  const timer = setInterval(tick, BATCH_WINDOW_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}

module.exports = {
  OFFER_MS,
  acceptOffer,
  advanceDispatch,
  cancelDispatchOffer,
  declineOffer,
  distanceKm,
  eligibleQuery,
  isFreshProviderLocation,
  exclusionReasons,
  newDispatch,
  radiusFor,
  recoverReservations,
  runDispatchBatch,
  scoreProvider,
  startDispatchWorker,
  withinDispatchRadius
};
