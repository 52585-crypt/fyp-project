const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");

// Small limits for this process only (each test file runs in its own process), read when the router loads.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.NEARBY_PROVIDERS_RATE_LIMIT_PER_MINUTE = "3";
process.env.PROVIDER_LOCATION_RATE_LIMIT_PER_MINUTE = "2";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { createLocationRateLimit } = require("../src/middleware/locationRateLimit.middleware");
const { signAccessToken } = require("../src/utils/jwt");

describe("per-user rate limits on nearby providers and provider location (isolated real MongoDB)", () => {
  let db, server, base, alice, bob, provider;

  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_rate_limit_test" });
    await User.init();
    [alice, bob, provider] = await User.create([
      { role: "user", name: "Alice" }, { role: "user", name: "Bob" },
      { role: "mechanic", name: "Rate Provider", verificationStatus: "verified", providerState: { isOnline: true } }
    ].map((u, i) => ({ ...u, passwordHash: "fixture", phone: "fixture-rate-" + i })));
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/requests`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  const auth = (user) => ({ Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` });
  const nearby = (user) => fetch(`${base}/nearby-providers?category=mechanic&lat=33.7104&lng=73.0563`, { headers: auth(user) });
  let fix = 0;
  const locate = () => {
    const capturedAt = new Date(Date.now() + ++fix * 1000).toISOString();
    return fetch(`${base}/provider/location`, { method: "PATCH", headers: { ...auth(provider), "Content-Type": "application/json" },
      body: JSON.stringify({ lat: 33.7104, lng: 73.0563, accuracy: 10, capturedAt, sentAt: capturedAt }) });
  };

  it("answers 429 with a clear message and Retry-After once a user exceeds the nearby-provider limit", async () => {
    for (let i = 0; i < 3; i++) assert.equal((await nearby(alice)).status, 200);
    const limited = await nearby(alice);
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).message, /Too many nearby-provider requests/);
    const retryAfter = Number(limited.headers.get("retry-after"));
    assert.ok(retryAfter >= 1 && retryAfter <= 60, `Retry-After ${retryAfter}`);
    assert.equal((await nearby(bob)).status, 200, "limits are per user");
  });

  it("limits provider location updates separately", async () => {
    assert.equal((await locate()).status, 200);
    assert.equal((await locate()).status, 200);
    const limited = await locate();
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).message, /Location updates are arriving too fast/);
  });

  it("opens a new window after the old one ends", () => {
    let now = 0;
    const limit = createLocationRateLimit({ limit: 1, windowMs: 1000, now: () => now, message: "slow down" });
    const run = () => new Promise((resolve) => {
      const res = { headers: {}, set(k, v) { this.headers[k] = v; } };
      limit({ user: { _id: "u1" } }, res, (err) => resolve({ err, res }));
    });
    return (async () => {
      assert.equal((await run()).err, undefined);
      const blocked = await run();
      assert.equal(blocked.err.statusCode, 429);
      assert.equal(blocked.err.message, "slow down");
      assert.equal(blocked.res.headers["Retry-After"], "1");
      now = 1000;
      assert.equal((await run()).err, undefined);
    })();
  });
});
