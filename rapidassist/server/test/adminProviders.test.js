const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

describe("admin provider directory", () => {
  const date = new Date("2026-11-20T00:00:00Z");
  const newer = new Date("2026-11-21T00:00:00Z");
  const directory = "/provider-directory";
  let mongo, server, base, admin, customer, mechanic, fuel, towing, legacy;

  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), ServiceRequest.init()]);
    [admin, customer, mechanic, fuel, towing, legacy] = await User.create([
      { role: "admin", name: "Fixture Admin" },
      { role: "user", name: "Fixture Customer" },
      {
        role: "mechanic", name: "Fixture [Mechanic]", email: "mechanic@example.invalid", createdAt: date,
        profilePictureUrl: "https://lh3.googleusercontent.com/avatar", verificationStatus: "verified", isCertified: true,
        mechanicProfile: {
          serviceCategory: "mechanic", workshopPhotoUrl: "private-workshop", certificateUrl: "private-certificate",
          idCardFrontUrl: "private-id", liveLocation: { lat: 1, lng: 2 }
        },
        mechanicVerification: {
          submissionId: "fixture-submission", reviewState: "approved", reviewedAt: newer, reviewNote: "private-review-note",
          images: { cnic: { key: "private-object" } }
        },
        providerState: {
          isOnline: true, activeRequestId: new mongoose.Types.ObjectId(),
          lastSeenAt: newer, currentLocation: { lat: 31, lng: 74, addressText: "private-position", receivedAt: newer }
        },
        completedJobs: 222, ratingAvg: 1, ratingCount: 100
      },
      {
        role: "user", roles: ["user", "mechanic"], name: "Fixture Fuel", createdAt: newer,
        verificationStatus: "pending", mechanicProfile: { serviceCategory: "fuel_delivery" }
      },
      {
        role: "mechanic", name: "Fixture Towing", createdAt: newer, verificationStatus: "rejected",
        mechanicProfile: { serviceCategory: "towing" }, profilePictureUrl: "https://third-party.example.invalid/avatar"
      },
      { role: "mechanic", name: "Fixture Legacy", createdAt: new Date("2026-11-19T00:00:00Z") }
    ].map((user, index) => ({ ...user, passwordHash: "fixture-password", phone: "+923001234" + String(100 + index) })));
    await User.collection.updateOne({ _id: legacy._id }, { $unset: { "providerState.isOnline": "", verificationStatus: "" } });
    const job = { userId: customer._id, category: "mechanic", providerId: mechanic._id, pickupLocation: { lat: 1, lng: 2 } };
    await ServiceRequest.create([
      ...[1, 2, 3, 4, 5, 5].map((rating, index) => ({
        ...job, status: "completed", review: { rating, comment: "Feedback " + index, byUserId: customer._id, reviewedAt: new Date(+date + index) }
      })),
      { ...job, status: "cancelled", review: { rating: 1 } },
      { ...job, providerId: towing._id, category: "car_towing", status: "completed" }
    ]);
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/admin`;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  async function get(path, actor = admin) {
    const headers = actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id, role: actor.role })}` } : {};
    const response = await fetch(base + path, { headers });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  }

  it("enforces admin-only reads and validates provider membership and IDs", async () => {
    for (const path of [directory, directory + "/" + mechanic.id, "/providers?status=all&id=" + mechanic.id]) {
      assert.equal((await get(path, null)).status, 401);
      assert.equal((await get(path, customer)).status, 403);
      assert.equal((await get(path, mechanic)).status, 403);
      assert.equal((await get(path)).cache, "no-store");
    }
    assert.equal((await get(directory + "/bad")).status, 400);
    assert.equal((await get(directory + "/" + customer.id)).status, 404);
    assert.equal((await get(directory + "/" + admin.id)).status, 404);
    assert.equal((await get(directory + "/" + new mongoose.Types.ObjectId())).status, 404);
  });

  it("paginates all three categories and dual-role providers in stable registration order", async () => {
    const first = (await get(directory + "?limit=2")).body;
    assert.deepEqual(first.categories, ["mechanic", "fuel_delivery", "towing"]);
    assert.deepEqual(first.verificationStatuses, ["unverified", "pending", "verified", "rejected"]);
    assert.deepEqual(first.providers.map(row => row.id), [towing.id, fuel.id]);
    assert.deepEqual(first.providers.map(row => row.completedJobs), [1, 0]);
    const next = (await get(directory + "?limit=2&cursor=" + encodeURIComponent(first.next))).body;
    assert.deepEqual(next.providers.map(row => row.id), [mechanic.id, legacy.id]);
    assert.deepEqual(next.providers.map(row => row.completedJobs), [6, 0]);
    assert.equal(next.next, null);
    assert.deepEqual(Object.keys(next.providers[0]).sort(), [
      "category", "completedJobs", "createdAt", "id", "isOnline", "maskedPhone", "name", "profilePictureUrl", "verificationStatus"
    ]);
    assert.equal(next.providers[0].maskedPhone, "•••• 4102");
    assert.equal(next.providers[1].isOnline, null);
    assert.equal(next.providers[1].verificationStatus, null);
    assert.equal(first.providers[0].profilePictureUrl, null);
  });

  it("supports exact contact lookup, bounded literal name search and combined filters", async () => {
    const ids = async filters => (await get(directory + "?" + new URLSearchParams(filters))).body.providers.map(row => row.id);
    for (const q of [mechanic.id, mechanic.phone, "MECHANIC@EXAMPLE.INVALID", "fixture ["]) {
      assert.deepEqual(await ids({ q }), [mechanic.id]);
    }
    assert.deepEqual(await ids({ q: "^.*" }), []);
    assert.deepEqual(await ids({
      q: "Fixture", category: "mechanic", availability: "online", verification: "verified",
      activity: "completed", from: "2026-11-20", to: "2026-11-20"
    }), [mechanic.id]);
    assert.deepEqual(await ids({ category: "fuel_delivery", availability: "offline", verification: "pending", activity: "none" }), [fuel.id]);
    assert.deepEqual(await ids({ category: "towing", activity: "none" }), []);
    assert.deepEqual(await ids({ category: "towing", to: "2026-11-20" }), []);
    for (const query of [
      "q=a", "q[x]=a", "q=ab&q=xx", "q=abc%40", "availability=busy", "verification=blocked",
      "activity=active", "category=car_towing", "to=2026-02-30", "from=2026-11-22&to=2026-11-21", "cursor=bad", "limit=51"
    ]) assert.equal((await get(directory + "?" + query)).status, 400, query);
  });

  it("returns safe profile fields, stored verification and history consistent with Service Requests", async () => {
    const { body } = await get(directory + "/" + mechanic.id);
    assert.equal(body.provider.email, "mechanic@example.invalid");
    assert.equal(body.provider.profilePictureUrl, "https://lh3.googleusercontent.com/avatar");
    assert.equal(body.provider.isOnline, true);
    assert.equal(body.provider.hasActiveAssignment, true);
    assert.equal(body.provider.workshopPhotoOnFile, true);
    assert.equal(body.provider.isCertified, true);
    assert.deepEqual(body.verification, { submissionId: "fixture-submission", reviewState: "approved", reviewedAt: newer.toISOString() });
    assert.deepEqual(Object.keys(body.provider).sort(), [
      "category", "createdAt", "email", "hasActiveAssignment", "id", "isCertified", "isOnline", "maskedPhone",
      "name", "profilePictureUrl", "verificationStatus", "workshopPhotoOnFile"
    ]);
    const raw = JSON.stringify(body);
    for (const value of ["private-", mechanic.phone, "fixture-password", "lastSeenAt", "currentLocation", "receivedAt", "activeRequestId", "cnic"]) {
      assert.equal(raw.includes(value), false, value);
    }
    assert.equal((await get(directory + "/" + mechanic.id + "?loc=1")).status, 400);
    const history = (await get("/requests?provider=" + mechanic.id + "&limit=2")).body;
    assert.deepEqual(history.summary, body.activity);
    assert.deepEqual(body.activity, { total: 7, completed: 6, cancelled: 1, active: 0, unavailable: 0 });
    assert.equal(history.requests.length, 2);
    assert.ok(history.next);
    assert.equal(history.requests[0].customer.name, customer.name);
    assert.equal((await get("/requests?provider=" + mechanic.id + "&limit=2&cursor=" + encodeURIComponent(history.next))).body.requests.length, 2);
  });

  it("calculates average and distribution from all completed job reviews", async () => {
    const { body } = await get(directory + "/" + mechanic.id);
    assert.equal(body.ratings.count, 6);
    assert.equal(body.ratings.average, 20 / 6);
    assert.deepEqual(body.ratings.distribution.map(({ count }) => count), [2, 1, 1, 1, 1]);
    assert.equal(body.ratings.recent.length, 5);
    assert.equal(body.ratings.recent[0].comment, "Feedback 5");
    assert.equal(body.ratings.recent[0].byUserId, undefined);
    const { ratings } = (await get(directory + "/" + towing.id)).body;
    assert.equal(ratings.count, 0);
    assert.equal(ratings.average, null);
  });

  it("opens the exact provider in the existing verification queue while retaining the default queue", async () => {
    const focused = (await get("/providers?status=all&id=" + mechanic.id)).body;
    assert.deepEqual(focused.providers.map(row => row.id), [mechanic.id]);
    assert.deepEqual((await get("/providers")).body.providers.map(row => row.id), [fuel.id]);
    assert.equal((await get("/providers?status=all&id=invalid")).status, 400);
    const verification = (await get("/providers/" + mechanic.id + "/verification")).body;
    assert.equal(verification.verification.submissionId, "fixture-submission");
  });
});
