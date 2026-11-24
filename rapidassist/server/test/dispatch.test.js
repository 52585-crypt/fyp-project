const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { io: connectSocket } = require("socket.io-client");
const { createApp } = require("../src/app");
const { attachRealtime } = require("../src/services/realtime");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { DispatchOffer } = require("../src/models/DispatchOffer");
const { Invoice } = require("../src/models/Invoice");
const { Payment } = require("../src/models/Payment");
const { PaymentAttempt } = require("../src/models/PaymentAttempt");
const { ChatMessage } = require("../src/models/ChatMessage");
const { Notification } = require("../src/models/Notification");
const { DeviceToken } = require("../src/models/DeviceToken");
const { signAccessToken } = require("../src/utils/jwt");
const { newDispatch, advanceDispatch, acceptOffer, declineOffer, recoverReservations, runDispatchBatch, startDispatchWorker, distanceKm, withinDispatchRadius, exclusionReasons, isFreshProviderLocation } = require("../src/services/dispatch");
const { ensureOperationalLocation } = require("../src/services/operationalLocation");
const { fallbackBlock } = require("../src/services/travelTimeMatrix");
const { cleanupGoogleLocations } = require("../src/services/googleLocationCleanup");

process.env.JWT_SECRET = "isolated-dispatch-test-secret";
process.env.NODE_ENV = "test";
delete process.env.DISPATCH_TEST_BYPASS_RADIUS;
let db, server, realtime, base, customer, sequence = 0;
const pickup = { lat: 31.52, lng: 74.35, addressText: "Test pickup" };
async function provider(overrides = {}) {
  return User.create({ name: "Test provider", phone: `provider-${++sequence}`, passwordHash: "test-only", role: "mechanic", verificationStatus: "verified", ratingAvg: 4.8, ratingCount: 10, completedJobs: 40,
    mechanicProfile: { serviceCategory: "mechanic" },
    providerState: { isOnline: true, currentLocation: { ...pickup, lat: 31.521, updatedAt: new Date() }, lastSeenAt: new Date() }, ...overrides });
}
async function request() {
  return ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: pickup, dispatch: newDispatch("mechanic"), estimate: { currency: "PKR", total: 1250 }, status: "searching_provider" });
}
async function api(actor, path, method = "GET", body, origin, activeRole) {
  const auth = actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id, role: activeRole })}` } : {};
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...auth, ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
async function socketFor(actor) {
  const socket = connectSocket(base, { auth: { token: signAccessToken({ sub: actor.id }) }, transports: ["websocket"], forceNew: true });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  return socket;
}
function withRadiusBypass(t) {
  const previous = process.env.DISPATCH_TEST_BYPASS_RADIUS;
  process.env.DISPATCH_TEST_BYPASS_RADIUS = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.DISPATCH_TEST_BYPASS_RADIUS;
    else process.env.DISPATCH_TEST_BYPASS_RADIUS = previous;
  });
}

function mockRadiusTestRouting(t) {
  const originalFetch = global.fetch;
  t.mock.method(global, "fetch", (url, options) => {
    if (String(url).startsWith(base + "/")) return originalFetch(url, options);
    if (String(url).includes("/route/v1/")) {
      return Promise.resolve(Response.json({ code: "Ok", routes: [{ distance: 2500, duration: 300 }] }));
    }
    return Promise.reject(new Error("Use the dispatch matrix fallback in this test."));
  });
}

function equatorialLocation(distance) {
  return { lat: 0, lng: distance / (6371 * (Math.PI / 180)), updatedAt: new Date() };
}

function radiusTestRequest(category) {
  return {
    category, pickupLocation: { lat: 0, lng: 0 },
    destinationLocation: { lat: 0, lng: 0.02 }, mechanicDetails: { issueCategory: "tyre" },
    fuelDetails: { fuelType: "petrol", liters: 5 }, vehicleInfo: { type: "car", model: "Test car" }
  };
}

async function waitForOffer(id) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const job = await ServiceRequest.findById(id);
    if (job.dispatch.state === "offered") return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Expected a dispatch offer from the next worker round");
}
describe("Smart roadside dispatch (isolated real MongoDB)", { concurrency: false }, () => {
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_dispatch_test" });
    await Promise.all([User.init(), ServiceRequest.init()]);
    server = createServer(createApp()); realtime = attachRealtime(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}), ServiceRequest.deleteMany({}), DispatchOffer.deleteMany({}), Invoice.deleteMany({}),
      Payment.deleteMany({}), PaymentAttempt.deleteMany({}), ChatMessage.deleteMany({}),
      Notification.deleteMany({}), DeviceToken.deleteMany({})
    ]);
    customer = await User.create({ name: "Test customer", phone: "customer", passwordHash: "test-only", role: "user" });
  });
  after(async () => { if (realtime) await new Promise((resolve) => realtime.close(resolve)); await mongoose.disconnect(); if (db) await db.stop(); });

  it("cleans expired Google locations independently and protects customer, provider and admin history", async () => {
    const p = await provider();
    const admin = await User.create({ name: "Admin", phone: "admin", passwordHash: "test-only", role: "admin" });
    const job = await request();
    const old = new Date(Date.now() - 31 * 86400000);
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { providerId: p._id, status: "provider_assigned", pickupLocation: { ...pickup, source: "google_places", placeId: "pickup-id", googleContentCachedAt: old }, destinationLocation: { ...pickup, source: "photon" } } });
    const adminLiveJobs = await api(admin, "/api/admin/active-jobs");
    assert.equal(adminLiveJobs.data.jobs[0].pickupLocation.lat, null);
    assert.equal(adminLiveJobs.data.jobs[0].pickupLocation.addressText, null);
    assert.equal(adminLiveJobs.data.jobs[0].pickupLocation.placeId, "pickup-id");
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { status: "completed" } });
    const customerHistory = await api(customer, "/api/requests");
    const providerHistory = await api(p, "/api/requests/provider/history");
    const adminDashboard = await api(admin, "/api/admin/dashboard");
    for (const value of [customerHistory.data.requests[0], providerHistory.data.requests[0], adminDashboard.data.recentRequests[0]]) {
      assert.equal(value.pickupLocation.lat, null);
      assert.equal(value.pickupLocation.addressText, null);
      assert.equal(value.pickupLocation.placeId, "pickup-id");
      assert.equal(value.destinationLocation.lat, pickup.lat);
    }
    await cleanupGoogleLocations();
    await cleanupGoogleLocations();
    const cleaned = await ServiceRequest.findById(job.id);
    assert.equal(cleaned.pickupLocation.lat, undefined);
    assert.equal(cleaned.pickupLocation.lng, undefined);
    assert.equal(cleaned.pickupLocation.placeId, "pickup-id");
    assert.equal(cleaned.destinationLocation.lat, pickup.lat);
    const second = await request();
    await ServiceRequest.updateOne({ _id: second._id }, { $set: { destinationLocation: { ...pickup, source: "google_places", placeId: "dropoff-id", googleContentCachedAt: old } } });
    await cleanupGoogleLocations();
    const secondCleaned = await ServiceRequest.findById(second.id);
    assert.equal(secondCleaned.pickupLocation.lat, pickup.lat);
    assert.equal(secondCleaned.destinationLocation.lat, undefined);
    assert.equal(secondCleaned.destinationLocation.placeId, "dropoff-id");

    const untouched = await Promise.all([
      ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: { ...pickup, source: "gps" } }),
      ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: { ...pickup, source: "manual_map" } }),
      ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: { ...pickup, source: "photon" } }),
      ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: pickup })
    ]);
    await cleanupGoogleLocations();
    for (const original of untouched) {
      const saved = await ServiceRequest.findById(original.id);
      assert.equal(saved.pickupLocation.lat, pickup.lat);
      assert.equal(saved.pickupLocation.lng, pickup.lng);
      assert.equal(saved.pickupLocation.addressText, pickup.addressText);
    }
  });

  it("cleans an expired location, hides it in history, refreshes it and dispatches with fresh coordinates", async (t) => {
    const job = await request();
    const p = await provider();
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { pickupLocation: { ...pickup, source: "google_places", placeId: "lifecycle-id", googleContentCachedAt: new Date(Date.now() - 31 * 86400000) } } });
    await cleanupGoogleLocations();
    const history = await api(customer, "/api/requests");
    assert.equal(history.data.requests[0].pickupLocation.lat, null);
    assert.equal(history.data.requests[0].pickupLocation.placeId, "lifecycle-id");
    const originalFetch = global.fetch;
    const previousKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-only";
    t.mock.method(global, "fetch", async (url, options) => String(url).startsWith(base) ? originalFetch(url, options) : ({ ok: true, json: async () => ({ id: "lifecycle-id", location: { latitude: 31.52, longitude: 74.35 } }) }));
    try {
      const refreshed = await api(customer, `/api/requests/${job.id}/location/pickup/refresh`, "POST", {});
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.data.request.pickupLocation.lat, 31.52);
      assert.ok(new Date(refreshed.data.request.pickupLocation.googleContentCachedAt).getTime() > Date.now() - 60000);
      const persisted = await ServiceRequest.findById(job.id);
      assert.equal(fallbackBlock([p], [persisted]).size, 1);
      await runDispatchBatch();
      assert.equal(String((await ServiceRequest.findById(job.id)).dispatch.offeredProviderId), p.id);
    } finally {
      if (previousKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
      else process.env.GOOGLE_MAPS_SERVER_API_KEY = previousKey;
    }
  });

  it("refreshes an expired Google location and never routes or falls back to stale coordinates", async () => {
    const job = await request();
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { pickupLocation: { ...pickup, source: "google_places", placeId: "place-123", googleContentCachedAt: new Date("2000-01-01") } } });
    const expired = await ServiceRequest.findById(job.id);
    const p = await provider();
    assert.equal(fallbackBlock([p], [expired]).size, 0);
    await assert.rejects(ensureOperationalLocation(job.id, "pickupLocation", { resolve: async () => { throw new Error("offline"); } }), /offline/);
    const removed = await ServiceRequest.findById(job.id);
    assert.equal(removed.pickupLocation.lat, undefined);
    assert.equal(removed.pickupLocation.placeId, "place-123");
    const refreshed = await ensureOperationalLocation(job.id, "pickupLocation", { resolve: async (id) => ({ source: "google_places", placeId: id, lat: 31.53, lng: 74.36 }) });
    assert.equal(refreshed.pickupLocation.lat, 31.53);
    assert.equal(fallbackBlock([p], [refreshed]).size, 1);
    const again = await ensureOperationalLocation(job.id, "pickupLocation", { resolve: async () => { throw new Error("unnecessary lookup"); } });
    assert.equal(again.pickupLocation.lat, 31.53);
  });

  it("requires request authorization before refreshing a stored location", async () => {
    const job = await request();
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { pickupLocation: { ...pickup, source: "google_places", placeId: "place-123", googleContentCachedAt: new Date("2000-01-01") } } });
    const stranger = await User.create({ name: "Other", phone: "other", passwordHash: "test-only", role: "user" });
    const denied = await api(stranger, `/api/requests/${job.id}/location/pickup/refresh`, "POST", { placeId: "attacker-value" });
    assert.equal(denied.status, 403);
    assert.equal((await ServiceRequest.findById(job.id)).pickupLocation.placeId, "place-123");
    const p = await provider();
    const admin = await User.create({ name: "Admin", phone: "refresh-admin", passwordHash: "test-only", role: "admin" });
    await ServiceRequest.updateOne({ _id: job.id }, { $set: { providerId: p._id, "pickupLocation.googleContentCachedAt": new Date() } });
    assert.equal((await api(p, `/api/requests/${job.id}/location/pickup/refresh`, "POST", { placeId: "ignored" })).status, 200);
    assert.equal((await api(admin, `/api/requests/${job.id}/location/pickup/refresh`, "POST", { placeId: "ignored" })).status, 200);
    assert.equal((await ServiceRequest.findById(job.id)).pickupLocation.placeId, "place-123");
  });

  it("exposes a narrow authenticated Places session from autocomplete through selection", async (t) => {
    const originalFetch = global.fetch;
    const previousKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-only";
    const googleCalls = [];
    let startSelection, releaseSelection;
    const selectionStarted = new Promise(resolve => { startSelection = resolve; });
    const selectionReleased = new Promise(resolve => { releaseSelection = resolve; });
    let detailCalls = 0;
    t.mock.method(global, "fetch", async (url, options) => {
      if (String(url).startsWith(base)) return originalFetch(url, options);
      googleCalls.push({ url: String(url), options });
      if (String(url).endsWith("places:autocomplete")) return { ok: true, json: async () => ({ suggestions: [{ placePrediction: {
        placeId: "place-1",
        structuredFormat: { mainText: { text: "Faisal Mosque" }, secondaryText: { text: "Islamabad" } }
      } }] }) };
      detailCalls += 1;
      if (detailCalls === 1) return { ok: false };
      if (detailCalls === 2) {
        startSelection();
        await selectionReleased;
      }
      return { ok: true, json: async () => ({ id: "place-1", location: { latitude: 33.7294, longitude: 73.0372 }, formattedAddress: "Faisal Mosque, Islamabad" }) };
    });
    try {
      const unauthorized = await originalFetch(`${base}/api/locations/autocomplete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: "Faisal", sessionToken: "session-token-0001" }) });
      assert.equal(unauthorized.status, 401);
      const predictions = await api(customer, "/api/locations/autocomplete", "POST", { input: "Faisal", sessionToken: "session-token-0001", near: { latitude: 33.7, longitude: 73.1 } });
      assert.equal(predictions.status, 200);
      assert.deepEqual(predictions.data.suggestions, [{ provider: "google_places", id: "place-1", primaryText: "Faisal Mosque", secondaryText: "Islamabad" }]);
      const arbitrary = await api(customer, "/api/locations/details", "POST", { placeId: "other-place", sessionToken: "session-token-0001" });
      assert.equal(arbitrary.status, 400);
      const validSelection = { placeId: "place-1", sessionToken: "session-token-0001" };
      const unauthorizedDetails = await originalFetch(`${base}/api/locations/details`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validSelection)
      });
      assert.equal(unauthorizedDetails.status, 401);
      assert.equal(detailCalls, 0);
      const upstreamFailure = await api(customer, "/api/locations/details", "POST", validSelection);
      assert.equal(upstreamFailure.status, 503);
      const selecting = api(customer, "/api/locations/details", "POST", validSelection);
      try {
        await Promise.race([selectionStarted, selecting.then(() => assert.fail("Expected a pending Google Details lookup"))]);
        const concurrent = await api(customer, "/api/locations/details", "POST", validSelection);
        assert.equal(concurrent.status, 400);
      } finally {
        releaseSelection();
      }
      const selected = await selecting;
      assert.equal(selected.status, 200);
      assert.equal(selected.data.location.latitude, 33.7294);
      const reused = await api(customer, "/api/locations/details", "POST", { placeId: "place-1", sessionToken: "session-token-0001" });
      assert.equal(reused.status, 400);
      assert.equal(googleCalls.length, 3);
      assert.match(googleCalls[2].url, /sessionToken=session-token-0001$/);
    } finally {
      if (previousKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
      else process.env.GOOGLE_MAPS_SERVER_API_KEY = previousKey;
    }
  });

  it("rejects expired Places selections and starts fresh without stale suggestions", async (t) => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const originalFetch = global.fetch;
    const previousKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-only";
    let searches = 0, details = 0;
    t.mock.method(global, "fetch", async (url, options) => {
      if (String(url).startsWith(base)) return originalFetch(url, options);
      if (String(url).endsWith("places:autocomplete")) {
        const placeId = searches++ === 0 ? "expired-place" : "fresh-place";
        return { ok: true, json: async () => ({ suggestions: [{ placePrediction: {
          placeId, structuredFormat: { mainText: { text: "Test suggestion" } }
        } }] }) };
      }
      details += 1;
      return { ok: true, json: async () => ({ id: "fresh-place", location: { latitude: 33.7, longitude: 73.1 } }) };
    });
    const origin = "http://localhost:8081";
    const sessionToken = "session-expiry-0001";
    const search = () => api(customer, "/api/locations/autocomplete", "POST", { input: "Faisal", sessionToken }, origin);
    const select = placeId => api(customer, "/api/locations/details", "POST", { placeId, sessionToken }, origin);
    try {
      assert.equal((await search()).status, 200);
      now += 3 * 60 * 1000;
      assert.equal((await select("expired-place")).status, 400);
      assert.equal(details, 0);
      assert.equal((await search()).status, 200);
      assert.equal((await select("expired-place")).status, 400);
      assert.equal((await select("fresh-place")).status, 200);
      assert.equal(details, 1);
    } finally {
      if (previousKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
      else process.env.GOOGLE_MAPS_SERVER_API_KEY = previousKey;
    }
  });

  it("refreshes a towing destination without modifying the pickup", async () => {
    const job = await request();
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { category: "car_towing", destinationLocation: { lat: 31.4, lng: 74.2, source: "google_places", placeId: "dropoff", googleContentCachedAt: new Date("2000-01-01") } } });
    const updated = await ensureOperationalLocation(job.id, "destinationLocation", { resolve: async (id) => ({ source: "google_places", placeId: id, lat: 31.45, lng: 74.25 }) });
    assert.equal(updated.pickupLocation.lat, pickup.lat);
    assert.equal(updated.destinationLocation.lat, 31.45);
  });

  it("dispatch never matches an expired Google pickup when refresh fails, and uses a successful refresh", async (t) => {
    const job = await request();
    const p = await provider();
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { pickupLocation: { ...pickup, source: "google_places", placeId: "place-123", googleContentCachedAt: new Date("2000-01-01") } } });
    const previousKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-only";
    let succeeds = false;
    t.mock.method(global, "fetch", async () => succeeds
      ? { ok: true, json: async () => ({ id: "place-123", location: { latitude: 31.52, longitude: 74.35 } }) }
      : { ok: false });
    try {
      const failed = await runDispatchBatch();
      assert.equal(failed.assignments.length, 0);
      assert.equal((await ServiceRequest.findById(job.id)).pickupLocation.lat, undefined);
      succeeds = true;
      await runDispatchBatch();
      const refreshed = await ServiceRequest.findById(job.id);
      assert.equal(refreshed.pickupLocation.lat, 31.52);
      assert.equal(String(refreshed.dispatch.offeredProviderId), p.id);
    } finally {
      if (previousKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
      else process.env.GOOGLE_MAPS_SERVER_API_KEY = previousKey;
    }
  });

  it("preserves non-Google location provenance and accepts older payloads", async () => {
    const body = { category: "mechanic", mechanicDetails: { issueCategory: "tyre" } };
    const legacy = await api(customer, "/api/requests", "POST", { ...body, pickupLocation: pickup });
    assert.equal(legacy.status, 201);
    assert.equal(legacy.data.request.pickupLocation.source, null);
    const sourced = await api(customer, "/api/requests", "POST", { ...body, pickupLocation: { ...pickup, source: "gps" } });
    assert.equal(sourced.status, 201);
    assert.equal(sourced.data.request.pickupLocation.source, "gps");
    assert.equal((await ServiceRequest.findById(sourced.data.request.id)).pickupLocation.source, "gps");
    const google = await api(customer, "/api/requests", "POST", { ...body, pickupLocation: { ...pickup, source: "google_places", placeId: "example" } });
    assert.equal(google.status, 400);
    assert.equal(await ServiceRequest.countDocuments({ "pickupLocation.source": "google_places" }), 0);
  });

  it("regression: API requests wait for the worker and compete in the same batch", async () => {
    const p = await provider();
    const body = { category: "mechanic", pickupLocation: pickup, mechanicDetails: { issueCategory: "tyre" } };
    const normal = await api(customer, "/api/requests", "POST", { ...body, priority: "normal" });
    const urgent = await api(customer, "/api/requests", "POST", { ...body, priority: "urgent", pickupLocation: { ...pickup, lat: 31.535 } });
    assert.equal(normal.status, 201);
    assert.equal(urgent.status, 201);
    assert.equal(normal.data.request.dispatch.state, "searching");
    assert.equal(urgent.data.request.dispatch.state, "searching");
    assert.equal(await DispatchOffer.countDocuments({}), 0);

    const stop = startDispatchWorker();
    try {
      // Allow the worker's asynchronous startup to settle: it must collect a batch first.
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await DispatchOffer.countDocuments({}), 0);
      const offer = await waitForOffer(urgent.data.request.id);
      assert.equal(String(offer.dispatch.offeredProviderId), p.id);
      assert.equal((await ServiceRequest.findById(normal.data.request.id)).dispatch.state, "searching");
      await declineOffer(offer.id, p.id, offer.dispatch.offerId);
      assert.equal((await ServiceRequest.findById(normal.data.request.id)).dispatch.state, "searching");
      assert.equal(String((await waitForOffer(normal.data.request.id)).dispatch.offeredProviderId), p.id);
    } finally { await stop(); }
  });

  it("regression: provider availability includes urgent requests with a later retry time", async () => {
    const now = new Date();
    const normal = await request();
    await runDispatchBatch(now);
    const urgent = await request();
    await ServiceRequest.updateOne({ _id: urgent.id }, { $set: { priority: "urgent", "pickupLocation.lat": 31.535 } });
    await runDispatchBatch(new Date(+now + 1000));
    // Reproduce persisted retry dates from staggered searches (including older servers).
    await ServiceRequest.updateOne({ _id: normal.id }, { $set: { "dispatch.nextAttemptAt": new Date(+now + 5000) } });
    await ServiceRequest.updateOne({ _id: urgent.id }, { $set: { "dispatch.nextAttemptAt": new Date(+now + 6000) } });
    const p = await provider({ providerState: { isOnline: false } });
    assert.equal((await api(p, "/api/requests/provider/availability", "PATCH", { isOnline: true, location: pickup })).status, 200);
    assert.equal(await DispatchOffer.countDocuments({}), 0);
    await runDispatchBatch(new Date(+now + 5500));
    assert.equal(String((await ServiceRequest.findById(urgent.id)).dispatch.offeredProviderId), p.id);
    assert.equal((await ServiceRequest.findById(normal.id)).dispatch.state, "searching");
  });

  it("regression: the worker preserves acceptance between provider and request writes", async (t) => {
    const p = await provider();
    const job = await request();
    const offer = await advanceDispatch(job.id);
    const original = User.findOneAndUpdate;
    let interleaved = false;
    t.mock.method(User, "findOneAndUpdate", async function (filter, update, options) {
      const result = await original.call(this, filter, update, options);
      if (!interleaved && update.$set?.["providerState.activeRequestId"]) {
        interleaved = true;
        await runDispatchBatch();
      }
      return result;
    });
    const accepted = await acceptOffer(job.id, p.id, offer.dispatch.offerId);
    assert.equal(interleaved, true);
    assert.equal(accepted.status, "provider_assigned");
    assert.equal((await DispatchOffer.findOne({ offerId: offer.dispatch.offerId })).outcome, "accepted");
    assert.equal(String((await User.findById(p.id)).providerState.activeRequestId), job.id);
    assert.equal(accepted.dispatch.attemptedProviderIds.length, 1);
  });

  it("does not protect a claimed offer from actual expiry", async (t) => {
    const p = await provider();
    const job = await request();
    const offer = await advanceDispatch(job.id);
    const original = User.findOneAndUpdate;
    let interleaved = false;
    t.mock.method(User, "findOneAndUpdate", async function (filter, update, options) {
      const result = await original.call(this, filter, update, options);
      if (!interleaved && update.$set?.["providerState.activeRequestId"]) {
        interleaved = true;
        await ServiceRequest.updateOne({ _id: job.id }, { $set: { "dispatch.expiresAt": new Date(0) } });
        await runDispatchBatch();
      }
      return result;
    });
    await assert.rejects(acceptOffer(job.id, p.id, offer.dispatch.offerId), /expired or request changed/);
    assert.equal((await DispatchOffer.findOne({ offerId: offer.dispatch.offerId })).outcome, "expired");
    assert.equal((await User.findById(p.id)).providerState.activeRequestId, null);
    assert.equal((await ServiceRequest.findById(job.id)).assignmentActive, false);
  });

  it("allows customer cancellation between acceptance writes and releases the claim", async (t) => {
    const p = await provider();
    const job = await request();
    const offer = await advanceDispatch(job.id);
    const original = User.findOneAndUpdate;
    let interleaved = false;
    t.mock.method(User, "findOneAndUpdate", async function (filter, update, options) {
      const result = await original.call(this, filter, update, options);
      if (!interleaved && update.$set?.["providerState.activeRequestId"]) {
        interleaved = true;
        assert.equal((await api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })).status, 200);
        await runDispatchBatch();
      }
      return result;
    });
    await assert.rejects(acceptOffer(job.id, p.id, offer.dispatch.offerId), /expired or request changed/);
    const final = await ServiceRequest.findById(job.id);
    assert.equal(final.status, "cancelled");
    assert.equal(final.assignmentActive, false);
    assert.equal((await User.findById(p.id)).providerState.activeRequestId, null);
  });

  it("offers only to verified, available, nearby, fresh, matching-category providers", async () => {
    await provider({ verificationStatus: "pending" });
    await provider({ mechanicProfile: { serviceCategory: "towing" } });
    await provider({ providerState: { isOnline: false, currentLocation: { ...pickup, updatedAt: new Date() } } });
    await provider({ providerState: { isOnline: true, currentLocation: { lat: 24, lng: 67, updatedAt: new Date() } } });
    await provider({ providerState: { isOnline: true, currentLocation: { ...pickup, updatedAt: new Date(Date.now() - 600000) } } });
    const best = await provider(); const job = await request();
    const offered = await advanceDispatch(job.id);
    assert.equal(String(offered.dispatch.offeredProviderId), best.id);
    assert.equal(+offered.dispatch.expiresAt - +offered.dispatch.offeredAt, 20000);
    const own = await api(best, "/api/requests/open");
    assert.equal(own.data.requests.length, 1);
  });

  for (const category of ["mechanic", "fuel_delivery", "car_towing"]) {
    const boundaries = [[7.99, true], [8, true], [8.01, false]];
    if (category === "fuel_delivery") boundaries.push([2, true], [7.9, true], [8.1, false], [10.73, false]);
    for (const [distance, eligible] of boundaries) {
      it(`uses the same fixed radius for ${category} preview and dispatch at ${distance} km`, async (t) => {
        mockRadiusTestRouting(t);
        const origin = { lat: 0, lng: 0 };
        const location = equatorialLocation(distance);
        assert.ok(Math.abs(distanceKm(origin, location) - distance) < 1e-10);
        if (distance === 8) assert.equal(distanceKm(origin, location), 8);
        const candidate = await provider({
          mechanicProfile: { serviceCategory: category === "car_towing" ? "towing" : category },
          providerState: { isOnline: true, currentLocation: location, lastSeenAt: new Date() }
        });
        const created = await api(customer, "/api/requests", "POST", radiusTestRequest(category));
        assert.equal(created.status, 201);
        // Query before the offer reservation so it doesn't change preview eligibility.
        for (const suffix of ["", "&radiusKm=50"]) {
          const preview = await api(customer, `/api/requests/nearby-providers?category=${category}&lat=0&lng=0${suffix}`);
          assert.equal(preview.status, 200);
          assert.deepEqual(preview.data.providers.map(item => item.id), eligible ? [candidate.id] : []);
          assert.equal(preview.data.radiusKm, 8);
        }
        const saved = await advanceDispatch(created.data.request.id);
        assert.equal(saved.dispatch.radiusKm, 8);
        assert.equal(String(saved.dispatch.offeredProviderId), eligible ? candidate.id : "null");
        assert.equal(await DispatchOffer.countDocuments({ requestId: saved._id }), eligible ? 1 : 0);
      });
    }
    for (const distance of [3, 7.9, 8.1, 15, 30]) {
      it(`bypasses the distance cap for ${category} preview and dispatch at ${distance} km in test mode`, async (t) => {
        withRadiusBypass(t);
        mockRadiusTestRouting(t);
        const candidate = await provider({
          mechanicProfile: { serviceCategory: category === "car_towing" ? "towing" : category },
          providerState: { isOnline: true, currentLocation: equatorialLocation(distance) }
        });
        const created = await api(customer, "/api/requests", "POST", radiusTestRequest(category));
        assert.equal(created.status, 201);
        const id = created.data.request.id;
        assert.equal(created.data.request.dispatch.radiusKm, 8);
        const preview = await api(customer, `/api/requests/nearby-providers?category=${category}&lat=0&lng=0`);
        assert.equal(preview.status, 200);
        assert.equal(preview.data.radiusKm, 8);
        assert.deepEqual(preview.data.providers.map(({ id }) => id), [candidate.id]);

        if (distance === 30) {
          // At the fallback speed, a fresh 30 km request costs more to match than to wait.
          assert.equal((await advanceDispatch(id)).dispatch.state, "searching");
          assert.equal(await DispatchOffer.countDocuments({ requestId: id }), 0);
          // Age only the fixture so the unchanged solver prefers this eligible edge.
          await ServiceRequest.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, {
            $set: { createdAt: new Date(Date.now() - 30 * 60 * 1000) }
          });
        }
        const offered = await advanceDispatch(id);
        assert.equal(offered.dispatch.radiusKm, 8);
        assert.equal(offered.dispatch.state, "offered");
        assert.equal(String(offered.dispatch.offeredProviderId), candidate.id);
        const offer = await DispatchOffer.findOne({ requestId: id });
        assert.equal(offer.algorithmVersion, "batch-mincost-v1");
        assert.ok(Math.abs(offer.distanceKm - distance) < 1e-10);
        assert.equal((await api(candidate, "/api/requests/open")).data.requests[0].id, id);
      });
    }

  }

  it("ignores the radius bypass outside test mode and restores the cap when disabled", async (t) => {
    withRadiusBypass(t);
    mockRadiusTestRouting(t);
    const previousMode = process.env.NODE_ENV;
    t.after(() => { process.env.NODE_ENV = previousMode; });
    await provider({ providerState: { isOnline: true, currentLocation: equatorialLocation(15) } });
    const created = await api(customer, "/api/requests", "POST", radiusTestRequest("mechanic"));
    assert.equal(created.status, 201);
    assert.equal(withinDispatchRadius(NaN, 8), false);
    for (const mode of ["production", "development", "test"]) {
      process.env.NODE_ENV = mode;
      if (mode === "test") delete process.env.DISPATCH_TEST_BYPASS_RADIUS;
      assert.equal(withinDispatchRadius(15, 8), false);
      const preview = await api(customer, "/api/requests/nearby-providers?category=mechanic&lat=0&lng=0");
      assert.equal(preview.status, 200);
      assert.deepEqual(preview.data.providers, []);
      const job = await advanceDispatch(created.data.request.id);
      assert.equal(job.dispatch.radiusKm, 8);
      assert.equal(job.dispatch.state, "searching");
    }
    assert.equal(await DispatchOffer.countDocuments({}), 0);
  });

  it("keeps other eligibility gates and the no-provider timeout with bypass enabled", async (t) => {
    withRadiusBypass(t);
    const now = new Date();
    const old = new Date(+now - 4 * 60 * 1000);
    const base = { isOnline: true, currentLocation: { ...pickup, capturedAt: now, updatedAt: now }, lastSeenAt: now };
    const mechanicProfile = { serviceCategory: "fuel_delivery" };
    await provider({ mechanicProfile, providerState: { ...base, isOnline: false } });
    await provider({ mechanicProfile, providerState: base, verificationStatus: "pending" });
    await provider({ mechanicProfile, providerState: { ...base, currentLocation: { ...base.currentLocation, updatedAt: old } } });
    await provider({ mechanicProfile, providerState: { ...base, currentLocation: { ...base.currentLocation, capturedAt: old } } });
    await provider({ mechanicProfile, providerState: { ...base, reservedOfferId: "reserved", reservedUntil: new Date(+now + 20000) } });
    await provider({ mechanicProfile, providerState: { ...base, activeRequestId: new mongoose.Types.ObjectId() } });
    await provider({ providerState: base });
    const preview = await api(customer, `/api/requests/nearby-providers?category=fuel_delivery&lat=${pickup.lat}&lng=${pickup.lng}`);
    assert.equal(preview.status, 200);
    const created = await api(customer, "/api/requests", "POST", {
      category: "fuel_delivery", pickupLocation: pickup,
      fuelDetails: { fuelType: "petrol", liters: 5 }, vehicleInfo: { type: "car", model: "Test car" }
    });
    assert.equal(created.status, 201);
    const job = await advanceDispatch(created.data.request.id);
    assert.equal(job.dispatch.state, "searching");
    assert.deepEqual(preview.data.providers, []);
    assert.equal(await DispatchOffer.countDocuments({ requestId: job._id }), 0);
    assert.equal((await advanceDispatch(job.id, new Date(+job.dispatch.deadline + 1))).dispatch.state, "unavailable");
  });

  it("limits coordinate-free preview to customer mode and preserves authorized assigned GPS", async () => {
    const candidate = await provider();
    await provider({ providerState: { isOnline: true, currentLocation: { ...pickup, lat: 31.53, updatedAt: new Date() } } });
    const admin = await User.create({ name: "Admin", role: "admin", phone: "gps-admin", passwordHash: "test-only" });
    const dual = await User.create({ name: "Dual", role: "user", roles: ["user", "mechanic"], phone: "gps-dual", passwordHash: "test-only" });
    const preview = `/api/requests/nearby-providers?category=mechanic&lat=${pickup.lat}&lng=${pickup.lng}`;
    assert.equal((await api(null, preview)).status, 401);
    for (const actor of [candidate, admin]) assert.equal((await api(actor, preview)).status, 403);
    assert.equal((await api(dual, preview, "GET", undefined, undefined, "mechanic")).status, 403);
    for (const actor of [customer, dual]) {
      const result = await api(actor, preview, "GET", undefined, undefined, "user");
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.data).sort(), ["ok", "providers", "radiusKm"]);
      assert.equal(result.data.providers.length, 2);
      assert.equal(result.data.providers[0].id, candidate.id);
      for (const row of result.data.providers) {
        assert.deepEqual(Object.keys(row).sort(), ["completedJobs", "id", "name", "ratingAvg", "ratingCount", "serviceCategory"]);
      }
    }

    const job = await request();
    const offered = await advanceDispatch(job.id);
    await acceptOffer(job.id, candidate.id, offered.dispatch.offerId);
    const fix = { lat: 31.523, lng: 74.351, addressText: "Authorized tracking", capturedAt: new Date() };
    assert.equal((await api(candidate, "/api/requests/provider/location", "PATCH", { location: { ...fix, lat: 91 } })).status, 400);
    assert.equal((await api(customer, "/api/requests/provider/location", "PATCH", { location: fix })).status, 403);
    assert.equal((await api(candidate, "/api/requests/provider/location", "PATCH", { location: fix })).status, 200);
    const url = `/api/requests/${job.id}`;
    assert.equal((await api(dual, url)).status, 403);
    for (const actor of [customer, candidate]) {
      assert.equal((await api(actor, url)).data.request.providerLocation.lat, fix.lat);
    }
    assert.equal((await api(customer, "/api/admin/active-jobs")).status, 403);
    assert.equal((await api(admin, "/api/admin/active-jobs")).data.jobs[0].provider.location.lng, fix.lng);
  });

  it("keeps a newer GPS fix when an older availability update arrives", async () => {
    const p = await provider();
    const current = new Date();
    const fix = { ...pickup, lat: 31.53, accuracy: 8, capturedAt: current.toISOString() };
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: fix })).status, 200);
    assert.equal((await api(p, "/api/requests/provider/availability", "PATCH", { isOnline: false })).status, 200);
    const stale = { ...fix, capturedAt: new Date(+current - 240000).toISOString() };
    assert.equal((await api(p, "/api/requests/provider/availability", "PATCH", { isOnline: true, location: stale })).status, 400);
    const older = { ...fix, lat: 31.54, accuracy: 20, capturedAt: new Date(+current - 10000).toISOString() };
    assert.equal((await api(p, "/api/requests/provider/availability", "PATCH", { isOnline: true, location: older })).status, 200);
    const { isOnline, currentLocation: saved } = (await User.findById(p.id)).providerState;
    assert.equal(isOnline, true);
    assert.equal(saved.lat, fix.lat);
    assert.equal(saved.lng, fix.lng);
    assert.equal(saved.accuracy, fix.accuracy);
    assert.equal(saved.capturedAt.toISOString(), fix.capturedAt);
  });

  it("persists and privately offers fuel and towing requests to the matching service category", async (t) => {
    const actualFetch = global.fetch;
    t.mock.method(global, "fetch", (url, options) => {
      if (String(url).includes("/route/v1/driving/")) {
        return Promise.resolve(Response.json({ code: "Ok", routes: [{ distance: 2600, duration: 300 }] }));
      }
      return actualFetch(url, options);
    });
    await provider();
    const fuel = await provider({ mechanicProfile: { serviceCategory: "fuel_delivery" } });
    const towing = await provider({ mechanicProfile: { serviceCategory: "towing" } });
    const shared = { pickupLocation: pickup, vehicleInfo: { type: "car", model: "Test car" } };
    const cases = [
      { category: "fuel_delivery", fuelDetails: { fuelType: "petrol", liters: 5 }, provider: fuel },
      { category: "car_towing", destinationLocation: { lat: 31.54, lng: 74.36 }, provider: towing }
    ];
    for (const { provider: expected, ...details } of cases) {
      const created = await api(customer, "/api/requests", "POST", { ...shared, ...details });
      assert.equal(created.status, 201);
      const saved = await ServiceRequest.findById(created.data.request.id);
      assert.equal(saved.category, details.category);
      assert.equal(saved.pickupLocation.lat, pickup.lat);
      const offered = await advanceDispatch(saved.id);
      assert.equal(String(offered.dispatch.offeredProviderId), expected.id);
      const own = await api(expected, "/api/requests/open");
      assert.equal(own.data.requests[0].id, saved.id);
      const other = await api(expected.id === fuel.id ? towing : fuel, "/api/requests/open");
      assert.equal(other.data.requests.length, 0);
      assert.equal((await api(expected, `/api/requests/${saved.id}/accept`, "PATCH", {
        offerId: offered.dispatch.offerId
      })).status, 200);
      const tracked = await api(customer, `/api/requests/${saved.id}`);
      assert.equal(tracked.data.request.status, "provider_assigned");
    }
  });
  it("ranks candidates and advances to the next one after a decline", async () => {
    const first = await provider();
    const second = await provider({ providerState: { isOnline: true, currentLocation: { ...pickup, lat: 31.54, updatedAt: new Date() } } });
    const job = await request(); const offer = await advanceDispatch(job.id);
    assert.equal(String(offer.dispatch.offeredProviderId), first.id);
    await declineOffer(job.id, first.id, offer.dispatch.offerId);
    assert.equal((await ServiceRequest.findById(job.id)).dispatch.state, "searching");
    const next = await advanceDispatch(job.id);
    assert.equal(String(next.dispatch.offeredProviderId), second.id);
    await assert.rejects(acceptOffer(job.id, first.id, offer.dispatch.offerId), /no longer/);
  });
  it("rejects expired offers and recovers expiry after worker restart", async () => {
    const first = await provider(); const second = await provider();
    const job = await request(); const offer = await advanceDispatch(job.id);
    await ServiceRequest.updateOne({ _id: job.id }, { $set: { "dispatch.expiresAt": new Date(Date.now() - 1) } });
    await assert.rejects(acceptOffer(job.id, offer.dispatch.offeredProviderId, offer.dispatch.offerId), /expired/);
    const stop = startDispatchWorker();
    try {
      let updated;
      for (let i = 0; i < 30; i++) {
        updated = await ServiceRequest.findById(job.id);
        if (updated.dispatch.offerId !== offer.dispatch.offerId) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.notEqual(updated.dispatch.offerId, offer.dispatch.offerId);
      assert.equal(String(updated.dispatch.offeredProviderId), String(offer.dispatch.offeredProviderId) === first.id ? second.id : first.id);
    } finally { await stop(); }
  });
  it("acceptance is atomic across competing requests for the same provider", async () => {
    const p = await provider(); const a = await request(); const b = await request();
    const offers = await Promise.all([advanceDispatch(a.id), advanceDispatch(b.id)]);
    const results = await Promise.allSettled(offers.map((job) => acceptOffer(job.id, p.id, job.dispatch.offerId)));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await ServiceRequest.countDocuments({ providerId: p.id, assignmentActive: true }), 1);
    const assigned = results.find((r) => r.status === "fulfilled").value;
    assert.equal((await acceptOffer(assigned.id, p.id, assigned.dispatch.offerId)).id, assigned.id);
  });
  it("a different provider cannot see, accept, or cancel another provider's offer", async () => {
    const chosen = await provider();
    const outsider = await provider({ providerState: { isOnline: true, currentLocation: { ...pickup, lat: 31.55, updatedAt: new Date() } } });
    const job = await request(); const offer = await advanceDispatch(job.id);
    assert.equal(String(offer.dispatch.offeredProviderId), chosen.id);
    assert.equal((await api(outsider, `/api/requests/${job.id}`)).status, 403);
    assert.equal((await api(outsider, `/api/requests/${job.id}/accept`, "PATCH", { offerId: offer.dispatch.offerId })).status, 409);
    assert.equal((await api(outsider, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })).status, 403);
  });
  it("cancellation invalidates an offer and prevents reopening the request", async () => {
    const p = await provider(); const job = await request(); const offer = await advanceDispatch(job.id);
    assert.equal((await api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })).status, 200);
    await assert.rejects(acceptOffer(job.id, p.id, offer.dispatch.offerId));
    assert.equal((await advanceDispatch(job.id)).status, "cancelled");
    assert.equal((await api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "searching_provider" })).status, 400);
  });
  it("finishes searches with no providers and allows an owner-only retry", async () => {
    const job = await request();
    await advanceDispatch(job.id);
    await ServiceRequest.updateOne({ _id: job.id }, { $set: { "dispatch.deadline": new Date(0), "dispatch.nextAttemptAt": new Date(0) } });
    assert.equal((await advanceDispatch(job.id)).dispatch.state, "unavailable");
    const p = await provider();
    assert.equal((await api(p, `/api/requests/${job.id}/dispatch/retry`, "POST", {})).status, 400);
    const result = await api(customer, `/api/requests/${job.id}/dispatch/retry`, "POST", {});
    assert.equal(result.data.request.dispatch.state, "searching");
    assert.equal((await advanceDispatch(job.id)).dispatch.state, "offered");
  });
  it("keeps historical radii on idempotent creation and retry, including the legacy fallback", async () => {
    for (const [category, radius] of [["mechanic", 5], ["car_towing", 15], ["fuel_delivery", undefined]]) {
      const clientRequestId = `legacy-radius-${category}`;
      const job = await ServiceRequest.create({
        userId: customer.id, clientRequestId, category, pickupLocation: pickup,
        dispatch: { ...newDispatch(category), state: "unavailable", radiusKm: radius },
        status: "searching_provider"
      });
      if (radius === undefined) {
        await ServiceRequest.collection.updateOne({ _id: job._id }, { $unset: { "dispatch.radiusKm": 1 } });
      }
      const duplicate = await api(customer, "/api/requests", "POST", { clientRequestId });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.data.request.id, job.id);
      assert.equal(duplicate.data.request.dispatch.radiusKm, radius ?? 5);
      const retried = await api(customer, `/api/requests/${job.id}/dispatch/retry`, "POST", {});
      assert.equal(retried.status, 200);
      assert.equal(retried.data.request.dispatch.radiusKm, radius ?? 5);
      assert.equal((await ServiceRequest.findById(job.id)).dispatch.radiusKm, radius ?? 5);
    }
  });
  it("releases abandoned provider reservations but keeps a live assignment", async () => {
    const p = await provider(); const job = await request();
    await User.updateOne({ _id: p.id }, { $set: { "providerState.activeRequestId": job.id, "providerState.claimedAt": new Date(Date.now() - 60000) } });
    await recoverReservations();
    assert.equal((await User.findById(p.id)).providerState.activeRequestId, null);
    const offer = await advanceDispatch(job.id); await acceptOffer(job.id, p.id, offer.dispatch.offerId);
    await User.updateOne({ _id: p.id }, { $set: { "providerState.claimedAt": new Date(Date.now() - 60000) } });
    await recoverReservations();
    assert.equal(String((await User.findById(p.id)).providerState.activeRequestId), job.id);
  });
  it("runs create → offer → accept → GPS → arrive with private live notifications", async () => {
    const p = await provider(); const outsider = await provider({ verificationStatus: "pending" });
    const cs = await socketFor(customer); const ps = await socketFor(p); const os = await socketFor(outsider);
    const events = [], privateEvents = [], providerEvents = [];
    cs.on("request:changed", (event) => events.push(event)); os.on("request:changed", (event) => privateEvents.push(event)); ps.on("request:changed", (event) => providerEvents.push(event));
    try {
      const created = await api(customer, "/api/requests", "POST", { category: "mechanic", priority: "urgent", pickupLocation: pickup, mechanicDetails: { issueCategory: "tyre" }, vehicleInfo: { type: "car", model: "Test car" } });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.request.priority, "urgent");
      assert.equal(created.data.request.dispatch.state, "searching");
      const job = await advanceDispatch(created.data.request.id);
      assert.equal((await api(p, `/api/requests/${job.id}/accept`, "PATCH", { offerId: job.dispatch.offerId })).status, 200);
      await api(p, "/api/requests/provider/location", "PATCH", { location: { ...pickup, lat: 31.522 } });
      const tracked = await api(customer, `/api/requests/${job.id}`);
      assert.equal(tracked.data.request.provider.name, p.name);
      assert.equal(tracked.data.request.providerLocation.lat, 31.522);
      assert.equal((await api(p, `/api/requests/${job.id}/status`, "PATCH", { status: "provider_on_way" })).status, 200);
      assert.equal((await api(p, `/api/requests/${job.id}/status`, "PATCH", { status: "provider_arrived" })).status, 200);
      await new Promise((r) => setTimeout(r, 100));
      assert.ok(events.some((event) => event.kind === "assigned")); assert.ok(events.some((event) => event.kind === "arrived")); assert.ok(events.some((event) => event.kind === "location"));
      assert.ok(providerEvents.some((event) => event.kind === "offer")); assert.equal(privateEvents.length, 0);
    } finally { cs.disconnect(); ps.disconnect(); os.disconnect(); }
  });

  it("delivers distant offers, reassigns after rejection and synchronizes tracking after Socket.IO reconnect", { timeout: 8000 }, async (t) => {
    withRadiusBypass(t);
    const nearest = await provider({ providerState: { isOnline: true, currentLocation: equatorialLocation(8.1) } });
    const next = await provider({ providerState: { isOnline: true, currentLocation: equatorialLocation(15) } });
    const customerSocket = await socketFor(customer);
    t.after(() => customerSocket.disconnect());
    const nextSocket = await socketFor(next);
    t.after(() => nextSocket.disconnect());

    const created = await api(customer, "/api/requests", "POST", radiusTestRequest("mechanic"));
    assert.equal(created.status, 201);
    const id = created.data.request.id;
    const first = await advanceDispatch(id);
    assert.equal(String(first.dispatch.offeredProviderId), nearest.id);
    assert.equal((await api(nearest, "/api/requests/open")).data.requests[0].id, id);
    assert.equal((await api(next, "/api/requests/open")).data.requests.length, 0);

    const declined = await api(nearest, `/api/requests/${id}/decline`, "PATCH", { offerId: first.dispatch.offerId });
    assert.equal(declined.status, 200);
    const delivered = once(nextSocket, "request:changed");
    const nextOffer = await advanceDispatch(id);
    assert.equal(String(nextOffer.dispatch.offeredProviderId), next.id);
    const [offeredEvent] = await delivered;
    assert.equal(offeredEvent.kind, "offer");
    assert.equal(offeredEvent.requestId, id);

    const accept = (actor, offerId) => api(actor, `/api/requests/${id}/accept`, "PATCH", { offerId });
    const [wrongProvider, assigned] = await Promise.all([
      accept(nearest, nextOffer.dispatch.offerId), accept(next, nextOffer.dispatch.offerId)
    ]);
    assert.equal(wrongProvider.status, 409);
    assert.equal(assigned.status, 200);
    assert.equal(String(assigned.data.request.providerId), next.id);
    assert.equal(await ServiceRequest.countDocuments({ _id: id, providerId: next.id, assignmentActive: true }), 1);
    assert.equal(await DispatchOffer.countDocuments({ requestId: id, outcome: "accepted" }), 1);
    assert.equal(await DispatchOffer.countDocuments({ requestId: id, outcome: "declined" }), 1);

    const originalSocketId = customerSocket.id;
    const reconnected = once(customerSocket, "connect");
    realtime.sockets.sockets.get(originalSocketId).conn.close();
    await reconnected;
    assert.notEqual(customerSocket.id, originalSocketId);
    const onWay = once(customerSocket, "request:changed");
    assert.equal((await api(next, `/api/requests/${id}/status`, "PATCH", { status: "provider_on_way" })).status, 200);
    const [event] = await onWay;
    assert.equal(event.requestId, id);
    assert.equal(event.status, "provider_on_way");
    const tracked = await api(customer, `/api/requests/${id}`);
    assert.equal(tracked.status, 200);
    assert.equal(tracked.data.request.status, event.status);
    assert.equal(tracked.data.request.provider.id, next.id);
    assert.equal(tracked.data.request.providerLocation.lng, equatorialLocation(15).lng);
    assert.equal(tracked.data.request.dispatch.radiusKm, 8);
  });

  it("repeated submissions create one job, including concurrent retries", async () => {
    const body = { clientRequestId: "test-submission-unique-123", category: "mechanic", pickupLocation: pickup, mechanicDetails: { issueCategory: "tyre" }, vehicleInfo: { type: "car", model: "Test car" } };
    const results = await Promise.all([api(customer, "/api/requests", "POST", body), api(customer, "/api/requests", "POST", body)]);
    assert.ok(results.every((result) => [200, 201].includes(result.status)), JSON.stringify(results));
    assert.equal(results[0].data.request.id, results[1].data.request.id);
    assert.equal(await ServiceRequest.countDocuments({ userId: customer.id }), 1);
  });
  it("withdraws an offer if its provider goes offline", async () => {
    const p = await provider(); const job = await request(); const offer = await advanceDispatch(job.id);
    await User.updateOne({ _id: p.id }, { $set: { "providerState.isOnline": false } });
    await assert.rejects(acceptOffer(job.id, p.id, offer.dispatch.offerId));
    const next = await advanceDispatch(job.id);
    assert.equal(next.dispatch.offeredProviderId, null);
    assert.equal(next.dispatch.state, "searching");
  });
  it("cancellation racing acceptance cannot leave a cancelled job assigned", async () => {
    const p = await provider(); const job = await request(); const offer = await advanceDispatch(job.id);
    await Promise.allSettled([
      acceptOffer(job.id, p.id, offer.dispatch.offerId),
      api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })
    ]);
    let final = await ServiceRequest.findById(job.id);
    if (final.status !== "cancelled") {
      assert.equal((await api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })).status, 200);
      final = await ServiceRequest.findById(job.id);
    }
    assert.equal(final.assignmentActive, false);
    assert.equal((await User.findById(p.id)).providerState.activeRequestId, null);
  });
  it("closed jobs do not expose the provider's ongoing live location", async () => {
    const p = await provider(); const job = await request(); const offer = await advanceDispatch(job.id);
    await acceptOffer(job.id, p.id, offer.dispatch.offerId);
    await api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" });
    const detail = await api(customer, `/api/requests/${job.id}`);
    assert.equal(detail.data.request.providerLocation, null);
    assert.equal(detail.data.request.provider.name, p.name);
  });

  it("rejects out-of-order provider GPS updates", async () => {
    const p = await provider();
    const newer = new Date();
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: { ...pickup, lat: 31.53, capturedAt: newer.toISOString(), accuracy: 8 } })).status, 200);
    const stale = await api(p, "/api/requests/provider/location", "PATCH", { location: { ...pickup, lat: 31.54, capturedAt: new Date(newer.getTime() - 10000).toISOString() } });
    assert.equal(stale.status, 409);
    assert.equal((await User.findById(p.id)).providerState.currentLocation.lat, 31.53);
  });

  it("treats a re-sent GPS fix as a heartbeat, not an error", async () => {
    const p = await provider();
    const fix = { ...pickup, lat: 31.53, capturedAt: new Date().toISOString() };
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: fix })).status, 200);
    const before = (await User.findById(p.id)).providerState.lastSeenAt;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const again = await api(p, "/api/requests/provider/location", "PATCH", { location: fix });
    assert.equal(again.status, 200);
    assert.equal(again.data.ignored, true);
    const saved = await User.findById(p.id);
    assert.ok(saved.providerState.lastSeenAt > before, "heartbeat must move even when the fix is not newer");
    assert.equal(saved.providerState.currentLocation.lat, 31.53);
  });

  it("measures fix age on the device clock when sentAt is provided (no clock-skew staleness)", async () => {
    const p = await provider();
    const skew = 10 * 60 * 1000; // device clock 10 minutes behind the server
    const deviceNow = Date.now() - skew;
    const fix = { ...pickup, lat: 31.531, capturedAt: new Date(deviceNow - 2000).toISOString(), sentAt: new Date(deviceNow).toISOString() };
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: fix })).status, 200);
    const stored = (await User.findById(p.id)).providerState.currentLocation;
    assert.ok(Date.now() - stored.capturedAt.getTime() < 10000, "a 2s-old fix from a skewed device must be stored as ~2s old");
    assert.equal(isFreshProviderLocation(stored), true);
    // The next real fix from the same skewed device is newer and accepted.
    const next = { ...pickup, lat: 31.532, capturedAt: new Date(deviceNow + 3000).toISOString(), sentAt: new Date(deviceNow + 3500).toISOString() };
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: next })).status, 200);
    assert.equal((await User.findById(p.id)).providerState.currentLocation.lat, 31.532);
  });

  it("explains each reason a provider is excluded from a request", async () => {
    const job = await request();
    const ok = await provider();
    assert.deepEqual(exclusionReasons(await User.findById(ok.id), job), []);
    const stale = new Date(Date.now() - 200000);
    const bad = await provider({ verificationStatus: "pending", mechanicProfile: { serviceCategory: "towing" },
      providerState: { isOnline: false, currentLocation: { ...pickup, lat: 31.7, updatedAt: stale, capturedAt: stale } } });
    const reasons = exclusionReasons(await User.findById(bad.id), job).join(" | ");
    for (const part of ["category towing != mechanic", "verification pending", "offline", "location received", "GPS fix", "km away (radius 8 km)"]) {
      assert.ok(reasons.includes(part), `missing "${part}" in: ${reasons}`);
    }
  });

  it("persists explainable matching decisions and response-time metrics", async () => {
    const p = await provider(); const job = await request();
    const offer = await advanceDispatch(job.id);
    const reserved = await User.findById(p.id);
    assert.equal(String(reserved.providerState.reservedRequestId), job.id);
    assert.equal(reserved.providerState.reservedOfferId, offer.dispatch.offerId);
    await acceptOffer(job.id, p.id, offer.dispatch.offerId);
    const assignedProvider = await User.findById(p.id);
    assert.equal(assignedProvider.providerState.reservedOfferId, null);
    assert.equal(String(assignedProvider.providerState.activeRequestId), job.id);
    const audit = await DispatchOffer.findOne({ offerId: offer.dispatch.offerId });
    assert.equal(audit.outcome, "accepted");
    assert.equal(audit.algorithmVersion, "batch-mincost-v1");
    assert.ok(audit.batchId);
    assert.ok(audit.travelDurationSeconds > 0);
    assert.equal(audit.routeSource, "haversine_fallback");
    assert.ok(audit.score > 0 && audit.score <= 100);
    assert.ok(audit.components.proximity >= 0);
    assert.ok(audit.baselineNearestDistanceKm <= audit.distanceKm);
    const updatedProvider = await User.findById(p.id);
    assert.equal(updatedProvider.providerPerformance.responseSamples, 1);
    assert.equal(updatedProvider.providerPerformance.acceptedOffers, 1);
  });

  it("creates an immutable invoice and retries a failed payment without duplicate revenue", async () => {
    const p = await provider();
    const job = await ServiceRequest.create({
      userId: customer._id, providerId: p._id, category: "mechanic", pickupLocation: pickup,
      status: "completed", completedAt: new Date(), estimate: { currency: "PKR", lines: [
        { label: "Inspection and labor", amount: 1500 }, { label: "Service fee", amount: 200 }, { label: "Extra work estimate", amount: 900 }
      ], total: 2600 }, mechanicDetails: { issueCategory: "tyre", extraWork: { partPrice: 500, laborCharge: 400, approvedByUser: false } }
    });
    const failed = await api(customer, `/api/payments/request/${job.id}`, "POST", { method: "online_simulated", simulationResult: "failed", idempotencyKey: "payment-failure-1" });
    assert.equal(failed.status, 200);
    assert.equal(failed.data.payment.status, "failed");
    assert.equal(failed.data.invoice.totalMinor, 170000);
    const paid = await api(customer, `/api/payments/request/${job.id}`, "POST", { method: "online_simulated", simulationResult: "success", idempotencyKey: "payment-success-1" });
    assert.equal(paid.data.payment.status, "paid");
    const duplicate = await api(customer, `/api/payments/request/${job.id}`, "POST", { method: "online_simulated", simulationResult: "success", idempotencyKey: "payment-success-1" });
    assert.equal(duplicate.data.payment.id, paid.data.payment.id);
    assert.equal(await Invoice.countDocuments({ requestId: job.id }), 1);
    assert.equal(await Payment.countDocuments({ requestId: job.id, status: "paid" }), 1);
    assert.equal(await PaymentAttempt.countDocuments({ requestId: job.id }), 2);
  });

  it("recovers a payment when the status write fails after the attempt is saved", async (t) => {
    const p = await provider();
    const job = await ServiceRequest.create({ userId: customer._id, providerId: p._id, category: "mechanic", pickupLocation: pickup, status: "completed", completedAt: new Date(), estimate: { currency: "PKR", lines: [{ label: "Service", amount: 1000 }], total: 1000 } });
    const original = Payment.findOneAndUpdate;
    let failOnce = true;
    t.mock.method(console, "error", () => {});
    t.mock.method(Payment, "findOneAndUpdate", function (...args) {
      if (failOnce) { failOnce = false; throw new Error("simulated interrupted payment write"); }
      return original.apply(this, args);
    });
    const body = { method: "online_simulated", simulationResult: "success", idempotencyKey: "interrupted-payment-1" };
    assert.equal((await api(customer, `/api/payments/request/${job.id}`, "POST", body)).status, 500);
    const retried = await api(customer, `/api/payments/request/${job.id}`, "POST", body);
    assert.equal(retried.status, 200);
    assert.equal(retried.data.payment.status, "paid");
    assert.equal(await PaymentAttempt.countDocuments({ requestId: job.id }), 1);
    const conflicting = await api(customer, `/api/payments/request/${job.id}`, "POST", { ...body, simulationResult: "failed" });
    assert.equal(conflicting.status, 409);
    assert.equal((await Payment.findOne({ requestId: job.id })).status, "paid");
  });

  it("keeps cash pending until the assigned provider confirms collection", async () => {
    const p = await provider();
    const job = await ServiceRequest.create({ userId: customer._id, providerId: p._id, category: "mechanic", pickupLocation: pickup, status: "completed", completedAt: new Date(), estimate: { currency: "PKR", lines: [{ label: "Service", amount: 1000 }], total: 1000 } });
    const selected = await api(customer, `/api/payments/request/${job.id}`, "POST", { method: "cash", idempotencyKey: "cash-selection-1" });
    assert.equal(selected.data.payment.status, "pending");
    assert.equal((await api(customer, `/api/payments/request/${job.id}/cash-collected`, "PATCH", {})).status, 403);
    const confirmed = await api(p, `/api/payments/request/${job.id}/cash-collected`, "PATCH", {});
    assert.equal(confirmed.data.payment.status, "paid");
    const retry = await api(p, `/api/payments/request/${job.id}/cash-collected`, "PATCH", {});
    assert.equal(retry.status, 200);
    assert.equal(retry.data.payment.id, confirmed.data.payment.id);
  });

  it("deduplicates retried chat messages and protects admin endpoints", async () => {
    const p = await provider();
    const job = await ServiceRequest.create({ userId: customer._id, providerId: p._id, category: "mechanic", pickupLocation: pickup, status: "provider_assigned", assignmentActive: true, estimate: { currency: "PKR", total: 1000 } });
    const body = { body: "I am at the pickup point", clientMessageId: "message-retry-123" };
    const first = await api(customer, `/api/requests/${job.id}/messages`, "POST", body);
    const second = await api(customer, `/api/requests/${job.id}/messages`, "POST", body);
    assert.equal(first.data.message.id, second.data.message.id);
    assert.equal(await ChatMessage.countDocuments({ requestId: job.id }), 1);
    assert.equal((await api(customer, "/api/admin/dashboard")).status, 403);
    const admin = await User.create({ name: "Admin", phone: "admin-test", email: "admin@test.local", passwordHash: await User.hashPassword("admin-pass-123"), role: "admin" });
    assert.equal((await api(admin, "/api/admin/dashboard")).status, 200);
    const login = await fetch(`${base}/api/auth/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@test.local", password: "admin-pass-123" }) });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie") || "", /rapidassist_access_token=/);
  });
});
