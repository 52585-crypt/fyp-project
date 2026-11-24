const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest, REQUEST_STATUSES } = require("../src/models/ServiceRequest");
const { Payment } = require("../src/models/Payment");
const { DispatchOffer } = require("../src/models/DispatchOffer");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

describe("admin service request history", () => {
  let db, server, base, admin, customer, provider, done, cancelled, queued, exhausted, missingDate, dateEdge;
  const midnight = new Date("2026-11-20T00:00:00.000Z");
  const afterMidnight = new Date("2026-11-20T00:05:00.000Z");

  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_admin_history_test" });
    await Promise.all([User.init(), ServiceRequest.init(), Payment.init(), DispatchOffer.init()]);
    [admin, customer, provider] = await User.create([
      { role: "admin", name: "Fixture Admin" },
      { role: "user", name: "Alma [North]" },
      { role: "mechanic", name: "Musa Provider" }
    ].map((user, index) => ({ ...user, passwordHash: "fixture", phone: "fixture-history-" + index })));
    const defaults = { userId: customer.id, category: "mechanic", pickupLocation: { lat: 31.52, lng: 74.35 }, createdAt: midnight };
    done = await ServiceRequest.create({ ...defaults, status: "completed", providerId: provider.id, completedAt: afterMidnight,
      estimate: { total: 1800, currency: "PKR" }, statusTimeline: [{ status: "work_started", at: afterMidnight }] });
    cancelled = await ServiceRequest.create({ ...defaults, category: "car_towing", status: "cancelled", cancelledAt: afterMidnight,
      destinationLocation: { lat: 31.6, lng: 74.4 },
      statusTimeline: [{ status: "cancelled", at: afterMidnight, note: "Customer no longer needs service", byUserId: customer.id }] });
    queued = await ServiceRequest.create({ ...defaults, status: "searching_provider" });
    exhausted = await ServiceRequest.create({ ...defaults, createdAt: afterMidnight, status: "searching_provider",
      dispatch: { enabled: true, state: "unavailable", radiusKm: 15 },
      pickupLocation: { lat: 31.52, lng: 74.35, source: "google_places", googleContentCachedAt: new Date(0) } });
    dateEdge = await ServiceRequest.create({ ...defaults, status: "provider_assigned", createdAt: new Date("2026-11-21T00:00:00.000Z"), providerId: provider.id });
    missingDate = await ServiceRequest.create({ ...defaults, providerId: new mongoose.Types.ObjectId(), status: "pending" });
    await ServiceRequest.collection.updateOne({ _id: missingDate._id }, { $unset: { createdAt: 1 } });
    await Payment.create({ requestId: done.id, invoiceId: new mongoose.Types.ObjectId(), userId: customer.id, providerId: provider.id,
      amountMinor: 180000, method: "cash", status: "paid", paidAt: afterMidnight, collectedByUserId: provider.id });
    await DispatchOffer.create({ requestId: done.id, providerId: provider.id, offerId: "fixture-historical",
      distanceKm: 2, score: 50, components: { proximity: .5, rating: .5, experience: .5, responseSpeed: .5 },
      offeredAt: midnight, expiresAt: afterMidnight, respondedAt: afterMidnight, outcome: "accepted" });
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/admin/requests`;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  async function get(path = "", actor = admin) {
    const headers = actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id, role: actor.role })}` } : {};
    const response = await fetch(base + path, { headers });
    return { code: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  }

  it("requires admin access to list and detail and marks responses no-store", async () => {
    for (const path of ["", "/" + done.id]) {
      assert.equal((await get(path, null)).code, 401);
      assert.equal((await get(path, customer)).code, 403);
      assert.equal((await get(path, provider)).code, 403);
      assert.equal((await get(path)).cache, "no-store");
    }
  });

  it("paginates newest first with deterministic ties, including undated history", async () => {
    let cursor = null;
    const found = [];
    do {
      const { body, code } = await get("?limit=2" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
      assert.equal(code, 200);
      assert.deepEqual(body.summary, { total: 6, active: 3, completed: 1, cancelled: 1, unavailable: 1 });
      assert.deepEqual(body.statuses, REQUEST_STATUSES);
      found.push(...body.requests.map(row => row.id));
      cursor = body.next;
    } while (cursor);
    assert.deepEqual(found, [dateEdge.id, exhausted.id, queued.id, cancelled.id, done.id, missingDate.id]);
    const { body } = await get("?limit=1");
    const inserted = await ServiceRequest.create({ userId: customer.id, category: "mechanic", pickupLocation: { lat: 0, lng: 0 } });
    try {
      const page = await get("?limit=1&cursor=" + encodeURIComponent(body.next));
      assert.equal(page.body.requests[0].id, exhausted.id);
    } finally {
      await inserted.deleteOne();
    }
  });

  it("combines user/provider names and IDs, service, status and inclusive UTC dates", async () => {
    const query = new URLSearchParams({ q: "alma [", category: "mechanic", status: "completed", customer: customer.id,
      provider: "MUSA", from: "2026-11-20", to: "2026-11-20" });
    assert.deepEqual((await get("?" + query)).body.requests.map(row => row.id), [done.id]);
    for (const value of [done.id, provider.id, "musa"]) {
      assert.ok((await get("?q=" + value)).body.requests.some(row => row.id === done.id));
    }
    const day = await get("?from=2026-11-20&to=2026-11-20");
    assert.deepEqual(day.body.requests.map(row => row.id), [exhausted.id, queued.id, cancelled.id, done.id]);
    assert.deepEqual((await get("?status=unavailable")).body.requests.map(row => row.id), [exhausted.id]);
    assert.deepEqual((await get("?status=active")).body.requests.map(row => row.id), [dateEdge.id, queued.id, missingDate.id]);
    const empty = await get("?q=%5E.");
    assert.deepEqual(empty.body.summary, { total: 0, active: 0, completed: 0, cancelled: 0, unavailable: 0 });
    assert.deepEqual(empty.body.requests, []);
    assert.equal(empty.body.next, null);
  });

  it("returns only supported detail fields, linked payment evidence and recorded events", async () => {
    const { body } = await get("/" + done.id);
    const { request } = body;
    assert.deepEqual(request.customer, { id: customer.id, name: customer.name });
    assert.deepEqual(request.provider, { id: provider.id, name: provider.name });
    assert.equal(request.payment.cashCollectionRecorded, true);
    assert.equal(request.payment.amountMinor, 180000);
    assert.equal(request.payment.invoiceId, undefined);
    assert.equal(request.provider.location, undefined);
    assert.equal(request.timeline[0].status, "work_started");
    assert.equal(request.offers[0].outcome, "accepted");
    const cancelledDetail = (await get("/" + cancelled.id)).body.request;
    assert.equal(cancelledDetail.cancellationReason, "Customer no longer needs service");
    assert.equal(cancelledDetail.destination.lat, 31.6);
    assert.equal(cancelledDetail.payment, null);
    const exhaustedDetail = (await get("/" + exhausted.id)).body.request;
    assert.equal(exhaustedDetail.dispatch.radiusKm, 15);
    assert.deepEqual(exhaustedDetail.pickup, { addressText: null, lat: null, lng: null, expired: true });
    assert.equal(await Payment.countDocuments(), 1);
  });

  it("rejects invalid or repeated query parameters and invalid detail IDs", async () => {
    for (const query of ["limit=51", "limit=1e1", "category=invalid", "status=invalid", "to=2026-02-30",
      "from=2026-11-21&to=2026-11-20", "cursor=bad", "q=a&q=b", "customer%5B%24ne%5D=x", "page=1"]) {
      assert.equal((await get("?" + query)).code, 400, query);
    }
    assert.equal((await get("/bad-id")).code, 400);
    assert.equal((await get("/" + new mongoose.Types.ObjectId())).code, 404);
  });
});
