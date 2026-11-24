const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { createAdminLoginRateLimit } = require("../src/middleware/adminLoginRateLimit.middleware");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

function configuredApp(mode, origins) {
  const previousMode = process.env.NODE_ENV;
  const previousOrigins = process.env.CORS_ORIGIN;
  try {
    process.env.NODE_ENV = mode;
    if (origins === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = origins;
    return createApp();
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousOrigins === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousOrigins;
  }
}

describe("CORS configuration validation", () => {
  it("fails closed in production for missing, empty, or invalid origins", () => {
    for (const origins of [undefined, "", " , ", "*", "null", "https://trusted.example/path"]) {
      assert.throws(() => configuredApp("production", origins), /CORS_ORIGIN/);
    }
    assert.doesNotThrow(() => configuredApp("production", "https://admin.example,https://expo.example"));
  });

  it("uses only explicit local admin and Expo origins in development", async (t) => {
    const server = configuredApp("test").listen(0, "127.0.0.1");
    await new Promise((resolve) => server.on("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const origin of ["http://localhost:5173", "http://localhost:8081", "http://localhost:19006"]) {
      assert.equal((await fetch(`${base}/health`, { headers: { Origin: origin } })).status, 200);
    }
    assert.equal((await fetch(`${base}/health`, { headers: { Origin: "https://untrusted.example" } })).status, 403);
  });
});

describe("Admin login security and mobile compatibility", { concurrency: false }, () => {
  const adminOrigin = "https://admin.example";
  const expoOrigin = "https://expo.example";
  const password = randomBytes(24).toString("hex");
  let database, server, base;

  before(async () => {
    database = await MongoMemoryServer.create();
    await mongoose.connect(database.getUri(), { dbName: "rapidassist_auth_security_test" });
    const passwordHash = await User.hashPassword(password);
    await User.create([
      { role: "admin", name: "Test Admin", phone: "admin-security-test", email: "admin@example.invalid", passwordHash },
      { role: "user", name: "Test Customer", phone: "customer-security-test", passwordHash },
      { role: "mechanic", name: "Test Mechanic", phone: "mechanic-security-test", passwordHash },
      { role: "user", roles: ["user", "mechanic"], name: "Test Dual Role", phone: "dual-security-test", passwordHash }
    ]);
    server = configuredApp("test", ` ${adminOrigin}, ${expoOrigin} `).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.on("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (database) await database.stop();
  });

  function post(endpoint, body, headers = {}) {
    return fetch(base + endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
  }

  it("allows trusted admin and Expo Web origins with credentials and preflight", async () => {
    for (const origin of [adminOrigin, expoOrigin]) {
      const response = await fetch(`${base}/health`, { headers: { Origin: origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      const preflight = await fetch(`${base}/api/auth/admin/login`, {
        method: "OPTIONS", headers: {
          Origin: origin, "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type"
        }
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
      assert.match(preflight.headers.get("access-control-allow-headers"), /content-type/i);
    }
  });

  it("rejects untrusted, deceptive, and null origins before authentication", async () => {
    for (const origin of ["https://untrusted.example", `${adminOrigin}.evil.example`, "null"]) {
      const response = await post("/api/auth/admin/login", {}, { Origin: origin });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.deepEqual(await response.json(), { ok: false, message: "Not allowed by CORS" });
    }
  });

  it("preserves native requests without Origin and admin cookie authentication", async () => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const login = await post("/api/auth/admin/login", { email: "admin@example.invalid", password });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.role, "admin");
    const cookie = login.headers.get("set-cookie");
    assert.ok(cookie && /HttpOnly/i.test(cookie));
    const restored = await fetch(`${base}/api/auth/me`, {
      headers: { Origin: adminOrigin, Cookie: cookie.split(";")[0] }
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).user.role, "admin");
  });

  it("limits repeated admin attempts, cannot be bypassed by changing email or forwarding headers", async (t) => {
    const lookup = t.mock.method(User, "findOne", User.findOne);
    // One successful attempt was already counted. The next nine are allowed.
    for (let index = 0; index < 9; index++) {
      const response = await post("/api/auth/admin/login", {
        email: index === 0 ? "admin@example.invalid" : `unknown-${index}@example.invalid`,
        password: randomBytes(24).toString("hex")
      }, { "X-Forwarded-For": `192.0.2.${index + 1}` });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, message: "Invalid admin credentials" });
    }
    for (let index = 0; index < 2; index++) {
      const response = await post("/api/auth/admin/login", { email: "admin@example.invalid", password }, { Origin: adminOrigin });
      assert.equal(response.status, 429);
      assert.ok(Number(response.headers.get("retry-after")) > 0);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      assert.match(response.headers.get("access-control-expose-headers"), /Retry-After/i);
      assert.deepEqual(await response.json(), {
        ok: false, message: "Too many admin login attempts. Please wait and try again."
      });
    }
    assert.equal(lookup.mock.callCount(), 9);
  });

  it("issues no public session for a valid admin phone and password", async () => {
    const response = await post("/api/auth/login", { phone: "admin-security-test", password }, { Origin: expoOrigin });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { ok: false, message: "Invalid credentials" });
  });

  it("keeps customer and mechanic login working after the admin limit is exhausted", async () => {
    for (const role of ["user", "mechanic"]) {
      const phone = role === "user" ? "customer-security-test" : "mechanic-security-test";
      const response = await post("/api/auth/login", { phone, password }, { Origin: expoOrigin });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.user.role, role);
      assert.ok(data.token);
      assert.ok(response.headers.get("set-cookie"));
      const headers = { Authorization: `Bearer ${data.token}` };
      const restored = await fetch(`${base}/api/auth/me`, { headers });
      assert.equal(restored.status, 200);
      assert.equal((await restored.json()).user.role, role);
      assert.equal((await fetch(`${base}/api/admin/dashboard`, { headers })).status, 403);
    }
  });

  it("restores and switches the role of a dual-role phone account", async () => {
    const login = await post("/api/auth/login", { phone: "dual-security-test", password });
    assert.equal(login.status, 200);
    const session = await login.json();
    assert.equal(session.user.role, "user");
    assert.deepEqual(session.user.roles, ["user", "mechanic"]);
    const switched = await fetch(`${base}/api/auth/me/active-role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ activeRole: "mechanic" })
    });
    assert.equal(switched.status, 200);
    const mechanic = await switched.json();
    const restored = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${mechanic.token}` }
    });
    assert.equal((await restored.json()).user.role, "mechanic");
    const logout = await post("/api/auth/logout", {});
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /expires=/i);
  });
});

it("admin limiter isolates IPs and permits attempts again after the window", () => {
  let clock = 1000;
  const limiter = createAdminLoginRateLimit({ limit: 2, windowMs: 1000, now: () => clock });
  function attempt(ip) {
    let error;
    const headers = {};
    limiter({ ip }, { set(key, value) { headers[key] = value; } }, (err) => { error = err; });
    return { error, headers };
  }
  assert.equal(attempt("192.0.2.1").error, undefined);
  assert.equal(attempt("192.0.2.1").error, undefined);
  assert.equal(attempt("192.0.2.1").error.statusCode, 429);
  assert.equal(attempt("192.0.2.1").headers["Retry-After"], "1");
  assert.equal(attempt("192.0.2.2").error, undefined);
  clock += 1000;
  assert.equal(attempt("192.0.2.1").error, undefined);
});
