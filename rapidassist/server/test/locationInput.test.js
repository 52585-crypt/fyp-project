const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { coordinateValue, readCoordinates, requireCoordinates } = require("../src/services/locationInput");
const { SERVICE_AREA_MESSAGE } = require("../src/config/serviceArea");

describe("shared location input validation", () => {
  it("accepts numbers and numeric strings only", () => {
    assert.equal(coordinateValue(33.7), 33.7);
    assert.equal(coordinateValue(" 73.05 "), 73.05);
    assert.equal(coordinateValue(-0), -0);
    for (const bad of [null, undefined, "", "  ", "abc", NaN, Infinity, true, ["33.7"], ["1", "2"], { lat: 1 }, "1e400"]) {
      assert.equal(coordinateValue(bad), null, JSON.stringify(bad));
    }
  });

  it("checks ranges for both coordinates", () => {
    assert.deepEqual(readCoordinates("33.7104", "73.0563"), { lat: 33.7104, lng: 73.0563 });
    assert.deepEqual(readCoordinates(90, -180), { lat: 90, lng: -180 });
    assert.equal(readCoordinates(90.0001, 73), null);
    assert.equal(readCoordinates(33, 180.5), null);
    assert.equal(readCoordinates(33, null), null);
  });

  it("throws a 400 with the caller's message, and the service-area message when asked", () => {
    assert.throws(() => requireCoordinates("x", 73, { message: "Pickup valid lat/lng required" }),
      (e) => e.statusCode === 400 && e.message === "Pickup valid lat/lng required");
    assert.throws(() => requireCoordinates(91, 73), (e) => e.statusCode === 400 && e.message === "Valid lat and lng are required");
    assert.throws(() => requireCoordinates(31.5204, 74.3587, { serviceArea: true }), (e) => e.statusCode === 400 && e.message === SERVICE_AREA_MESSAGE);
    assert.deepEqual(requireCoordinates(33.6, 73.05, { serviceArea: true }), { lat: 33.6, lng: 73.05 });
  });
});

describe("routes use the shared validation (isolated real MongoDB)", () => {
  const { before, after } = require("node:test");
  const { once } = require("node:events");
  const { randomBytes } = require("node:crypto");
  const mongoose = require("mongoose");
  const { MongoMemoryServer } = require("mongodb-memory-server");
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
  const { createApp } = require("../src/app");
  const { User } = require("../src/models/User");
  const { signAccessToken } = require("../src/utils/jwt");
  let db, server, base, customer, provider;

  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_location_input_test" });
    await User.init();
    [customer, provider] = await User.create([
      { role: "user", name: "Input Customer" },
      { role: "mechanic", name: "Input Provider", verificationStatus: "verified", providerState: { isOnline: true } }
    ].map((u, i) => ({ ...u, passwordHash: "fixture", phone: "fixture-input-" + i })));
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/requests`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  const call = async (user, path, method = "GET", body) => {
    const response = await fetch(base + path, { method, body: body && JSON.stringify(body),
      headers: { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}`, "Content-Type": "application/json" } });
    return { status: response.status, body: await response.json() };
  };

  it("rejects repeated, boolean and out-of-range coordinates on nearby search, provider location and new requests", async () => {
    for (const query of ["lat=33.7&lat=33.8&lng=73.05", "lat=33.7&lng=", "lat=95&lng=73.05", "lat=true&lng=73.05"]) {
      const res = await call(customer, `/nearby-providers?category=mechanic&${query}`);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.message, "Valid lat and lng are required");
    }
    assert.equal((await call(customer, "/nearby-providers?category=mechanic&lat=33.7104&lng=73.0563")).status, 200);

    for (const location of [{ lat: true, lng: 73.05 }, { lat: ["33.7"], lng: 73.05 }, { lat: 33.7, lng: 181 }]) {
      const res = await call(provider, "/provider/location", "PATCH", { location: { ...location, capturedAt: new Date().toISOString() } });
      assert.equal(res.status, 400, JSON.stringify(location));
      assert.equal(res.body.message, "Valid location lat/lng required");
    }

    const res = await call(customer, "/", "POST", { category: "mechanic", pickupLocation: { lat: ["33.7"], lng: 73.05 } });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /valid lat\/lng required/);
  });
});
