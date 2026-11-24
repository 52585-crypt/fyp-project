const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { Payment } = require("../src/models/Payment");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

describe("admin customer management", () => {
  const midnight = new Date("2026-11-20T00:00:00.000Z");
  const nextDay = new Date("2026-11-21T00:00:00.000Z");
  let db, server, base, admin, customer, dual, provider, noHistory, request;

  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri());
    await Promise.all([User.init(), ServiceRequest.init(), Payment.init()]);
    [admin, customer, dual, provider, noHistory] = await User.create([
      { role: "admin", name: "Fixture Admin" },
      { role: "user", name: "Aisha [North]", email: "aisha@example.invalid", profilePictureUrl: "https://lh3.googleusercontent.com/example", createdAt: midnight },
      { role: "mechanic", roles: ["mechanic", "user"], name: "Aisha Dual", createdAt: midnight },
      { role: "mechanic", name: "Fixture Provider", providerState: { currentLocation: { lat: 3, lng: 4 } } },
      { role: "user", name: "No History", profilePictureUrl: "https://other.example.invalid/example", createdAt: nextDay }
    ].map((user, index) => ({ ...user, passwordHash: "fixture", phone: "+923001234" + String(100 + index) })));
    const defaults = { userId: customer.id, category: "mechanic", pickupLocation: { lat: 31.52, lng: 74.35 } };
    request = await ServiceRequest.create({ ...defaults, status: "completed", providerId: provider.id,
      review: { rating: 5, byUserId: customer.id, comment: "Helpful", reviewedAt: nextDay } });
    const exhausted = await ServiceRequest.create({ ...defaults, status: "searching_provider", dispatch: { enabled: true, state: "unavailable" } });
    const otherRequest = await ServiceRequest.create({ ...defaults, userId: dual.id, category: "car_towing", status: "completed" });
    await Payment.create([
      { requestId: request.id, userId: customer.id, method: "cash", status: "paid", paidAt: midnight, collectedByUserId: provider.id },
      { requestId: exhausted.id, userId: customer.id, method: "stripe", status: "paid", stripeIntentId: "fixture-reference" },
      { requestId: otherRequest.id, userId: dual.id, method: "online_simulated", status: "paid" }
    ].map(payment => ({ ...payment, invoiceId: new mongoose.Types.ObjectId(), providerId: provider.id, amountMinor: 120000, createdAt: midnight })));
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/admin`;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  async function get(path, actor = admin) {
    const headers = actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id, role: actor.role })}` } : {};
    const response = await fetch(base + path, { headers });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  }

  it("restricts reads to admins and validates customer IDs and membership", async () => {
    for (const path of ["/customers", "/customers/" + customer.id, "/customers/" + customer.id + "/payments"]) {
      assert.equal((await get(path, null)).status, 401);
      assert.equal((await get(path, customer)).status, 403);
      assert.equal((await get(path, provider)).status, 403);
      assert.equal((await get(path)).cache, "no-store");
    }
    assert.equal((await get("/customers/bad-id")).status, 400);
    assert.equal((await get("/customers/" + admin.id)).status, 404);
    assert.equal((await get("/customers/" + provider.id + "/payments")).status, 404);
  });

  it("paginates only customer memberships newest first and counts owned requests", async () => {
    const { body } = await get("/customers?limit=2");
    assert.deepEqual(body.customers.map(row => row.id), [noHistory.id, dual.id]);
    const next = await get("/customers?limit=2&cursor=" + encodeURIComponent(body.next));
    assert.deepEqual(next.body.customers.map(row => row.id), [customer.id]);
    assert.equal(next.body.next, null);
    const row = next.body.customers[0];
    assert.deepEqual(Object.keys(row).sort(), ["createdAt", "email", "id", "maskedPhone", "name", "totalRequests"]);
    assert.equal(row.maskedPhone, "•••• 4101");
    assert.equal(row.totalRequests, 2);
  });

  it("searches exact indexed identifiers and literal name prefixes with combined filters", async () => {
    const results = async query => (await get("/customers?" + new URLSearchParams(query))).body.customers.map(row => row.id);
    for (const q of [customer.id, "AISHA@EXAMPLE.INVALID", customer.phone, "aisha ["]) {
      assert.deepEqual(await results({ q }), [customer.id]);
    }
    assert.deepEqual(await results({ q: "Aisha", activity: "has_requests", category: "mechanic", from: "2026-11-20", to: "2026-11-20" }), [customer.id]);
    assert.deepEqual(await results({ activity: "no_requests", from: "2026-11-21", to: "2026-11-21" }), [noHistory.id]);
    assert.deepEqual(await results({ category: "mechanic", activity: "no_requests" }), []);
    assert.deepEqual(await results({ q: "^.*" }), []);
    for (const query of ["q=a", "q=x&q=y", "activity=blocked", "category=bad", "status=active", "from=2026-02-30", "limit=51", "cursor=bad"]) {
      assert.equal((await get("/customers?" + query)).status, 400, query);
    }
  });

  it("uses matching lifecycle counts and recorded feedback without private account data", async () => {
    const profile = (await get("/customers/" + customer.id)).body;
    const history = (await get("/requests?customer=" + customer.id + "&limit=1")).body;
    assert.deepEqual(profile.activity, { total: 2, active: 0, completed: 1, cancelled: 0, unavailable: 1 });
    assert.deepEqual(profile.activity, history.summary);
    assert.equal(history.requests.length, 1);
    assert.ok(history.next);
    assert.equal(profile.feedback[0].comment, "Helpful");
    assert.equal(profile.feedback[0].byUserId, undefined);
    assert.ok(profile.customer.profilePictureUrl.startsWith("https://lh3.googleusercontent.com"));
    assert.deepEqual(Object.keys(profile.customer).sort(), ["createdAt", "email", "id", "maskedPhone", "name", "profilePictureUrl"]);
    assert.equal((await get("/customers/" + noHistory.id)).body.customer.profilePictureUrl, null);
  });

  it("paginates linked payments and reuses confirmed-cash evidence without Stripe references", async () => {
    const path = "/customers/" + customer.id + "/payments";
    const { body } = await get(path + "?limit=1");
    assert.equal(body.payments.length, 1);
    assert.equal(body.payments[0].method, "stripe");
    assert.equal(body.payments[0].classification, "stripe_unverified");
    const requestDetail = (await get("/requests/" + body.payments[0].requestId)).body.request;
    assert.equal(requestDetail.payment.classification, body.payments[0].classification);
    assert.deepEqual(Object.keys(body.payments[0]).sort(), ["amountMinor", "cashCollectionRecorded", "classification", "createdAt", "currency", "id", "method", "paidAt", "requestId", "status"]);
    const next = (await get(path + "?limit=1&cursor=" + encodeURIComponent(body.next))).body;
    assert.equal(next.payments[0].requestId, request.id);
    assert.equal(next.payments[0].cashCollectionRecorded, true);
    assert.equal(next.next, null);
    assert.deepEqual((await get("/customers/" + noHistory.id + "/payments")).body.payments, []);
    assert.equal((await get(path + "?customer=" + dual.id)).status, 400);
  });
});
