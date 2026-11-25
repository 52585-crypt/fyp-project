const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { Notification } = require("../src/models/Notification");
const { signAccessToken } = require("../src/utils/jwt");
const { isNearPickup, notifyProviderNearbyOnce } = require("../src/services/providerNearby");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const PICKUP = { lat: 33.7104, lng: 73.0563, addressText: "Blue Area", source: "gps" };
// Offsets north of the pickup: 0.009° of latitude ≈ 1.0 km.
const north = (km) => ({ lat: PICKUP.lat + km * 0.009, lng: PICKUP.lng });

describe("isNearPickup", () => {
  it("is true within 500 m and false beyond, or without finite coordinates", () => {
    const request = { pickupLocation: PICKUP };
    assert.equal(isNearPickup(request, north(0.45)), true);
    assert.equal(isNearPickup(request, north(0.55)), false);
    assert.equal(isNearPickup(request, { lat: NaN, lng: 73 }), false);
    assert.equal(isNearPickup({ pickupLocation: { lat: null, lng: null } }, north(0.1)), false);
  });
});

describe("provider is nearby notification (isolated real MongoDB)", () => {
  let db, server, base, customer, provider, otherProvider, request, sequence = 0;

  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_provider_nearby_test" });
    await Promise.all([User.init(), ServiceRequest.init(), Notification.init()]);
    [customer, provider, otherProvider] = await User.create([
      { role: "user", name: "Nearby Customer" },
      { role: "mechanic", name: "Bilal Khan", verificationStatus: "verified", providerState: { isOnline: true } },
      { role: "mechanic", name: "Other Provider", verificationStatus: "verified", providerState: { isOnline: true } }
    ].map((u, i) => ({ ...u, passwordHash: "fixture", phone: "fixture-nearby-" + i })));
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/requests`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await Promise.all([ServiceRequest.deleteMany({}), Notification.deleteMany({})]);
    request = await ServiceRequest.create({ userId: customer.id, providerId: provider.id, category: "mechanic",
      status: "provider_on_way", pickupLocation: PICKUP, acceptedAt: new Date(), mechanicDetails: { issueType: "battery" } });
    await User.updateOne({ _id: provider.id }, { $set: { "providerState.activeRequestId": request._id },
      $unset: { "providerState.currentLocation": 1, "providerState.locationPoint": 1 } });
  });

  async function moveTo(point) {
    // Strictly increasing capture times, so every fix is newer than the stored one.
    const capturedAt = new Date(Date.now() + ++sequence * 1000).toISOString();
    const response = await fetch(base + "/provider/location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: provider.id, role: "mechanic" })}` },
      body: JSON.stringify({ ...point, accuracy: 10, capturedAt, sentAt: capturedAt })
    });
    assert.equal(response.status, 200, await response.text());
  }
  const nearbyNotes = () => Notification.find({ type: "provider_nearby" }).lean();

  it("notifies the customer once, the first time the provider comes within 500 m of the pickup", async () => {
    await moveTo(north(2));
    await moveTo(north(0.8));
    assert.equal((await nearbyNotes()).length, 0, "not near yet");
    await moveTo(north(0.4));
    let notes = await nearbyNotes();
    assert.equal(notes.length, 1);
    assert.equal(String(notes[0].userId), customer.id);
    assert.equal(notes[0].title, "Your provider is nearby");
    assert.match(notes[0].body, /^Bilal is less than 500 m away/);
    assert.deepEqual(notes[0].data, { requestId: request.id, route: "/(user)/tracking" });
    // Closer, GPS jitter back over the line and in again: still exactly one.
    await moveTo(north(0.2));
    await moveTo(north(0.6));
    await moveTo(north(0.3));
    notes = await nearbyNotes();
    assert.equal(notes.length, 1);
    assert.ok((await ServiceRequest.findById(request.id)).providerNearbyNotifiedAt instanceof Date);
  });

  it("sends exactly one notification when several updates race", async () => {
    const fresh = await ServiceRequest.findById(request.id);
    const providerDoc = await User.findById(provider.id);
    const results = await Promise.all(Array.from({ length: 6 }, () => notifyProviderNearbyOnce(fresh, providerDoc, north(0.1))));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await nearbyNotes()).length, 1);
  });

  it("stays silent once the provider has arrived, and for a provider not assigned to the request", async () => {
    await ServiceRequest.updateOne({ _id: request._id }, { $set: { status: "provider_arrived" } });
    await moveTo(north(0.1));
    assert.equal((await nearbyNotes()).length, 0);

    await ServiceRequest.updateOne({ _id: request._id }, { $set: { status: "provider_on_way" } });
    const fresh = await ServiceRequest.findById(request.id);
    assert.equal(await notifyProviderNearbyOnce(fresh, await User.findById(otherProvider.id), north(0.1)), false);
    assert.equal((await nearbyNotes()).length, 0);
  });
});
