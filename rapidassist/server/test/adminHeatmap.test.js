const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { CELL_LAT_DEG, CELL_LNG_DEG } = require("../src/services/requestHeatmap");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

// Two pickups in the same ~1 km cell (F-7), one elsewhere (Saddar), one outside the service area (Lahore).
const F7_A = { lat: 33.72137, lng: 73.05481 };
const F7_B = { lat: 33.72190, lng: 73.05702 };
const SADDAR = { lat: 33.59544, lng: 73.05323 };
const LAHORE = { lat: 31.5204, lng: 74.3587 };
const cellOf = ({ lat, lng }) => ({
  lat: Number(((Math.floor(lat / CELL_LAT_DEG) + 0.5) * CELL_LAT_DEG).toFixed(5)),
  lng: Number(((Math.floor(lng / CELL_LNG_DEG) + 0.5) * CELL_LNG_DEG).toFixed(5))
});

describe("admin request heatmap (isolated real MongoDB)", () => {
  let db, server, base, admin, customer, provider;

  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_admin_heatmap_test" });
    await Promise.all([User.init(), ServiceRequest.init()]);
    [admin, customer, provider] = await User.create([
      { role: "admin", name: "Heatmap Admin" },
      { role: "user", name: "Heatmap Customer" },
      { role: "mechanic", name: "Heatmap Provider" }
    ].map((u, i) => ({ ...u, passwordHash: "fixture", phone: "fixture-heatmap-" + i })));

    const now = Date.now();
    const at = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const request = (location, category, daysAgo) => ({ userId: customer.id, category, pickupLocation: location, createdAt: at(daysAgo) });
    await ServiceRequest.create([
      request(F7_A, "mechanic", 1), request(F7_B, "car_towing", 2), request(SADDAR, "mechanic", 3),
      request(LAHORE, "mechanic", 1), request(SADDAR, "fuel_delivery", 60)
    ]);

    const fresh = new Date();
    const stale = new Date(now - 10 * 60 * 1000);
    const providerRow = (name, i, location, extra = {}) => ({
      role: "mechanic", name, passwordHash: "fixture", phone: "fixture-heatmap-p" + i, verificationStatus: "verified",
      mechanicProfile: { serviceCategory: "towing" },
      providerState: { isOnline: true, currentLocation: { ...location, updatedAt: fresh } },
      ...extra
    });
    await User.create([
      providerRow("Online F7 1", 1, F7_A),
      providerRow("Online F7 2", 2, F7_B, { mechanicProfile: { serviceCategory: "mechanic" } }),
      providerRow("Offline", 3, SADDAR, { providerState: { isOnline: false, currentLocation: { ...SADDAR, updatedAt: fresh } } }),
      providerRow("Stale", 4, SADDAR, { providerState: { isOnline: true, currentLocation: { ...SADDAR, updatedAt: stale } } }),
      providerRow("Unverified", 5, SADDAR, { verificationStatus: "pending" })
    ]);

    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/admin/heatmap`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  async function get(query = "", actor = admin) {
    const headers = actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id, role: actor.role })}` } : {};
    const response = await fetch(base + query, { headers });
    const text = await response.text();
    return { code: response.status, cache: response.headers.get("cache-control"), text, body: JSON.parse(text) };
  }

  it("is admin-only and never cached", async () => {
    assert.equal((await get("", null)).code, 401);
    assert.equal((await get("", customer)).code, 403);
    assert.equal((await get("", provider)).code, 403);
    const ok = await get("");
    assert.equal(ok.code, 200);
    assert.equal(ok.cache, "no-store");
  });

  it("counts requests per ~1 km cell inside the twin cities, newest 30 days by default", async () => {
    const { body } = await get("");
    assert.equal(body.cellKm, 1);
    assert.equal(body.days, 30);
    assert.deepEqual(body.requests, [{ ...cellOf(F7_A), count: 2 }, { ...cellOf(SADDAR), count: 1 }]);
    assert.deepEqual(cellOf(F7_A), cellOf(F7_B), "fixture: both F-7 pickups share a cell");
    assert.equal(body.totals.requests, 3, "Lahore and the 60-day-old request are excluded");
  });

  it("counts only verified, online providers with a fresh position", async () => {
    const { body } = await get("");
    assert.deepEqual(body.providers, [{ ...cellOf(F7_A), count: 2 }]);
    assert.equal(body.totals.onlineProviders, 2);
  });

  it("filters by category and period", async () => {
    const towing = (await get("?category=car_towing")).body;
    assert.deepEqual(towing.requests, [{ ...cellOf(F7_B), count: 1 }]);
    assert.deepEqual(towing.providers, [{ ...cellOf(F7_A), count: 1 }]);
    const year = (await get("?days=365&category=fuel_delivery")).body;
    assert.deepEqual(year.requests, [{ ...cellOf(SADDAR), count: 1 }]);
  });

  it("returns cell centres and counts only, never a raw pickup or provider coordinate", async () => {
    const { text, body } = await get("?days=365");
    for (const point of [F7_A, F7_B, SADDAR, LAHORE]) {
      assert.ok(!text.includes(String(point.lat)) && !text.includes(String(point.lng)), `${point.lat},${point.lng} leaked`);
    }
    for (const cell of [...body.requests, ...body.providers]) assert.deepEqual(Object.keys(cell).sort(), ["count", "lat", "lng"]);
    assert.ok(!/customer|userId|name|address|phone/i.test(text), "no identities or addresses");
  });

  it("rejects bad parameters", async () => {
    for (const query of ["?days=0", "?days=366", "?days=1.5", "?days=abc", "?category=boats"]) {
      assert.equal((await get(query)).code, 400, query);
    }
  });
});
