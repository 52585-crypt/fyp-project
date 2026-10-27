const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
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
const { newDispatch, advanceDispatch, acceptOffer, declineOffer, recoverReservations, runDispatchBatch, startDispatchWorker } = require("../src/services/dispatch");

process.env.JWT_SECRET = "isolated-dispatch-test-secret";
process.env.NODE_ENV = "test";
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
async function api(actor, path, method = "GET", body) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: actor.id })}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
async function socketFor(actor) {
  const socket = connectSocket(base, { auth: { token: signAccessToken({ sub: actor.id }) }, transports: ["websocket"], forceNew: true });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  return socket;
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
