const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { signAccessToken } = require("../src/utils/jwt");
const { DEFAULT_CENTER, SERVICE_AREA_BOUNDS, SERVICE_AREA_MESSAGE, CITIES, isInServiceArea } = require("../src/config/serviceArea");

process.env.JWT_SECRET = "service-area-test-secret";
process.env.NODE_ENV = "test";

describe("twin-cities service area", () => {
  it("covers Islamabad and Rawalpindi incl. Bahria Town, DHA and Gulberg Greens, and nothing in Lahore", () => {
    for (const [lat, lng] of [[33.71276, 73.063], [33.59544, 73.05323], [33.55024, 73.12397], [33.53066, 73.15703], [33.60022, 73.21186]]) {
      assert.equal(isInServiceArea(lat, lng), true, `${lat},${lng}`);
    }
    assert.equal(isInServiceArea(31.5204, 74.3587), false, "Lahore");
    assert.equal(isInServiceArea(24.86, 67.0), false, "Karachi");
    assert.equal(isInServiceArea(NaN, 73), false);
    assert.equal(isInServiceArea("33.7", "73.06"), true, "numeric strings are accepted");
    assert.equal(isInServiceArea(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng), true);
    assert.deepEqual([...CITIES], ["Islamabad", "Rawalpindi"]);
  });

  it("matches the mobile app's copy exactly", () => {
    const mobile = fs.readFileSync(path.join(__dirname, "../../mobile-app/src/config/serviceArea.ts"), "utf8");
    const center = /DEFAULT_CENTER = \{ latitude: ([\d.]+), longitude: ([\d.]+) \}/.exec(mobile);
    assert.deepEqual([Number(center[1]), Number(center[2])], [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]);
    const bounds = /SERVICE_AREA_BOUNDS = \{ south: ([\d.]+), north: ([\d.]+), west: ([\d.]+), east: ([\d.]+) \}/.exec(mobile);
    assert.deepEqual(bounds.slice(1).map(Number), [SERVICE_AREA_BOUNDS.south, SERVICE_AREA_BOUNDS.north, SERVICE_AREA_BOUNDS.west, SERVICE_AREA_BOUNDS.east]);
    assert.ok(mobile.includes(`"${SERVICE_AREA_MESSAGE}"`), "same customer-facing message");
  });
});

describe("request creation enforces the service area (isolated real MongoDB)", () => {
  let db, server, base, customer;
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_service_area_test" });
    await User.init();
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    customer = await User.create({ name: "Customer", phone: "03001234567", passwordHash: "test-only", role: "user" });
  });
  after(async () => { await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await db.stop(); });

  const create = (pickupLocation) => fetch(`${base}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: customer.id })}` },
    body: JSON.stringify({ category: "mechanic", mechanicDetails: { issueCategory: "battery" }, pickupLocation })
  }).then(async (res) => ({ status: res.status, data: await res.json() }));

  it("rejects a pickup outside Islamabad & Rawalpindi with a clear message", async () => {
    const lahore = await create({ lat: 31.5204, lng: 74.3587, addressText: "Gulberg 3, Lahore" });
    assert.equal(lahore.status, 400);
    assert.equal(lahore.data.message, "RapidAssist currently serves Islamabad & Rawalpindi only");
  });

  it("accepts a pickup in Islamabad or Rawalpindi", async () => {
    assert.equal((await create({ lat: 33.72047, lng: 73.05631, addressText: "F-7 Markaz, Islamabad" })).status, 201);
    assert.equal((await create({ lat: 33.61386, lng: 73.06517, addressText: "Committee Chowk, Rawalpindi" })).status, 201);
  });
});
