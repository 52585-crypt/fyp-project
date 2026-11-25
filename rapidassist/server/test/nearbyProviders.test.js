// Live nearby providers: GeoJSON location point + 2dsphere index, $geoNear preview with labelled radius expansion,
// service-area rules for provider locations, demo providers, and the migration / seed scripts (isolated MongoDB).
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { DispatchOffer } = require("../src/models/DispatchOffer");
const { signAccessToken } = require("../src/utils/jwt");
const { newDispatch, runDispatchBatch, acceptOffer } = require("../src/services/dispatch");
const { planBackfill, applyBackfill } = require("../scripts/migrateProviderLocationPoints");
const seedDemo = require("../scripts/seedDemoProviders");
const { GRID_DEG, approxLocation, distanceBand } = require("../src/services/approxLocation");

process.env.JWT_SECRET = "nearby-providers-test-secret";
process.env.NODE_ENV = "test";
delete process.env.DISPATCH_TEST_BYPASS_RADIUS;

const KM_PER_DEG = 6371 * (Math.PI / 180);
const ORIGIN = { lat: 33.5, lng: 73.1 }; // inside the service area; points are placed due north (exact distances)
const north = (km) => ({ lat: ORIGIN.lat + km / KM_PER_DEG, lng: ORIGIN.lng });
let db, server, base, customer, sequence = 0;

async function provider(location, overrides = {}, state = {}) {
  return User.create({
    name: `Provider ${++sequence}`, phone: `0311000${String(sequence).padStart(4, "0")}`, passwordHash: "test-only", role: "mechanic",
    verificationStatus: "verified", mechanicProfile: { serviceCategory: "mechanic" },
    providerState: { isOnline: true, currentLocation: { ...location, updatedAt: new Date() }, lastSeenAt: new Date(), ...state },
    ...overrides
  });
}
function api(actor, path, method = "GET", body) {
  return fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id })}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (res) => ({ status: res.status, data: await res.json() }));
}
const preview = (category = "mechanic", at = ORIGIN) => api(customer, `/api/requests/nearby-providers?category=${category}&lat=${at.lat}&lng=${at.lng}`);

describe("live nearby providers (isolated real MongoDB)", { concurrency: false }, () => {
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_nearby_test" });
    await Promise.all([User.init(), ServiceRequest.init(), DispatchOffer.init()]);
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), ServiceRequest.deleteMany({}), DispatchOffer.deleteMany({})]);
    customer = await User.create({ name: "Customer", phone: "03001112222", passwordHash: "test-only", role: "user" });
  });
  after(async () => { await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await db.stop(); });

  it("keeps the GeoJSON point in sync with currentLocation for create, whole-object and partial updates", async () => {
    const p = await provider(north(1));
    assert.deepEqual([...(await User.findById(p.id)).providerState.locationPoint.coordinates], [ORIGIN.lng, north(1).lat]);
    await User.findOneAndUpdate({ _id: p.id }, { $set: { "providerState.currentLocation": { lat: 33.7, lng: 73.05, updatedAt: new Date() } } });
    assert.deepEqual([...(await User.findById(p.id)).providerState.locationPoint.coordinates], [73.05, 33.7]);
    await User.updateOne({ _id: p.id }, { $set: { "providerState.currentLocation.lat": 33.6, "providerState.currentLocation.lng": 73.1 } });
    assert.deepEqual([...(await User.findById(p.id)).providerState.locationPoint.coordinates], [73.1, 33.6]);
    await User.updateOne({ _id: p.id }, { $set: { "providerState.currentLocation.updatedAt": new Date() } });
    assert.deepEqual([...(await User.findById(p.id)).providerState.locationPoint.coordinates], [73.1, 33.6], "timestamp-only updates keep the point");
    await User.updateOne({ _id: p.id }, { $set: { "providerState.currentLocation": { lat: null, lng: null } } });
    assert.equal((await User.findById(p.id)).providerState.locationPoint, undefined);
    const indexes = await User.collection.indexes();
    assert.ok(indexes.some((index) => index.key["providerState.locationPoint"] === "2dsphere"));
  });

  it("returns providers inside the 8 km dispatch radius without expanding", async () => {
    const near = await provider(north(3));
    await provider(north(12));
    const result = await preview();
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.providers.map((row) => row.id), [near.id]);
    assert.equal(result.data.radiusKm, 8);
    assert.equal(result.data.dispatchRadiusKm, 8);
    assert.equal(result.data.expanded, false);
  });

  it("expands 10 -> 20 -> 30 km only when nobody is closer, and reports the radius used", async () => {
    await provider(north(14));
    let result = await preview();
    assert.equal(result.data.providers.length, 1);
    assert.equal(result.data.radiusKm, 20);
    assert.equal(result.data.expanded, true);
    await User.deleteMany({ role: "mechanic" });
    await provider(north(26));
    assert.equal((await preview()).data.radiusKm, 30);
    await User.deleteMany({ role: "mechanic" });
    await provider(north(35));
    result = await preview();
    assert.deepEqual(result.data.providers, []);
    assert.equal(result.data.radiusKm, 30);
    assert.equal(result.data.expanded, true);
  });

  it("never shows offline, busy, stale-location or other-category providers", async () => {
    await provider(north(1), {}, { isOnline: false });
    await provider(north(1), {}, { activeRequestId: new mongoose.Types.ObjectId() });
    await provider(north(1), { mechanicProfile: { serviceCategory: "towing" } });
    const stale = await provider(north(1));
    await User.updateOne({ _id: stale.id }, { $set: { "providerState.currentLocation.updatedAt": new Date(Date.now() - 10 * 60 * 1000) } });
    const result = await preview();
    assert.deepEqual(result.data.providers, []);
    assert.equal(result.data.radiusKm, 30, "searched up to the widest step");
  });

  it("returns grid-snapped approximate locations and distance bands, never exact coordinates or distances", async () => {
    // Two providers in the same ~500 m cell at different exact spots.
    const exactA = { lat: 33.70123, lng: 73.05234 };
    const exactB = { lat: 33.70201, lng: 73.05189 };
    const a = await provider(exactA);
    const b = await provider(exactB);
    const fromPickups = [{ lat: 33.69, lng: 73.06 }, { lat: 33.72, lng: 73.04 }, { lat: 33.6995, lng: 73.0522 }];
    const seen = [];
    for (const pickup of fromPickups) {
      const result = await preview("mechanic", pickup);
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.data).sort(), ["dispatchRadiusKm", "expanded", "ok", "providers", "radiusKm"]);
      assert.equal(result.data.providers.length, 2);
      const text = JSON.stringify(result.data);
      for (const exact of [exactA, exactB]) {
        assert.ok(!text.includes(String(exact.lat)) && !text.includes(String(exact.lng)), "exact coordinates never leave the server");
      }
      assert.doesNotMatch(text, /"(distance|distanceKm|lat|lng|currentLocation|locationPoint|providerState)"/);
      for (const row of result.data.providers) {
        assert.deepEqual(row.approxLocation, { latitude: 33.7, longitude: 73.05 });
        for (const value of Object.values(row.approxLocation)) {
          const steps = value / GRID_DEG;
          assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, `${value} is on the ${GRID_DEG}° grid`);
        }
      }
      // Same cell => same band, whatever the exact spot: the band comes from the cell, not the real distance.
      assert.equal(result.data.providers[0].distanceBand, result.data.providers[1].distanceBand);
      seen.push(Object.fromEntries(result.data.providers.map((row) => [row.id, row.approxLocation])));
    }
    assert.deepEqual(seen[1], seen[0], "identical approximate location from different pickup points");
    assert.deepEqual(seen[2], seen[0]);
    assert.ok(seen[0][a.id] && seen[0][b.id]);
  });

  it("snaps deterministically and bands distances coarsely", () => {
    assert.deepEqual(approxLocation({ lat: 33.70123, lng: 73.05234 }), { latitude: 33.7, longitude: 73.05 });
    assert.deepEqual(approxLocation({ lat: 33.7026, lng: 73.0476 }), { latitude: 33.705, longitude: 73.05 });
    for (let i = 0; i < 5; i += 1) assert.deepEqual(approxLocation({ lat: 33.61386, lng: 73.06517 }), { latitude: 33.615, longitude: 73.065 });
    assert.deepEqual([0, 1.99, 2, 4.99, 5, 9.99, 10, 25].map(distanceBand),
      ["under 2 km", "under 2 km", "2–5 km", "2–5 km", "5–10 km", "5–10 km", "10+ km", "10+ km"]);
  });

  it("rejects provider locations outside the service area unless the provider is on an active job", async () => {
    const p = await provider(north(1));
    const lahore = { lat: 31.5204, lng: 74.3587, capturedAt: new Date().toISOString() };
    const online = await api(p, "/api/requests/provider/availability", "PATCH", { isOnline: true, location: lahore });
    assert.equal(online.status, 400);
    assert.match(online.data.message, /Islamabad & Rawalpindi only/);
    const outside = await api(p, "/api/requests/provider/location", "PATCH", { location: lahore });
    assert.equal(outside.status, 400);
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: { ...north(2), capturedAt: new Date().toISOString() } })).status, 200);
    assert.deepEqual([...(await User.findById(p.id)).providerState.locationPoint.coordinates], [ORIGIN.lng, north(2).lat]);

    // On an active job (e.g. towing to a garage outside the area) tracking continues.
    const job = await ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: north(0),
      dispatch: newDispatch("mechanic"), estimate: { total: 1000 }, status: "searching_provider" });
    const offered = await runDispatchBatch(new Date());
    assert.equal(offered.offersCreated, 1);
    await acceptOffer(job.id, p.id, (await ServiceRequest.findById(job.id)).dispatch.offerId);
    const tracking = { ...lahore, capturedAt: new Date(Date.now() + 1000).toISOString() };
    assert.equal((await api(p, "/api/requests/provider/location", "PATCH", { location: tracking })).status, 200);
  });

  it("seeds demo providers that show on the map but are never offered jobs; seeding is idempotent and removable", async () => {
    const first = await seedDemo.seed();
    assert.deepEqual(first, { total: 18, created: 18 });
    assert.deepEqual(await seedDemo.seed(), { total: 18, created: 0 });
    const demos = await User.find({ "providerState.isDemo": true });
    assert.equal(demos.length, 18);
    assert.deepEqual(new Set(demos.map((d) => d.mechanicProfile.serviceCategory)), new Set(["mechanic", "fuel_delivery", "towing"]));
    for (const demo of demos) {
      assert.ok(demo.providerState.locationPoint, "seeded with a GeoJSON point");
      assert.equal(await demo.verifyPassword("anything"), false, "demo accounts cannot log in with a guessable password");
    }
    const blueArea = { lat: 33.71276, lng: 73.063 };
    const map = await preview("mechanic", blueArea);
    assert.ok(map.data.providers.length >= 1, "demo mechanics appear on the map");
    await ServiceRequest.create({ userId: customer._id, category: "mechanic", pickupLocation: blueArea,
      dispatch: newDispatch("mechanic"), estimate: { total: 1000 }, status: "searching_provider" });
    const batch = await runDispatchBatch(new Date());
    assert.equal(batch.offersCreated, 0);
    assert.equal(await DispatchOffer.countDocuments({}), 0, "demo providers never receive offers");

    await User.updateMany({ "providerState.isDemo": true }, { $set: { "providerState.currentLocation.updatedAt": new Date(Date.now() - 10 * 60 * 1000) } });
    assert.equal((await preview("mechanic", blueArea)).data.providers.length, 0, "stale demo providers disappear");
    assert.equal(await seedDemo.refresh(), 18);
    assert.ok((await preview("mechanic", blueArea)).data.providers.length >= 1, "--keep-fresh brings them back");
    assert.equal(await seedDemo.remove(), 18);
    assert.equal(await User.countDocuments({ "providerState.isDemo": true }), 0);
  });

  it("migration backfills location points idempotently", async () => {
    await User.collection.insertOne({ name: "Legacy", phone: "03119998888", role: "mechanic", passwordHash: "x", authProvider: "local",
      providerState: { isOnline: true, currentLocation: { lat: 33.69, lng: 73.03, updatedAt: new Date() } } });
    await User.collection.insertOne({ name: "No location", phone: "03119998889", role: "user", passwordHash: "x", authProvider: "local" });
    const plan = await planBackfill();
    assert.equal(plan.length, 1);
    assert.deepEqual(await applyBackfill(plan), { modified: 1 });
    const legacy = await User.findOne({ phone: "03119998888" });
    assert.deepEqual([...legacy.providerState.locationPoint.coordinates], [73.03, 33.69]);
    assert.equal((await planBackfill()).length, 0, "a second run finds nothing");
  });
});
