#!/usr/bin/env node
/**
 * RapidAssist backend end-to-end API + Socket.io QA suite.
 * Requires the QA stack (node qa-tests/lib/start-stack.js). Writes qa-tests/results/api-results.json.
 */
const path = require("node:path");
const { io } = require("socket.io-client");
const { Client, Recorder, expectStatus, leaks, sleep, stackState } = require("../lib/harness");

const ROOT = path.resolve(__dirname, "../..");
const { MongoClient, ObjectId } = require(path.join(ROOT, "server/node_modules/mongodb"));

const state = stackState();
const BASE = state.apiUrl;
const R = new Recorder("API");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const RUN = Date.now().toString().slice(-6);
let phoneSeq = 0;
const newPhone = () => `0300${RUN}${String(phoneSeq++).padStart(2, "0")}`.slice(0, 13);
const PASSWORD = "Str0ngPass!";

// Islamabad test points (all inside the twin-cities service area)
const PICKUP = { lat: 33.7077, lng: 73.0498, addressText: "F-7 Markaz, Islamabad", source: "manual_map" };
const DESTINATION = { lat: 33.6844, lng: 73.0479, addressText: "G-9 Markaz, Islamabad", source: "manual_map" };
const LAHORE = { lat: 31.5204, lng: 74.3587, addressText: "Lahore", source: "manual_map" };
const NEAR = {
  // Deliberately off the 0.005° privacy grid so exact vs. approximate positions can be told apart.
  mechanic: { lat: 33.71537, lng: 73.05612 },
  mechanicB: { lat: 33.71219, lng: 73.05333 },
  fuel: { lat: 33.70113, lng: 73.04224 },
  towing: { lat: 33.70041, lng: 73.06071 }
};

function fix(point, { ageMs = 0 } = {}) {
  const now = Date.now();
  return {
    lat: point.lat, lng: point.lng, accuracy: 12,
    capturedAt: new Date(now - ageMs).toISOString(),
    sentAt: new Date(now).toISOString()
  };
}

const client = (label) => new Client(BASE, label);
const accounts = {};
const sockets = {};

async function register(label, body) {
  const c = client(label);
  const res = await c.post("/api/auth/register", body, { auth: "none" });
  if (res.status === 201) {
    c.token = res.body.token;
    c.user = res.body.user;
  }
  return { c, res };
}

function mechanicBody(category, name) {
  const profile = category === "mechanic"
    ? { serviceCategory: category, workshopPhotoUrl: PNG, certificateUrl: PNG }
    : { serviceCategory: category, drivingLicenseUrl: PNG };
  return { role: "mechanic", name, phone: newPhone(), password: PASSWORD, mechanicProfile: profile };
}

async function connectSocket(token, label) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false, timeout: 5000 });
    const events = [];
    s.onAny((name, payload) => events.push({ name, payload, at: Date.now() }));
    s.on("connect", () => resolve({ s, events, label }));
    s.on("connect_error", (e) => reject(e));
  });
}

async function waitFor(predicate, timeoutMs = 8000, interval = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(interval);
  }
  return null;
}

const hasEvent = (sock, fn) => sock.events.find((e) => fn(e));

/** Poll a provider's offer feed until `requestId` is offered to them. Returns the offerId or null. */
async function waitForOffer(provider, requestId, timeoutMs = 30000) {
  return waitFor(async () => {
    const res = await provider.get("/api/requests/open");
    const hit = res.body?.requests?.find((r) => r.id === requestId);
    return hit?.dispatch?.offerId || null;
  }, timeoutMs, 700);
}

async function refreshLocation(provider, point) {
  return provider.patch("/api/requests/provider/location", { location: fix(point) });
}

async function goOnline(provider, point) {
  return provider.patch("/api/requests/provider/availability", { isOnline: true, location: fix(point) });
}

async function createRequest(user, body) {
  return user.post("/api/requests", body);
}

const mechanicReq = (issueCategory, vehicleId) => ({
  category: "mechanic", pickupLocation: PICKUP, mechanicDetails: { issueCategory }, vehicleId,
  description: `QA ${issueCategory} issue`
});
const fuelReq = (fuelType, liters, vehicleId) => ({
  category: "fuel_delivery", pickupLocation: PICKUP, fuelDetails: { fuelType, liters }, vehicleId
});
const towReq = (vehicleId) => ({
  category: "car_towing", pickupLocation: PICKUP, destinationLocation: DESTINATION, vehicleId
});

async function advance(provider, id, status) {
  return provider.patch(`/api/requests/${id}/status`, { status });
}

async function main() {
  const mongo = await MongoClient.connect(state.mongoUri);
  const db = mongo.db();

  // ───────────────────────────── Health ─────────────────────────────
  await R.check("Setup", "GET /health", "GET /health", "200 {ok:true}", async () => {
    const r = await client("anon").get("/health", { auth: "none" });
    return { pass: r.status === 200 && r.body?.ok === true, actual: `HTTP ${r.status} ${r.text}` };
  });

  // ───────────────────────────── AUTH ─────────────────────────────
  const userPhone = newPhone();
  let reg = await register("user1", { role: "user", name: "QA Customer", phone: userPhone, password: PASSWORD });
  accounts.user = reg.c;
  await R.check("Auth", "Register customer (valid)", "POST /api/auth/register role=user", "201, token, role=user, httpOnly cookie",
    async () => {
      const cookie = reg.res.setCookie.join(" ");
      return {
        pass: reg.res.status === 201 && !!reg.res.body?.token && reg.res.body.user.role === "user" && /HttpOnly/i.test(cookie),
        actual: `HTTP ${reg.res.status}, role=${reg.res.body?.user?.role}, cookie httpOnly=${/HttpOnly/i.test(cookie)}`
      };
    });

  reg = await register("user2", { role: "user", name: "QA Other Customer", phone: newPhone(), password: PASSWORD });
  accounts.user2 = reg.c;

  for (const [key, category, name] of [
    ["mech", "mechanic", "QA Mechanic A"],
    ["fuel", "fuel_delivery", "QA Fuel Provider"],
    ["tow", "towing", "QA Tow Provider"],
    ["mechB", "mechanic", "QA Mechanic B"],
    ["mechU", "mechanic", "QA Unverified Mechanic"]
  ]) {
    const r = await register(key, mechanicBody(category, name));
    accounts[key] = r.c;
    if (["mech", "fuel", "tow"].includes(key)) {
      await R.check("Auth", `Register provider (${category}) is pending verification`,
        `POST /api/auth/register role=mechanic serviceCategory=${category}`,
        "201 and verificationStatus=pending",
        async () => ({
          pass: r.res.status === 201 && r.res.body?.user?.verificationStatus === "pending"
            && r.res.body.user.mechanicProfile?.serviceCategory === category,
          actual: `HTTP ${r.res.status}, verificationStatus=${r.res.body?.user?.verificationStatus}, category=${r.res.body?.user?.mechanicProfile?.serviceCategory}`
        }));
    }
  }
  const { user, user2, mech, fuel, tow, mechB, mechU } = accounts;

  await R.check("Auth", "Register with duplicate phone", "POST /register with the customer's phone again", "409 Phone already registered", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "user", name: "Dup", phone: userPhone, password: PASSWORD }, { auth: "none" }), 409));
  await R.check("Auth", "Register with invalid role (admin)", "POST /register role=admin", "400 Invalid role", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "admin", name: "Evil", phone: newPhone(), password: PASSWORD }, { auth: "none" }), 400));
  await R.check("Auth", "Register with invalid role (random)", "POST /register role=superuser", "400 Invalid role", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "superuser", name: "Evil", phone: newPhone(), password: PASSWORD }, { auth: "none" }), 400));
  await R.check("Auth", "Register with missing name", "POST /register without name", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "user", phone: newPhone(), password: PASSWORD }, { auth: "none" }), 400));
  await R.check("Auth", "Register with missing phone", "POST /register without phone", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "user", name: "No Phone", password: PASSWORD }, { auth: "none" }), 400));
  await R.check("Auth", "Register with missing password", "POST /register without password", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "user", name: "No Pass", phone: newPhone() }, { auth: "none" }), 400));
  await R.check("Auth", "Register with empty body", "POST /register {}", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", {}, { auth: "none" }), 400));
  await R.check("Auth", "Register with too-short password (5 chars)", "POST /register password=12345", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "user", name: "Weak", phone: newPhone(), password: "12345" }, { auth: "none" }), 400));
  await R.check("Auth", "Register with weak password (123456)", "POST /register password=123456", "400 – a trivially guessable password should be rejected",
    async () => {
      const r = await client("x").post("/api/auth/register", { role: "user", name: "Weak Six", phone: newPhone(), password: "123456" }, { auth: "none" });
      return { pass: r.status === 400, actual: `HTTP ${r.status} (only a length >= 6 rule exists)` };
    });
  await R.check("Auth", "Register with non-numeric phone", "POST /register phone=abcdefghijk", "400 invalid phone number",
    async () => {
      const r = await client("x").post("/api/auth/register", { role: "user", name: "Letters Phone", phone: "abcdefghijk", password: PASSWORD }, { auth: "none" });
      return { pass: r.status === 400, actual: `HTTP ${r.status} (phone is only length-checked)` };
    });
  await R.check("Auth", "Register mechanic with invalid serviceCategory", "POST /register role=mechanic serviceCategory=plumber", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "mechanic", name: "Plumber", phone: newPhone(), password: PASSWORD, mechanicProfile: { serviceCategory: "plumber" } }, { auth: "none" }), 400));
  await R.check("Auth", "Register mechanic (mechanic category) without workshop/certificate photos", "POST /register mechanic without images", "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "mechanic", name: "No Docs", phone: newPhone(), password: PASSWORD, mechanicProfile: { serviceCategory: "mechanic" } }, { auth: "none" }), 400));
  await R.check("Auth", "Mass assignment on register", "POST /register role=user with verificationStatus=verified, isCertified=true, ratingAvg=5", "Extra fields ignored", async () => {
    const r = await client("x").post("/api/auth/register", { role: "mechanic", name: "Sneaky", phone: newPhone(), password: PASSWORD, verificationStatus: "verified", isCertified: true, ratingAvg: 5, completedJobs: 99, mechanicProfile: { serviceCategory: "towing", drivingLicenseUrl: PNG } }, { auth: "none" });
    const u = r.body?.user;
    return { pass: r.status === 201 && u.verificationStatus === "pending" && u.isCertified === false && u.ratingAvg === 0 && u.completedJobs === 0, actual: `HTTP ${r.status}, verificationStatus=${u?.verificationStatus}, isCertified=${u?.isCertified}, ratingAvg=${u?.ratingAvg}` };
  });

  const loginClient = client("login");
  let loginRes;
  await R.check("Auth", "Login with correct credentials", "POST /api/auth/login", "200, token, cookie", async () => {
    loginRes = await loginClient.post("/api/auth/login", { phone: userPhone, password: PASSWORD }, { auth: "none" });
    loginClient.token = loginRes.body?.token;
    return { pass: loginRes.status === 200 && !!loginRes.body?.token && loginClient.cookies.size > 0, actual: `HTTP ${loginRes.status}, token=${!!loginRes.body?.token}, cookies=${[...loginClient.cookies.keys()].join(",")}` };
  });
  await R.check("Auth", "Login with wrong password", "POST /login wrong password", "401 Invalid credentials", async () =>
    expectStatus(await client("x").post("/api/auth/login", { phone: userPhone, password: "WrongPass1" }, { auth: "none" }), 401));
  await R.check("Auth", "Login with unknown phone", "POST /login unknown phone", "401 with the same message as wrong password (no account enumeration)", async () => {
    const a = await client("x").post("/api/auth/login", { phone: "03999999999", password: PASSWORD }, { auth: "none" });
    const b = await client("x").post("/api/auth/login", { phone: userPhone, password: "WrongPass1" }, { auth: "none" });
    return { pass: a.status === 401 && a.body?.message === b.body?.message, actual: `HTTP ${a.status} "${a.body?.message}" vs "${b.body?.message}"` };
  });
  await R.check("Auth", "Login with missing fields", "POST /login {}", "400", async () =>
    expectStatus(await client("x").post("/api/auth/login", {}, { auth: "none" }), 400));
  await R.check("Auth", "Admin account cannot log in through the mobile login", "POST /login phone=admin-system password=<admin password>", "401", async () =>
    expectStatus(await client("x").post("/api/auth/login", { phone: "admin-system", password: state.admin.password }, { auth: "none" }), 401));
  await R.check("Auth", "GET /me with bearer token", "GET /api/auth/me Authorization: Bearer", "200 with user", async () => {
    const r = await user.get("/api/auth/me");
    return { pass: r.status === 200 && r.body?.user?.id === user.user.id, actual: `HTTP ${r.status}, id match=${r.body?.user?.id === user.user.id}` };
  });
  await R.check("Auth", "GET /me with cookie only", "GET /api/auth/me with only the auth cookie", "200", async () =>
    expectStatus(await loginClient.get("/api/auth/me", { auth: "cookie" }), 200));
  await R.check("Auth", "GET /me without token", "GET /api/auth/me no auth", "401", async () =>
    expectStatus(await client("x").get("/api/auth/me", { auth: "none" }), 401));
  await R.check("Auth", "GET /me with tampered token", "Bearer token with modified signature", "401", async () => {
    const c = client("tamper"); c.token = user.token.slice(0, -4) + "AAAA";
    return expectStatus(await c.get("/api/auth/me"), 401);
  });
  await R.check("Auth", "GET /me with unsigned (alg=none) token", "Bearer token with alg=none", "401", async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const c = client("none"); c.token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: user.user.id, role: "user" })}.`;
    return expectStatus(await c.get("/api/auth/me"), 401);
  });
  await R.check("Auth", "Logout clears cookie", "POST /api/auth/logout then GET /me with cookie", "Set-Cookie clears token; /me with cookie -> 401", async () => {
    const out = await loginClient.post("/api/auth/logout", {}, { auth: "cookie" });
    const me = await loginClient.get("/api/auth/me", { auth: "cookie" });
    return { pass: out.status === 200 && me.status === 401, actual: `logout HTTP ${out.status}, clear-cookie="${(out.setCookie[0] || "").slice(0, 60)}…", /me via cookie HTTP ${me.status}` };
  });
  await R.check("Security", "JWT still valid after logout (no server-side revocation)", "Logout, then reuse the same bearer token", "401 – a logged-out token should not keep working",
    async () => {
      const r = await loginClient.get("/api/auth/me");
      return { pass: r.status === 401, actual: `HTTP ${r.status} – token issued before logout still accepted (stateless JWT, 7-day expiry)` };
    });
  await R.check("Security", "NoSQL injection in login phone", 'POST /login {"phone":{"$ne":null},"password":"x"}', "401/400, never 200", async () =>
    expectStatus(await client("x").post("/api/auth/login", { phone: { $ne: null }, password: "x" }, { auth: "none" }), [400, 401]));
  await R.check("Security", "NoSQL injection in login password", 'POST /login {"phone":<real>,"password":{"$ne":null}}', "401/400", async () =>
    expectStatus(await client("x").post("/api/auth/login", { phone: userPhone, password: { $ne: null } }, { auth: "none" }), [400, 401]));
  await R.check("Security", "NoSQL injection in admin login", 'POST /auth/admin/login {"email":{"$ne":null},"password":{"$ne":null}}', "400/401", async () =>
    expectStatus(await client("x").post("/api/auth/admin/login", { email: { $ne: null }, password: { $ne: null } }, { auth: "none" }), [400, 401]));
  await R.check("Security", "NoSQL injection in register phone", 'POST /register phone={"$gt":""}', "400", async () =>
    expectStatus(await client("x").post("/api/auth/register", { role: "user", name: "Inject", phone: { $gt: "" }, password: PASSWORD }, { auth: "none" }), 400));
  await R.check("Security", "Malformed JSON body", "POST /login with invalid JSON", "400 Invalid JSON", async () =>
    expectStatus(await client("x").req("POST", "/api/auth/login", undefined, { auth: "none", rawBody: "{bad json" }), 400));
  await R.check("Security", "CORS rejects untrusted origin", "GET /health with Origin: https://evil.example", "No Access-Control-Allow-Origin for evil origin", async () => {
    const r = await fetch(`${BASE}/health`, { headers: { Origin: "https://evil.example" } });
    const acao = r.headers.get("access-control-allow-origin");
    return { pass: acao !== "https://evil.example" && acao !== "*", actual: `HTTP ${r.status}, ACAO=${acao}` };
  });
  await R.check("Security", "CORS allows admin-panel origin", "GET /health with Origin: http://localhost:5173", "ACAO echoes origin with credentials", async () => {
    const r = await fetch(`${BASE}/health`, { headers: { Origin: "http://localhost:5173" } });
    return { pass: r.headers.get("access-control-allow-origin") === "http://localhost:5173", actual: `ACAO=${r.headers.get("access-control-allow-origin")}, credentials=${r.headers.get("access-control-allow-credentials")}` };
  });

  // ───────────────────────────── VEHICLES ─────────────────────────────
  let vehicle; let vehicle2;
  await R.check("Vehicles", "Create vehicle", "POST /api/vehicles {type:car, make, model, year}", "201 vehicle owned by caller", async () => {
    const r = await user.post("/api/vehicles", { type: "car", make: "Toyota", model: "Corolla", year: 2018, registrationNumber: "ICT-1234", userId: user2.user.id });
    vehicle = r.body?.vehicle;
    return { pass: r.status === 201 && vehicle?.userId === user.user.id, actual: `HTTP ${r.status}, owner=${vehicle?.userId === user.user.id ? "caller (userId in body ignored)" : vehicle?.userId}` };
  });
  await user.post("/api/vehicles", { type: "car", make: "Suzuki", model: "Mehran", year: 2010 }).then((r) => { vehicle2 = r.body?.vehicle; });
  await R.check("Vehicles", "List my vehicles", "GET /api/vehicles", "200, only my vehicles", async () => {
    const r = await user.get("/api/vehicles");
    const mine = (r.body?.vehicles || []).every((v) => v.userId === user.user.id);
    return { pass: r.status === 200 && r.body.vehicles.length === 2 && mine, actual: `HTTP ${r.status}, count=${r.body?.vehicles?.length}, all mine=${mine}` };
  });
  await R.check("Vehicles", "Other customer's list does not include my vehicles", "GET /api/vehicles as user2", "200, 0 vehicles", async () => {
    const r = await user2.get("/api/vehicles");
    return { pass: r.status === 200 && r.body.vehicles.length === 0, actual: `HTTP ${r.status}, count=${r.body?.vehicles?.length}` };
  });
  await R.check("Vehicles", "Update vehicle", "PATCH /api/vehicles/:id {model, year}", "200 updated", async () => {
    const r = await user.patch(`/api/vehicles/${vehicle.id}`, { model: "Corolla Altis", year: 2019 });
    return { pass: r.status === 200 && r.body?.vehicle?.model === "Corolla Altis" && r.body.vehicle.year === 2019, actual: `HTTP ${r.status}, model=${r.body?.vehicle?.model}, year=${r.body?.vehicle?.year}` };
  });
  await R.check("Vehicles", "Create vehicle with invalid type", "POST /api/vehicles type=plane", "400", async () =>
    expectStatus(await user.post("/api/vehicles", { type: "plane", make: "X", model: "Y", year: 2018 }), 400));
  await R.check("Vehicles", "Create vehicle with invalid year", "POST /api/vehicles year=1800", "400", async () =>
    expectStatus(await user.post("/api/vehicles", { type: "car", make: "X", model: "Y", year: 1800 }), 400));
  await R.check("Vehicles", "Create vehicle with missing make/model", "POST /api/vehicles {type:car, year}", "400", async () =>
    expectStatus(await user.post("/api/vehicles", { type: "car", year: 2018 }), 400));
  await R.check("Security", "IDOR: other customer edits my vehicle", "PATCH /api/vehicles/:myId as user2", "403", async () =>
    expectStatus(await user2.patch(`/api/vehicles/${vehicle.id}`, { model: "Hacked" }), 403));
  await R.check("Security", "IDOR: other customer deletes my vehicle", "DELETE /api/vehicles/:myId as user2", "403", async () =>
    expectStatus(await user2.del(`/api/vehicles/${vehicle.id}`), 403));
  await R.check("Security", "IDOR: provider edits a customer's vehicle", "PATCH /api/vehicles/:id as mechanic", "403", async () =>
    expectStatus(await mech.patch(`/api/vehicles/${vehicle.id}`, { model: "Hacked" }), 403));
  await R.check("Vehicles", "Invalid vehicle id", "PATCH /api/vehicles/not-an-id", "400", async () =>
    expectStatus(await user.patch("/api/vehicles/not-an-id", { model: "X" }), 400));
  await R.check("Vehicles", "Unknown vehicle id", "DELETE /api/vehicles/<random ObjectId>", "404", async () =>
    expectStatus(await user.del(`/api/vehicles/${new ObjectId()}`), 404));
  await R.check("Vehicles", "Provider account can manage vehicles", "POST /api/vehicles as mechanic", "Customers only (403) – providers have no vehicle screen",
    async () => {
      const r = await mech.post("/api/vehicles", { type: "car", make: "Honda", model: "City", year: 2020 });
      if (r.body?.vehicle?.id) await mech.del(`/api/vehicles/${r.body.vehicle.id}`);
      return { pass: r.status === 403, actual: `HTTP ${r.status} – a provider can create (and list/delete) vehicles; no role check in vehicles.controller` };
    });
  await R.check("Vehicles", "Delete vehicle", "DELETE /api/vehicles/:id then GET list", "200, removed from list", async () => {
    const r = await user.del(`/api/vehicles/${vehicle2.id}`);
    const list = await user.get("/api/vehicles");
    return { pass: r.status === 200 && !list.body.vehicles.some((v) => v.id === vehicle2.id), actual: `HTTP ${r.status}, remaining=${list.body.vehicles.length}` };
  });
  await R.check("Security", "Vehicles without JWT", "GET /api/vehicles no auth", "401", async () =>
    expectStatus(await client("x").get("/api/vehicles", { auth: "none" }), 401));

  // ───────────────────────────── ADMIN ─────────────────────────────
  const admin = client("admin");
  await R.check("Admin", "Admin login", "POST /api/auth/admin/login", "200 with admin token", async () => {
    const r = await admin.post("/api/auth/admin/login", { email: state.admin.email, password: state.admin.password }, { auth: "none" });
    admin.token = r.body?.token;
    return { pass: r.status === 200 && r.body?.user?.role === "admin", actual: `HTTP ${r.status}, role=${r.body?.user?.role}` };
  });
  await R.check("Admin", "Admin login wrong password", "POST /api/auth/admin/login wrong password", "401", async () =>
    expectStatus(await client("x").post("/api/auth/admin/login", { email: state.admin.email, password: "nope-nope-nope" }, { auth: "none" }), 401));
  await R.check("Admin", "Dashboard stats", "GET /api/admin/dashboard", "200 with stats.users/providers/vehicles/pendingProviders", async () => {
    const r = await admin.get("/api/admin/dashboard");
    const s = r.body?.stats || {};
    return { pass: r.status === 200 && s.users >= 2 && s.providers >= 5 && s.pendingProviders >= 5 && s.vehicles >= 1, actual: `HTTP ${r.status}, users=${s.users}, providers=${s.providers}, pending=${s.pendingProviders}, vehicles=${s.vehicles}` };
  });
  await R.check("Admin", "List pending providers", "GET /api/admin/providers?status=pending", "200, includes the new mechanics", async () => {
    const r = await admin.get("/api/admin/providers?status=pending");
    const ids = (r.body?.providers || []).map((p) => p.id);
    const all = [mech, fuel, tow, mechB, mechU].every((m) => ids.includes(m.user.id));
    return { pass: r.status === 200 && all, actual: `HTTP ${r.status}, count=${ids.length}, all QA mechanics listed=${all}` };
  });
  await R.check("Admin", "List providers with invalid status filter", "GET /api/admin/providers?status=foo", "400", async () =>
    expectStatus(await admin.get("/api/admin/providers?status=foo"), 400));
  await R.check("Admin", "Admin routes require admin (customer token)", "GET /api/admin/dashboard as customer", "401/403 (admin auth is present in this branch)", async () =>
    expectStatus(await user.get("/api/admin/dashboard"), [401, 403]));
  await R.check("Admin", "Admin routes without token", "GET /api/admin/dashboard no auth", "401", async () =>
    expectStatus(await client("x").get("/api/admin/dashboard", { auth: "none" }), 401));
  await R.check("Admin", "Mechanic self-submits verification (AWS)", "POST /api/mechanic-verification as pending mechanic", "201 in production / 503 in QA (no AWS bucket)", async () => {
    const r = await mech.post("/api/mechanic-verification", { biometricConsent: true, profilePhoto: PNG, profilePhotoLeft: PNG, profilePhotoRight: PNG, cnicFront: PNG });
    return { pass: r.status === 503, skip: false, actual: `HTTP ${r.status} "${r.body?.message}" – real submission needs AWS S3/Rekognition, seeded in DB instead`, note: "Submission path not exercised end-to-end" };
  });
  await R.check("Admin", "Approve provider without a submission", "PATCH /api/admin/providers/:id/verification {status:verified} before any submission", "409", async () =>
    expectStatus(await admin.patch(`/api/admin/providers/${mech.user.id}/verification`, { status: "verified" }), 409));

  // Seed an "awaiting_review" submission (the AWS step) for every provider, then approve/reject via the real admin API.
  for (const m of [mech, fuel, tow, mechB, mechU]) {
    await db.collection("users").updateOne({ _id: new ObjectId(m.user.id) }, { $set: { mechanicVerification: {
      submissionId: `qa-sub-${m.user.id}`, reviewState: "awaiting_review",
      consent: { version: "mechanic-face-verification-v2", grantedAt: new Date() }
    } } });
  }
  await R.check("Admin", "Verification detail", "GET /api/admin/providers/:id/verification", "200 with submissionId + reviewState", async () => {
    const r = await admin.get(`/api/admin/providers/${mech.user.id}/verification`);
    return { pass: r.status === 200 && r.body?.verification?.reviewState === "awaiting_review", actual: `HTTP ${r.status}, reviewState=${r.body?.verification?.reviewState}` };
  });
  await R.check("Admin", "Verification with invalid status value", "PATCH .../verification {status:approved}", "400", async () =>
    expectStatus(await admin.patch(`/api/admin/providers/${mech.user.id}/verification`, { status: "approved", submissionId: `qa-sub-${mech.user.id}` }), 400));
  await R.check("Admin", "Verification with stale submissionId", "PATCH .../verification {status:verified, submissionId:wrong}", "409", async () =>
    expectStatus(await admin.patch(`/api/admin/providers/${mech.user.id}/verification`, { status: "verified", submissionId: "wrong" }), 409));
  await R.check("Admin", "Reject without reason", "PATCH .../verification {status:rejected} no note", "400", async () =>
    expectStatus(await admin.patch(`/api/admin/providers/${mechU.user.id}/verification`, { status: "rejected", submissionId: `qa-sub-${mechU.user.id}` }), 400));
  await R.check("Admin", "Verification on invalid provider id", "PATCH /api/admin/providers/abc/verification", "400", async () =>
    expectStatus(await admin.patch("/api/admin/providers/abc/verification", { status: "verified" }), 400));
  await R.check("Admin", "Verification on a customer id", "PATCH /api/admin/providers/<customerId>/verification", "404", async () =>
    expectStatus(await admin.patch(`/api/admin/providers/${user.user.id}/verification`, { status: "verified" }), 404));
  for (const [m, label] of [[mech, "mechanic"], [fuel, "fuel_delivery"], [tow, "towing"], [mechB, "mechanic B"]]) {
    await R.check("Admin", `Approve provider (${label})`, "PATCH .../verification {status:verified, submissionId}", "200 verificationStatus=verified, isCertified=true", async () => {
      const r = await admin.patch(`/api/admin/providers/${m.user.id}/verification`, { status: "verified", submissionId: `qa-sub-${m.user.id}` });
      return { pass: r.status === 200 && r.body?.provider?.verificationStatus === "verified" && r.body.provider.isCertified === true, actual: `HTTP ${r.status}, status=${r.body?.provider?.verificationStatus}` };
    });
  }
  await R.check("Admin", "Reject provider with reason", "PATCH .../verification {status:rejected, note}", "200 verificationStatus=rejected", async () => {
    const r = await admin.patch(`/api/admin/providers/${mechU.user.id}/verification`, { status: "rejected", note: "Blurry CNIC", submissionId: `qa-sub-${mechU.user.id}` });
    return { pass: r.status === 200 && r.body?.provider?.verificationStatus === "rejected", actual: `HTTP ${r.status}, status=${r.body?.provider?.verificationStatus}` };
  });
  await R.check("Admin", "Approval visible to provider", "GET /api/auth/me as approved mechanic", "verificationStatus=verified", async () => {
    const r = await mech.get("/api/auth/me");
    return { pass: r.body?.user?.verificationStatus === "verified", actual: `verificationStatus=${r.body?.user?.verificationStatus}` };
  });
  await R.check("Admin", "Provider directory / active jobs / heatmap / payments / customers endpoints", "GET provider-directory, active-jobs, heatmap, payments, customers, requests, finance/earnings, activity", "200 for each", async () => {
    const urls = ["/api/admin/provider-directory", "/api/admin/active-jobs", "/api/admin/heatmap", "/api/admin/payments", "/api/admin/customers", "/api/admin/requests", "/api/admin/finance/earnings", "/api/admin/activity"];
    const out = [];
    for (const u of urls) out.push(`${u.replace("/api/admin", "")}=${(await admin.get(u)).status}`);
    return { pass: out.every((x) => x.endsWith("=200")), actual: out.join(", ") };
  });

  // ───────────────────────────── SOCKETS ─────────────────────────────
  await R.check("Realtime", "Socket connect without token is rejected", "io(BASE) with no auth", "connect_error Unauthorized", async () => {
    try { const s = await connectSocket(null, "anon"); s.s.close(); return { pass: false, actual: "connected without token" }; }
    catch (e) { return { pass: /Unauthorized/.test(e.message), actual: `connect_error: ${e.message}` }; }
  });
  for (const key of ["user", "user2", "mech", "fuel", "tow", "mechB"]) {
    sockets[key] = await connectSocket(accounts[key].token, key);
  }
  await R.check("Realtime", "Customer + provider sockets connect with JWT", "io(BASE,{auth:{token}}) for 2 customers and 4 providers", "all connected", async () =>
    ({ pass: Object.values(sockets).every((s) => s.s.connected), actual: `${Object.values(sockets).filter((s) => s.s.connected).length}/6 connected` }));

  // ───────────────────────────── PROVIDER AVAILABILITY ─────────────────────────────
  await R.check("Provider", "Pending/rejected mechanic cannot go online", "PATCH /requests/provider/availability {isOnline:true} as rejected mechanic", "403", async () =>
    expectStatus(await goOnline(mechU, NEAR.mechanic), 403));
  await R.check("Provider", "Go online without a location", "PATCH availability {isOnline:true} without location", "400", async () =>
    expectStatus(await mech.patch("/api/requests/provider/availability", { isOnline: true }), 400));
  await R.check("Provider", "Go online outside service area", "PATCH availability {isOnline:true, location: Lahore}", "400", async () =>
    expectStatus(await mech.patch("/api/requests/provider/availability", { isOnline: true, location: fix(LAHORE) }), 400));
  await R.check("Provider", "Share location while offline", "PATCH /requests/provider/location while offline", "403", async () =>
    expectStatus(await refreshLocation(fuel, NEAR.fuel), 403));
  for (const [m, p, label] of [[mech, NEAR.mechanic, "mechanic"], [fuel, NEAR.fuel, "fuel"], [tow, NEAR.towing, "towing"]]) {
    await R.check("Provider", `Verified ${label} provider goes online`, "PATCH availability {isOnline:true, fresh GPS in Islamabad}", "200 isOnline=true", async () => {
      const r = await goOnline(m, p);
      return { pass: r.status === 200 && r.body?.provider?.providerState?.isOnline === true, actual: `HTTP ${r.status}, isOnline=${r.body?.provider?.providerState?.isOnline}` };
    });
  }
  await R.check("Provider", "Update location while online", "PATCH /requests/provider/location", "200", async () =>
    expectStatus(await refreshLocation(mech, NEAR.mechanic), 200));
  await R.check("Provider", "Out-of-order (older) location fix", "PATCH provider/location with capturedAt 10 min older than stored", "409, stored location not overwritten", async () =>
    expectStatus(await mech.patch("/api/requests/provider/location", { location: { ...NEAR.mechanic, capturedAt: new Date(Date.now() - 600000).toISOString(), sentAt: new Date().toISOString() } }), 409));
  await R.check("Provider", "Location with invalid coordinates", "PATCH provider/location lat=999", "400", async () =>
    expectStatus(await mech.patch("/api/requests/provider/location", { location: { lat: 999, lng: 73 } }), 400));
  await R.check("Security", "Customer cannot use provider availability", "PATCH provider/availability as customer", "403", async () =>
    expectStatus(await user.patch("/api/requests/provider/availability", { isOnline: true, location: fix(PICKUP) }), 403));

  // ───────────────────────────── NEARBY PROVIDERS ─────────────────────────────
  for (const [category, m] of [["mechanic", mech], ["fuel_delivery", fuel], ["car_towing", tow]]) {
    await R.check("Requests", `Nearby providers (${category})`, `GET /requests/nearby-providers?category=${category}&lat&lng`, "200, lists the online provider of that category only, approximate location", async () => {
      const r = await user.get(`/api/requests/nearby-providers?category=${category}&lat=${PICKUP.lat}&lng=${PICKUP.lng}`);
      const list = r.body?.providers || [];
      const found = list.find((p) => p.id === m.user.id);
      const otherCategory = list.some((p) => p.serviceCategory !== (category === "car_towing" ? "towing" : category));
      const exact = NEAR[category === "car_towing" ? "towing" : category === "fuel_delivery" ? "fuel" : "mechanic"];
      const exactLeak = found && found.approxLocation?.latitude === exact.lat && found.approxLocation?.longitude === exact.lng;
      return { pass: r.status === 200 && !!found && !otherCategory && !exactLeak && !("lat" in (found || {})), actual: `HTTP ${r.status}, count=${list.length}, found=${!!found}, band=${found?.distanceBand}, exact coords exposed=${!!exactLeak}` };
    });
  }
  await R.check("Requests", "Nearby providers with invalid category", "GET nearby-providers?category=plumbing", "400", async () =>
    expectStatus(await user.get(`/api/requests/nearby-providers?category=plumbing&lat=${PICKUP.lat}&lng=${PICKUP.lng}`), 400));
  await R.check("Requests", "Nearby providers without coordinates", "GET nearby-providers?category=mechanic", "400", async () =>
    expectStatus(await user.get("/api/requests/nearby-providers?category=mechanic"), 400));
  await R.check("Security", "Provider cannot call nearby-providers", "GET nearby-providers as mechanic", "403", async () =>
    expectStatus(await mech.get(`/api/requests/nearby-providers?category=mechanic&lat=${PICKUP.lat}&lng=${PICKUP.lng}`), 403));
  await R.check("Requests", "Rejected provider never appears in nearby list", "GET nearby-providers?category=mechanic", "QA Unverified Mechanic absent", async () => {
    const r = await user.get(`/api/requests/nearby-providers?category=mechanic&lat=${PICKUP.lat}&lng=${PICKUP.lng}`);
    return { pass: !(r.body?.providers || []).some((p) => p.id === mechU.user.id), actual: `present=${(r.body?.providers || []).some((p) => p.id === mechU.user.id)}` };
  });

  // ───────────────────────────── CREATE REQUEST VALIDATION ─────────────────────────────
  const invalidCreates = [
    ["Invalid category", { category: "plumbing", pickupLocation: PICKUP }],
    ["Pickup outside service area (Lahore)", { ...fuelReq("petrol", 5), pickupLocation: LAHORE }],
    ["Missing pickup location", { category: "fuel_delivery", fuelDetails: { fuelType: "petrol", liters: 5 } }],
    ["Fuel type not petrol/diesel", fuelReq("kerosene", 5)],
    ["Fuel liters 0", fuelReq("petrol", 0)],
    ["Fuel liters 51", fuelReq("petrol", 51)],
    ["Mechanic issue not in list", mechanicReq("sunroof")],
    ["Towing without destination", { category: "car_towing", pickupLocation: PICKUP }],
    ["Invalid priority", { ...fuelReq("petrol", 5), priority: "asap" }],
    ["Invalid vehicleId", { ...fuelReq("petrol", 5), vehicleId: "abc" }]
  ];
  for (const [label, body] of invalidCreates) {
    await R.check("Requests", `Create request rejected: ${label}`, "POST /api/requests", "400", async () =>
      expectStatus(await createRequest(user, body), 400));
  }
  await R.check("Security", "IDOR: create request with another customer's vehicle", "POST /api/requests vehicleId=<user1 vehicle> as user2", "403", async () =>
    expectStatus(await createRequest(user2, fuelReq("petrol", 5, vehicle.id)), 403));
  await R.check("Security", "Provider cannot create a customer request", "POST /api/requests as mechanic", "403", async () =>
    expectStatus(await createRequest(mech, fuelReq("petrol", 5)), 403));
  await R.check("Security", "Create request without JWT", "POST /api/requests no auth", "401", async () =>
    expectStatus(await client("x").post("/api/requests", fuelReq("petrol", 5), { auth: "none" }), 401));

  // ───────────────────────────── FUEL (petrol) FULL LIFECYCLE ─────────────────────────────
  const completed = []; // { id, provider }
  async function dispatchAndAccept(label, provider, body, otherProviders) {
    await refreshLocation(provider, label.startsWith("fuel") ? NEAR.fuel : label.startsWith("tow") ? NEAR.towing : NEAR.mechanic);
    const created = await createRequest(user, body);
    const req = created.body?.request;
    await R.check("Requests", `Create ${label} request`, `POST /api/requests ${JSON.stringify({ category: body.category, ...(body.fuelDetails || {}), ...(body.mechanicDetails || {}) })}`, "201 status=searching_provider with estimate",
      async () => ({ pass: created.status === 201 && req?.status === "searching_provider" && req.estimate?.total > 0, actual: `HTTP ${created.status}, status=${req?.status}, estimate=${req?.estimate?.total} ${req?.estimate?.currency}` }));
    if (!req) return null;
    await R.check("Realtime", `${label}: customer socket receives request:changed after create`, "listen request:changed on customer socket", "event for this request", async () => {
      const e = await waitFor(() => hasEvent(sockets.user, (x) => x.name === "request:changed" && x.payload.requestId === req.id), 5000);
      return { pass: !!e, actual: e ? `kind=${e.payload.kind}` : "no event" };
    });
    const offerId = await waitForOffer(provider, req.id);
    await R.check("Dispatch", `${label}: offer sent to the matching-category provider`, "poll GET /requests/open as the provider", "request appears with dispatch.offerId within 30 s", async () =>
      ({ pass: !!offerId, actual: offerId ? `offerId=${offerId.slice(0, 8)}…` : "no offer within 30 s" }));
    await R.check("Realtime", `${label}: provider socket receives the new-offer event`, "listen request:changed on provider socket", "kind=offer", async () => {
      const e = await waitFor(() => hasEvent(sockets[provider.label], (x) => x.name === "request:changed" && x.payload.requestId === req.id && x.payload.kind === "offer"), 5000);
      return { pass: !!e, actual: e ? `kind=${e.payload.kind}` : "no offer event" };
    });
    for (const other of otherProviders) {
      await R.check("Dispatch", `${label}: wrong-category provider (${other.label}) does not see the request`, "GET /requests/open as other-category provider", "request absent", async () => {
        const r = await other.get("/api/requests/open");
        return { pass: !(r.body?.requests || []).some((x) => x.id === req.id), actual: `visible=${(r.body?.requests || []).some((x) => x.id === req.id)}` };
      });
      await R.check("Dispatch", `${label}: wrong-category provider (${other.label}) cannot accept`, "PATCH /requests/:id/accept {offerId} as other provider", "409", async () =>
        expectStatus(await other.patch(`/api/requests/${req.id}/accept`, { offerId }), [403, 409]));
    }
    await R.check("Dispatch", `${label}: customer cannot accept`, "PATCH /requests/:id/accept as customer", "403", async () =>
      expectStatus(await user.patch(`/api/requests/${req.id}/accept`, { offerId }), 403));
    await R.check("Dispatch", `${label}: rejected mechanic cannot accept`, "PATCH /requests/:id/accept {offerId} as rejected mechanic", "403/409", async () =>
      expectStatus(await mechU.patch(`/api/requests/${req.id}/accept`, { offerId }), [403, 409]));
    await R.check("Requests", `${label}: offered provider can view request details`, "GET /requests/:id as offered provider", "200", async () =>
      expectStatus(await provider.get(`/api/requests/${req.id}`), 200));
    await R.check("Security", `${label}: non-offered provider cannot view request details`, "GET /requests/:id as unrelated provider", "403", async () =>
      expectStatus(await mechB.get(`/api/requests/${req.id}`), 403));
    await R.check("Chat", `${label}: chat before assignment`, "POST /requests/:id/messages before accept", "400 Chat is available after provider assignment", async () =>
      expectStatus(await user.post(`/api/requests/${req.id}/messages`, { body: "hello?" }), 400));
    const acc = await provider.patch(`/api/requests/${req.id}/accept`, { offerId });
    await R.check("Dispatch", `${label}: provider accepts offer`, "PATCH /requests/:id/accept {offerId}", "200 status=provider_assigned, providerId set", async () =>
      ({ pass: acc.status === 200 && acc.body?.request?.status === "provider_assigned" && acc.body.request.providerId === provider.user.id, actual: `HTTP ${acc.status}, status=${acc.body?.request?.status}` }));
    await R.check("Realtime", `${label}: customer receives accept event`, "listen request:changed kind=assigned", "event received", async () => {
      const e = await waitFor(() => hasEvent(sockets.user, (x) => x.name === "request:changed" && x.payload.requestId === req.id && x.payload.kind === "assigned"), 5000);
      return { pass: !!e, actual: e ? `kind=assigned status=${e.payload.status}` : "no event" };
    });
    await R.check("Requests", `${label}: provider sees customer contact after assignment`, "GET /requests/:id as assigned provider", "200 with customer name", async () => {
      const r = await provider.get(`/api/requests/${req.id}`);
      return { pass: r.status === 200 && !!r.body?.request?.customer?.name, actual: `HTTP ${r.status}, customer=${r.body?.request?.customer?.name}` };
    });
    await R.check("Provider", `${label}: provider/active returns the job`, "GET /requests/provider/active", "200 request.id = this job", async () => {
      const r = await provider.get("/api/requests/provider/active");
      return { pass: r.body?.request?.id === req.id, actual: `HTTP ${r.status}, active=${r.body?.request?.id === req.id}` };
    });
    return { req, offerId };
  }

  async function lifecycle(label, provider, req, middle) {
    const steps = ["provider_on_way", "provider_arrived", ...middle, "service_finished"];
    for (const s of steps) {
      const r = await advance(provider, req.id, s);
      await R.check("Lifecycle", `${label}: ${s}`, `PATCH /requests/:id/status {status:${s}} as provider`, `200 status=${s}`, async () =>
        ({ pass: r.status === 200 && r.body?.request?.status === s, actual: `HTTP ${r.status}, status=${r.body?.request?.status}` }));
      if (s === "provider_on_way") {
        await R.check("Realtime", `${label}: customer receives status event`, "listen request:changed kind=status", "status=provider_on_way", async () => {
          const e = await waitFor(() => hasEvent(sockets.user, (x) => x.payload?.requestId === req.id && x.payload.status === "provider_on_way"), 5000);
          return { pass: !!e, actual: e ? `kind=${e.payload.kind}` : "no event" };
        });
        const loc = await refreshLocation(provider, { lat: PICKUP.lat + 0.003, lng: PICKUP.lng + 0.003 });
        await R.check("Realtime", `${label}: provider location update reaches customer`, "PATCH provider/location during job; listen kind=location; GET request providerLocation", "event + providerLocation present", async () => {
          const e = await waitFor(() => hasEvent(sockets.user, (x) => x.payload?.requestId === req.id && x.payload.kind === "location"), 5000);
          const g = await user.get(`/api/requests/${req.id}`);
          return { pass: loc.status === 200 && !!e && !!g.body?.request?.providerLocation, actual: `update HTTP ${loc.status}, event=${!!e}, providerLocation=${!!g.body?.request?.providerLocation}` };
        });
      }
    }
  }

  async function completeAndPay(label, provider, req) {
    const early = await user.patch(`/api/requests/${req.id}/review`, { rating: 5 });
    await R.check("Review", `${label}: review before completion`, "PATCH /requests/:id/review before completed", "400", async () => expectStatus(early, 400));
    const pc = await advance(provider, req.id, "completed");
    await R.check("Lifecycle", `${label}: provider cannot mark completed`, "PATCH status=completed as provider", "403 – customer confirmation required", async () => expectStatus(pc, 403));
    const done = await user.patch(`/api/requests/${req.id}/status`, { status: "completed" });
    await R.check("Lifecycle", `${label}: customer confirms completion`, "PATCH status=completed as customer", "200 status=completed", async () =>
      ({ pass: done.status === 200 && done.body?.request?.status === "completed", actual: `HTTP ${done.status}, status=${done.body?.request?.status}` }));
    await R.check("Lifecycle", `${label}: status change after completion`, "PATCH status=provider_on_way after completed", "400 already closed", async () =>
      expectStatus(await advance(provider, req.id, "provider_on_way"), [400, 403]));
    const pay = await user.post(`/api/payments/request/${req.id}`, { method: "cash", idempotencyKey: `qa-cash-${req.id}` });
    const collect = await provider.patch(`/api/payments/request/${req.id}/cash-collected`, {});
    await R.check("Payments", `${label}: cash payment selected and collected`, "POST /payments/request/:id {method:cash}; provider PATCH cash-collected", "200 pending -> paid", async () =>
      ({ pass: pay.status === 200 && collect.status === 200 && collect.body?.payment?.status === "paid", actual: `select HTTP ${pay.status} (${pay.body?.payment?.status}), collect HTTP ${collect.status} (${collect.body?.payment?.status}), invoice total=${(pay.body?.invoice?.totalMinor || 0) / 100}` }));
    completed.push({ id: req.id, provider, invoice: pay.body?.invoice });
    return done.body?.request;
  }

  // FUEL – petrol
  const fuelJob = await dispatchAndAccept("fuel (petrol 10 L)", fuel, fuelReq("petrol", 10, vehicle.id), [tow, mech]);
  if (fuelJob) {
    const { req } = fuelJob;
    await R.check("Requests", "fuel: estimate correct (petrol 10 L)", "check estimate", "275*10 + 450 + 150 = 3350", async () =>
      ({ pass: req.estimate.total === 3350, actual: `total=${req.estimate.total}` }));
    await R.check("Lifecycle", "fuel: skip transition (assigned -> arrived)", "PATCH status=provider_arrived from provider_assigned", "400", async () =>
      expectStatus(await advance(fuel, req.id, "provider_arrived"), 400));
    await R.check("Lifecycle", "fuel: customer cannot advance status", "PATCH status=provider_on_way as customer", "403", async () =>
      expectStatus(await advance(user, req.id, "provider_on_way"), 403));
    await R.check("Lifecycle", "fuel: other provider cannot advance status", "PATCH status=provider_on_way as towing provider", "403", async () =>
      expectStatus(await advance(tow, req.id, "provider_on_way"), 403));
    await R.check("Lifecycle", "fuel: unknown status value", "PATCH status=teleported", "400", async () =>
      expectStatus(await advance(fuel, req.id, "teleported"), 400));
    await R.check("Lifecycle", "fuel: missing status", "PATCH status={} (no status)", "400", async () =>
      expectStatus(await fuel.patch(`/api/requests/${req.id}/status`, {}), 400));
    await R.check("ExtraWork", "fuel: extra work not allowed for fuel", "PATCH /requests/:id/extra-work as fuel provider", "400", async () =>
      expectStatus(await fuel.patch(`/api/requests/${req.id}/extra-work`, { description: "Oil top-up", partPrice: 500 }), 400));

    // Chat on the fuel job
    const um = await user.post(`/api/requests/${req.id}/messages`, { body: "Hi, I'm near the blue car", clientMessageId: "qa-msg-user-1" });
    await R.check("Chat", "Customer sends chat message", "POST /requests/:id/messages as customer", "201", async () => expectStatus(um, 201));
    await R.check("Realtime", "Provider receives chat:message socket event", "listen chat:message on provider socket", "event with message body", async () => {
      const e = await waitFor(() => hasEvent(sockets.fuel, (x) => x.name === "chat:message" && x.payload.requestId === req.id), 5000);
      return { pass: !!e, actual: e ? `body="${e.payload.message.body}"` : "no event" };
    });
    const pm = await fuel.post(`/api/requests/${req.id}/messages`, { body: "On my way, 5 minutes" });
    await R.check("Chat", "Provider sends chat message", "POST /requests/:id/messages as provider", "201", async () => expectStatus(pm, 201));
    await R.check("Realtime", "Customer receives chat:message socket event", "listen chat:message on customer socket", "event", async () => {
      const e = await waitFor(() => hasEvent(sockets.user, (x) => x.name === "chat:message" && x.payload.requestId === req.id), 5000);
      return { pass: !!e, actual: e ? `senderRole=${e.payload.message.senderRole}` : "no event" };
    });
    await R.check("Chat", "Both sides read the conversation", "GET /requests/:id/messages as customer and provider", "200, 2 messages in order", async () => {
      const a = await user.get(`/api/requests/${req.id}/messages`);
      const b = await fuel.get(`/api/requests/${req.id}/messages`);
      return { pass: a.status === 200 && b.status === 200 && a.body.messages.length === 2 && b.body.messages.length === 2 && a.body.messages[0].senderRole === "user", actual: `customer ${a.status}/${a.body?.messages?.length}, provider ${b.status}/${b.body?.messages?.length}` };
    });
    await R.check("Chat", "Duplicate clientMessageId is idempotent", "POST same clientMessageId again", "200 same message id, no duplicate", async () => {
      const r = await user.post(`/api/requests/${req.id}/messages`, { body: "Hi, I'm near the blue car", clientMessageId: "qa-msg-user-1" });
      const list = await user.get(`/api/requests/${req.id}/messages`);
      return { pass: r.status === 200 && r.body?.message?.id === um.body?.message?.id && list.body.messages.length === 2, actual: `HTTP ${r.status}, sameId=${r.body?.message?.id === um.body?.message?.id}, count=${list.body?.messages?.length}` };
    });
    await R.check("Security", "Outsider customer cannot read chat", "GET /requests/:id/messages as user2", "403", async () =>
      expectStatus(await user2.get(`/api/requests/${req.id}/messages`), 403));
    await R.check("Security", "Outsider customer cannot post chat", "POST /requests/:id/messages as user2", "403", async () =>
      expectStatus(await user2.post(`/api/requests/${req.id}/messages`, { body: "spam" }), 403));
    await R.check("Security", "Unassigned provider cannot read chat", "GET /requests/:id/messages as mechanic", "403", async () =>
      expectStatus(await mech.get(`/api/requests/${req.id}/messages`), 403));
    await R.check("Chat", "Empty message rejected", "POST messages body=''", "400", async () =>
      expectStatus(await user.post(`/api/requests/${req.id}/messages`, { body: "   " }), 400));
    await R.check("Chat", "Message over 1000 chars rejected", "POST messages body=1001 chars", "400", async () =>
      expectStatus(await user.post(`/api/requests/${req.id}/messages`, { body: "x".repeat(1001) }), 400));
    await R.check("Realtime", "Outsider socket gets no events for this request", "inspect user2 socket events", "none for this request", async () => {
      const leaked = sockets.user2.events.filter((x) => x.payload?.requestId === req.id);
      return { pass: leaked.length === 0, actual: `${leaked.length} events` };
    });
    await R.check("Security", "IDOR: other customer reads my request", "GET /requests/:id as user2", "403", async () =>
      expectStatus(await user2.get(`/api/requests/${req.id}`), 403));
    await R.check("Security", "IDOR: other customer cancels my request", "PATCH /requests/:id/status {cancelled} as user2", "403", async () =>
      expectStatus(await user2.patch(`/api/requests/${req.id}/status`, { status: "cancelled" }), 403));

    await lifecycle("fuel", fuel, req, ["fuel_delivered"]);
    const fuelDone = await completeAndPay("fuel", fuel, req);
    await R.check("Provider", "fuel: provider freed after completion", "GET provider/active after completion", "request=null", async () => {
      const r = await fuel.get("/api/requests/provider/active");
      return { pass: r.status === 200 && r.body?.request === null, actual: `active=${r.body?.request?.id || null}` };
    });

    // Reviews on the fuel job
    for (const [rating, label] of [[0, "0"], [6, "6"], [3.5, "3.5"], ["five", "'five'"]]) {
      await R.check("Review", `Rating ${label} rejected`, `PATCH /requests/:id/review {rating:${label}}`, "400", async () =>
        expectStatus(await user.patch(`/api/requests/${req.id}/review`, { rating }), 400));
    }
    await R.check("Review", "Provider cannot review", "PATCH review as provider", "403", async () =>
      expectStatus(await fuel.patch(`/api/requests/${req.id}/review`, { rating: 5 }), 403));
    await R.check("Review", "Other customer cannot review", "PATCH review as user2", "403", async () =>
      expectStatus(await user2.patch(`/api/requests/${req.id}/review`, { rating: 1 }), 403));
    await R.check("Review", "Comment over 400 chars rejected", "PATCH review comment=401 chars", "400", async () =>
      expectStatus(await user.patch(`/api/requests/${req.id}/review`, { rating: 4, comment: "y".repeat(401) }), 400));
    const rv = await user.patch(`/api/requests/${req.id}/review`, { rating: 5, comment: "Fast delivery" });
    await R.check("Review", "Customer reviews completed job", "PATCH review {rating:5}", "200, review saved", async () =>
      ({ pass: rv.status === 200 && rv.body?.request?.review?.rating === 5, actual: `HTTP ${rv.status}, rating=${rv.body?.request?.review?.rating}` }));
    await R.check("Review", "Provider rating/completedJobs updated", "GET /auth/me as fuel provider", "ratingAvg=5, ratingCount=1, completedJobs=1", async () => {
      const r = await fuel.get("/api/auth/me");
      const u = r.body?.user;
      return { pass: u.ratingAvg === 5 && u.ratingCount === 1 && u.completedJobs === 1, actual: `ratingAvg=${u.ratingAvg}, ratingCount=${u.ratingCount}, completedJobs=${u.completedJobs}` };
    });
    const rv2 = await user.patch(`/api/requests/${req.id}/review`, { rating: 1, comment: "Changed my mind" });
    await R.check("Review", "Review can only be submitted once", "PATCH review a second time {rating:1}", "409/400 – second review rejected", async () => {
      const me = await fuel.get("/api/auth/me");
      return { pass: [400, 409].includes(rv2.status), actual: `HTTP ${rv2.status}, review overwritten to rating=${rv2.body?.request?.review?.rating}; provider ratingAvg now ${me.body?.user?.ratingAvg}` };
    });
    void fuelDone;
  }

  // FUEL – diesel estimate only, then cancel before assignment (fuel provider stays offline-free)
  await R.check("Requests", "fuel: diesel estimate (20 L)", "POST /api/requests fuel diesel 20 L then cancel", "201, 290*20+450+150 = 6400", async () => {
    await fuel.patch("/api/requests/provider/availability", { isOnline: false });
    const r = await createRequest(user, fuelReq("diesel", 20));
    if (r.body?.request?.id) await user.patch(`/api/requests/${r.body.request.id}/status`, { status: "cancelled" });
    return { pass: r.status === 201 && r.body.request.estimate.total === 6400, actual: `HTTP ${r.status}, total=${r.body?.request?.estimate?.total}` };
  });
  await goOnline(fuel, NEAR.fuel);

  // ───────────────────────────── TOWING ─────────────────────────────
  const towJob = await dispatchAndAccept("towing", tow, towReq(vehicle.id), [fuel]);
  if (towJob) {
    const { req } = towJob;
    await R.check("Requests", "towing: estimate uses road distance", "check estimate lines", "Base 1200 + distance*180 + 250", async () => {
      const dist = req.estimate.lines.find((l) => l.label.startsWith("Distance"));
      return { pass: req.estimate.lines[0].amount === 1200 && !!dist && req.estimate.total === 1200 + dist.amount + 250, actual: `lines=${req.estimate.lines.map((l) => `${l.label}:${l.amount}`).join(" | ")}, total=${req.estimate.total}` };
    });
    await R.check("Lifecycle", "towing: wrong-category status (fuel_delivered)", "PATCH status=fuel_delivered at provider_arrived on a towing job", "400", async () => {
      await advance(tow, req.id, "provider_on_way");
      await advance(tow, req.id, "provider_arrived");
      return expectStatus(await advance(tow, req.id, "fuel_delivered"), 400);
    });
    await R.check("Lifecycle", "towing: reached_destination -> completed directly (spec flow)", "vehicle_loaded -> reached_destination -> PATCH completed as customer", "Spec: allowed. Code: requires service_finished first",
      async () => {
        await advance(tow, req.id, "vehicle_loaded");
        await advance(tow, req.id, "reached_destination");
        const r = await user.patch(`/api/requests/${req.id}/status`, { status: "completed" });
        return { pass: r.status === 403, actual: `HTTP ${r.status} – server requires provider 'service_finished' before customer 'completed' (documented flow differs from spec, behaviour is consistent)` };
      });
    const fin = await advance(tow, req.id, "service_finished");
    await R.check("Lifecycle", "towing: service_finished after reached_destination", "PATCH status=service_finished", "200", async () => expectStatus(fin, 200));
    await R.check("Realtime", "towing: customer saw arrived + loaded + reached events", "inspect customer socket", "statuses provider_arrived, vehicle_loaded, reached_destination", async () => {
      const seen = new Set(sockets.user.events.filter((x) => x.payload?.requestId === req.id).map((x) => x.payload.status));
      const need = ["provider_arrived", "vehicle_loaded", "reached_destination", "service_finished"];
      return { pass: need.every((s) => seen.has(s)), actual: `seen=${[...seen].join(",")}` };
    });
    await completeAndPay("towing", tow, req);
    await user.patch(`/api/requests/${req.id}/review`, { rating: 4 });
  }

  // ───────────────────────────── MECHANIC (all issue types) ─────────────────────────────
  // Create + cancel-before-assignment for the 4 issue types not used in the full lifecycles.
  await mech.patch("/api/requests/provider/availability", { isOnline: false });
  for (const issue of ["tyre", "brake", "overheating", "general_inspection"]) {
    await R.check("Requests", `mechanic: create '${issue}' request`, `POST /api/requests category=mechanic issueCategory=${issue}`, "201 estimate 1250 (inspection 900 + visit 350)", async () => {
      const r = await createRequest(user, mechanicReq(issue, vehicle.id));
      const c = r.body?.request?.id ? await user.patch(`/api/requests/${r.body.request.id}/status`, { status: "cancelled" }) : null;
      return { pass: r.status === 201 && r.body.request.estimate.total === 1250 && c?.status === 200 && c.body?.request?.status === "cancelled", actual: `HTTP ${r.status}, total=${r.body?.request?.estimate?.total}, cancel-before-assignment HTTP ${c?.status} -> ${c?.body?.request?.status}` };
    });
  }
  await R.check("Requests", "Customer can have many open requests at once", "Create 3 mechanic requests back-to-back as one customer", "Spam/duplicate protection (e.g. 409 when an active request exists)",
    async () => {
      const ids = [];
      for (let i = 0; i < 3; i++) { const r = await createRequest(user2, mechanicReq("battery")); if (r.status === 201) ids.push(r.body.request.id); }
      for (const id of ids) await user2.patch(`/api/requests/${id}/status`, { status: "cancelled" });
      return { pass: ids.length <= 1, actual: `${ids.length} simultaneous active requests accepted` };
    });
  const cancelled = await createRequest(user, mechanicReq("battery"));
  await user.patch(`/api/requests/${cancelled.body.request.id}/status`, { status: "cancelled" });
  await R.check("Lifecycle", "Cancel an already-cancelled request", "PATCH status=cancelled twice", "No error and no change (idempotent no-op) or 400", async () => {
    const r = await user.patch(`/api/requests/${cancelled.body.request.id}/status`, { status: "cancelled" });
    const timeline = r.body?.request?.statusTimeline?.filter((t) => t.status === "cancelled").length;
    return { pass: r.status === 400 || (r.status === 200 && r.body.request.status === "cancelled" && timeline === 1), actual: `HTTP ${r.status}, status=${r.body?.request?.status}, cancelled entries in timeline=${timeline} (repeat of same status is a no-op)` };
  });
  await R.check("Lifecycle", "Customer cannot re-open a cancelled request", "PATCH status=searching_provider on cancelled request", "400/403", async () =>
    expectStatus(await user.patch(`/api/requests/${cancelled.body.request.id}/status`, { status: "searching_provider" }), [400, 403]));
  await R.check("Dispatch", "Cancelled request cannot be accepted", "PATCH /accept on cancelled request", "409", async () =>
    expectStatus(await mech.patch(`/api/requests/${cancelled.body.request.id}/accept`, { offerId: "x" }), 409));
  await R.check("Chat", "Message on a cancelled, never-assigned request", "POST messages on cancelled request", "400", async () =>
    expectStatus(await user.post(`/api/requests/${cancelled.body.request.id}/messages`, { body: "hi" }), 400));
  await R.check("Requests", "List my requests", "GET /api/requests", "200, only my requests, newest first", async () => {
    const r = await user.get("/api/requests");
    const list = r.body?.requests || [];
    const mine = list.every((x) => x.userId === user.user.id);
    const sorted = list.every((x, i) => i === 0 || new Date(list[i - 1].createdAt) >= new Date(x.createdAt));
    return { pass: r.status === 200 && list.length >= 7 && mine && sorted, actual: `HTTP ${r.status}, count=${list.length}, all mine=${mine}, sorted=${sorted}` };
  });

  // Mechanic lifecycle A: battery, extra work APPROVED
  await goOnline(mech, NEAR.mechanic);
  const mechJobA = await dispatchAndAccept("mechanic (battery)", mech, mechanicReq("battery", vehicle.id), [fuel, tow]);
  if (mechJobA) {
    const { req } = mechJobA;
    await R.check("ExtraWork", "Extra work before inspection_started", "PATCH /requests/:id/extra-work at provider_assigned", "400", async () =>
      expectStatus(await mech.patch(`/api/requests/${req.id}/extra-work`, { description: "New battery", partPrice: 15000 }), 400));
    for (const s of ["provider_on_way", "provider_arrived", "inspection_started"]) await advance(mech, req.id, s);
    await R.check("ExtraWork", "Customer cannot request extra work", "PATCH extra-work as customer", "403", async () =>
      expectStatus(await user.patch(`/api/requests/${req.id}/extra-work`, { description: "x", partPrice: 1 }), 403));
    await R.check("ExtraWork", "Extra work without description/part", "PATCH extra-work {partPrice:100}", "400", async () =>
      expectStatus(await mech.patch(`/api/requests/${req.id}/extra-work`, { partPrice: 100 }), 400));
    const ew = await mech.patch(`/api/requests/${req.id}/extra-work`, { partName: "Battery 12V 55Ah", partPrice: 15000, laborCharge: 500, estimatedTime: "30 min", description: "Battery dead, replace" });
    await R.check("ExtraWork", "Mechanic requests extra work", "PATCH /requests/:id/extra-work {partPrice:15000, laborCharge:500}", "200 status=extra_work_requested", async () =>
      ({ pass: ew.status === 200 && ew.body?.request?.status === "extra_work_requested" && ew.body.request.mechanicDetails.extraWork.status === "pending", actual: `HTTP ${ew.status}, status=${ew.body?.request?.status}` }));
    await R.check("Realtime", "Customer receives extra-work event", "listen request:changed kind=extra-work", "event", async () => {
      const e = await waitFor(() => hasEvent(sockets.user, (x) => x.payload?.requestId === req.id && x.payload.kind === "extra-work"), 5000);
      return { pass: !!e, actual: e ? "received" : "no event" };
    });
    await R.check("ExtraWork", "Provider cannot approve own extra work", "PATCH extra-work/approve as mechanic", "403", async () =>
      expectStatus(await mech.patch(`/api/requests/${req.id}/extra-work/approve`, { approved: true }), 403));
    await R.check("Lifecycle", "Provider cannot skip pending extra-work approval", "PATCH status=work_started while extra_work_requested", "400", async () =>
      expectStatus(await advance(mech, req.id, "work_started"), 400));
    const ap = await user.patch(`/api/requests/${req.id}/extra-work/approve`, { approved: true });
    await R.check("ExtraWork", "Customer approves extra work; price updated", "PATCH extra-work/approve {approved:true}", "200 status=work_started, estimate.total 1250 -> 16750", async () =>
      ({ pass: ap.status === 200 && ap.body?.request?.status === "work_started" && ap.body.request.estimate.total === 16750, actual: `HTTP ${ap.status}, status=${ap.body?.request?.status}, total=${ap.body?.request?.estimate?.total}` }));
    await R.check("ExtraWork", "Approve twice", "PATCH extra-work/approve again", "400 already decided", async () =>
      expectStatus(await user.patch(`/api/requests/${req.id}/extra-work/approve`, { approved: true }), 400));
    await advance(mech, req.id, "service_finished");
    await completeAndPay("mechanic A", mech, req);
    await R.check("Payments", "Invoice includes approved extra work", "invoice total for mechanic A", "16750", async () => {
      const inv = completed.find((c) => c.id === req.id)?.invoice;
      return { pass: inv?.totalMinor === 1675000, actual: `invoice total=${(inv?.totalMinor || 0) / 100}` };
    });
  }

  // Mechanic lifecycle B: engine, extra work REJECTED, then a second request answered with approved:"false"
  const mechJobB = await dispatchAndAccept("mechanic (engine)", mech, mechanicReq("engine", vehicle.id), []);
  if (mechJobB) {
    const { req } = mechJobB;
    for (const s of ["provider_on_way", "provider_arrived", "inspection_started"]) await advance(mech, req.id, s);
    await mech.patch(`/api/requests/${req.id}/extra-work`, { description: "Replace spark plugs", partPrice: 3000, laborCharge: 800 });
    const rj = await user.patch(`/api/requests/${req.id}/extra-work/approve`, { approved: false });
    await R.check("ExtraWork", "Customer rejects extra work; price unchanged", "PATCH extra-work/approve {approved:false}", "200 status=inspection_started, total stays 1250", async () =>
      ({ pass: rj.status === 200 && rj.body?.request?.status === "inspection_started" && rj.body.request.estimate.total === 1250 && rj.body.request.mechanicDetails.extraWork.status === "rejected", actual: `HTTP ${rj.status}, status=${rj.body?.request?.status}, total=${rj.body?.request?.estimate?.total}` }));
    await mech.patch(`/api/requests/${req.id}/extra-work`, { description: "Engine mount", partPrice: 2000, laborCharge: 0 });
    const strFalse = await user.patch(`/api/requests/${req.id}/extra-work/approve`, { approved: "false" });
    await R.check("ExtraWork", "approved:\"false\" (string) is treated as a rejection", "PATCH extra-work/approve {approved:\"false\"}", "400 (invalid) or rejection – never an approval",
      async () => ({ pass: strFalse.status === 400 || strFalse.body?.request?.mechanicDetails?.extraWork?.status === "rejected", actual: `HTTP ${strFalse.status}, extraWork.status=${strFalse.body?.request?.mechanicDetails?.extraWork?.status}, total=${strFalse.body?.request?.estimate?.total}` }));
    if (mechJobB && (await user.get(`/api/requests/${req.id}`)).body.request.status === "inspection_started") await advance(mech, req.id, "work_started");
    await R.check("Lifecycle", "mechanic: work_started -> service_finished", "PATCH status=service_finished", "200", async () =>
      expectStatus(await advance(mech, req.id, "service_finished"), 200));
    await completeAndPay("mechanic B", mech, req);
  }

  // ───────────────────────────── RACE + CANCEL AFTER ASSIGNMENT ─────────────────────────────
  await goOnline(mechB, NEAR.mechanicB);
  await refreshLocation(mech, NEAR.mechanic);
  const raceCreate = await createRequest(user, mechanicReq("battery", vehicle.id));
  const raceReq = raceCreate.body?.request;
  let winner = null; let loser = null; let raceOffer = null;
  if (raceReq) {
    await waitFor(async () => {
      for (const [a, b] of [[mech, mechB], [mechB, mech]]) {
        const r = await a.get("/api/requests/open");
        const hit = r.body?.requests?.find((x) => x.id === raceReq.id);
        if (hit) { winner = a; loser = b; raceOffer = hit.dispatch.offerId; return true; }
      }
      return false;
    }, 30000, 700);
  }
  await R.check("Dispatch", "Race: only one provider holds an offer at a time", "Two online mechanics; poll both /open", "exactly one sees the request", async () => {
    if (!winner) return { pass: false, actual: "no offer within 30 s" };
    const other = await loser.get("/api/requests/open");
    return { pass: !(other.body?.requests || []).some((x) => x.id === raceReq.id), actual: `offered to ${winner.label}; also visible to ${loser.label}=${(other.body?.requests || []).some((x) => x.id === raceReq.id)}` };
  });
  if (winner) {
    const [w, l, w2] = await Promise.all([
      winner.patch(`/api/requests/${raceReq.id}/accept`, { offerId: raceOffer }),
      loser.patch(`/api/requests/${raceReq.id}/accept`, { offerId: raceOffer }),
      winner.patch(`/api/requests/${raceReq.id}/accept`, { offerId: raceOffer })
    ]);
    await R.check("Dispatch", "Race: two mechanics accept the same request concurrently", "Promise.all accept from both mechanics (loser re-uses the leaked offerId) + duplicate accept by winner", "winner 200, loser 409, request has exactly one provider", async () => {
      const g = await user.get(`/api/requests/${raceReq.id}`);
      return { pass: w.status === 200 && l.status === 409 && [200, 409].includes(w2.status) && g.body?.request?.providerId === winner.user.id, actual: `winner ${w.status}, loser ${l.status}, winner-duplicate ${w2.status}, providerId=${g.body?.request?.providerId === winner.user.id ? "winner" : g.body?.request?.providerId}` };
    });
    await advance(winner, raceReq.id, "provider_on_way");
    const cx = await user.patch(`/api/requests/${raceReq.id}/status`, { status: "cancelled", note: "Found help" });
    await R.check("Lifecycle", "Cancel after assignment (customer)", "PATCH status=cancelled while provider_on_way", "200 cancelled, provider freed", async () => {
      const active = await winner.get("/api/requests/provider/active");
      return { pass: cx.status === 200 && cx.body?.request?.status === "cancelled" && active.body?.request === null, actual: `HTTP ${cx.status}, status=${cx.body?.request?.status}, provider active=${active.body?.request?.id || null}` };
    });
    await R.check("Realtime", "Provider receives cancellation event", "listen request:changed status=cancelled on winner socket", "event", async () => {
      const e = await waitFor(() => hasEvent(sockets[winner.label], (x) => x.payload?.requestId === raceReq.id && x.payload.status === "cancelled"), 5000);
      return { pass: !!e, actual: e ? "received" : "no event" };
    });
  }

  // Decline flow
  await mechB.patch("/api/requests/provider/availability", { isOnline: false });
  await refreshLocation(mech, NEAR.mechanic);
  const declReq = (await createRequest(user, mechanicReq("tyre"))).body?.request;
  const declOffer = declReq ? await waitForOffer(mech, declReq.id) : null;
  await R.check("Dispatch", "Provider declines an offer", "PATCH /requests/:id/decline {offerId}", "200, request back to searching", async () => {
    if (!declOffer) return { pass: false, actual: "no offer" };
    const r = await mech.patch(`/api/requests/${declReq.id}/decline`, { offerId: declOffer });
    const g = await user.get(`/api/requests/${declReq.id}`);
    return { pass: r.status === 200 && g.body?.request?.status === "searching_provider" && g.body.request.providerId === null, actual: `HTTP ${r.status}, status=${g.body?.request?.status}, dispatch.state=${g.body?.request?.dispatch?.state}` };
  });
  if (declReq) await user.patch(`/api/requests/${declReq.id}/status`, { status: "cancelled" });

  // ───────────────────────────── PROVIDER HISTORY / EARNINGS ─────────────────────────────
  await R.check("Provider", "Mechanic history lists completed + cancelled jobs", "GET /requests/provider/history as mechanic A", "2 completed (+ cancelled race job if mechanic A won)", async () => {
    const r = await mech.get("/api/requests/provider/history");
    const list = r.body?.requests || [];
    const done = list.filter((x) => x.status === "completed").length;
    const exp = completed.filter((c) => c.provider === mech).length;
    return { pass: r.status === 200 && done === exp && list.every((x) => x.providerId === mech.user.id), actual: `HTTP ${r.status}, completed=${done} (expected ${exp}), cancelled=${list.filter((x) => x.status === "cancelled").length}` };
  });
  for (const p of [fuel, tow, mech]) {
    await R.check("Provider", `Earnings correct (${p.label})`, "GET /requests/provider/earnings", "total = sum(invoice total - service fee) of cash-collected jobs; completedJobs matches", async () => {
      const jobs = completed.filter((c) => c.provider === p);
      const expected = jobs.reduce((s, c) => s + (c.invoice.providerEarningsMinor ?? (c.invoice.totalMinor - c.invoice.serviceFeeMinor)) / 100, 0);
      const r = await p.get("/api/requests/provider/earnings");
      const e = r.body?.earnings || {};
      return { pass: r.status === 200 && e.total === expected && e.today === expected && e.week === expected && e.completedJobs === jobs.length && e.paidJobs === jobs.length, actual: `total=${e.total} (expected ${expected}), today=${e.today}, week=${e.week}, completedJobs=${e.completedJobs}, paidJobs=${e.paidJobs}` };
    });
  }
  await R.check("Security", "Customer cannot read provider earnings/history/active", "GET provider/earnings, provider/history, provider/active as customer", "403 each", async () => {
    const codes = [];
    for (const u of ["earnings", "history", "active"]) codes.push((await user.get(`/api/requests/provider/${u}`)).status);
    return { pass: codes.every((c) => c === 403), actual: codes.join(",") };
  });
  await R.check("Admin", "Dashboard reflects completed work", "GET /api/admin/dashboard", "completedRequests >= 4, averageRating > 0, providerEarnings > 0", async () => {
    const r = await admin.get("/api/admin/dashboard");
    const s = r.body?.stats || {};
    return { pass: s.completedRequests >= 4 && s.averageRating > 0 && s.providerEarnings > 0, actual: `completed=${s.completedRequests}, cancelled=${s.cancelledRequests}, avgRating=${s.averageRating}, revenue=${s.revenue}, providerEarnings=${s.providerEarnings}` };
  });

  // ───────────────────────────── SECURITY SWEEPS ─────────────────────────────
  const someReq = completed[0]?.id || new ObjectId().toString();
  const protectedRoutes = [
    ["GET", "/api/requests"], ["POST", "/api/requests"], ["GET", "/api/requests/open"], ["GET", "/api/requests/nearby-providers?category=mechanic&lat=33.7&lng=73.05"],
    ["GET", "/api/requests/provider/active"], ["GET", "/api/requests/provider/history"], ["GET", "/api/requests/provider/earnings"],
    ["PATCH", "/api/requests/provider/availability"], ["PATCH", "/api/requests/provider/location"], ["GET", `/api/requests/${someReq}`],
    ["PATCH", `/api/requests/${someReq}/accept`], ["PATCH", `/api/requests/${someReq}/status`], ["GET", `/api/requests/${someReq}/messages`],
    ["POST", `/api/requests/${someReq}/messages`], ["PATCH", `/api/requests/${someReq}/review`], ["PATCH", `/api/requests/${someReq}/extra-work`],
    ["PATCH", `/api/requests/${someReq}/extra-work/approve`], ["GET", "/api/vehicles"], ["POST", "/api/vehicles"], ["GET", "/api/notifications"],
    ["GET", `/api/payments/request/${someReq}`], ["GET", "/api/mechanic-verification"], ["GET", "/api/admin/providers"]
  ];
  await R.check("Security", "Every protected endpoint returns 401 without JWT", `${protectedRoutes.length} endpoints, no Authorization / cookie`, "401 each", async () => {
    const bad = [];
    for (const [m, u] of protectedRoutes) {
      const r = await client("anon").req(m, u, m === "GET" ? undefined : {}, { auth: "none" });
      if (r.status !== 401) bad.push(`${m} ${u} -> ${r.status}`);
    }
    return { pass: bad.length === 0, actual: bad.length ? bad.join("; ") : `all ${protectedRoutes.length} -> 401` };
  });
  const invalidIdRoutes = [
    ["GET", "/api/requests/not-an-id"], ["PATCH", "/api/requests/not-an-id/status", { status: "cancelled" }],
    ["PATCH", "/api/requests/not-an-id/accept", { offerId: "x" }], ["PATCH", "/api/requests/not-an-id/decline", { offerId: "x" }],
    ["PATCH", "/api/requests/not-an-id/extra-work", { description: "x" }], ["PATCH", "/api/requests/not-an-id/extra-work/approve", { approved: true }],
    ["PATCH", "/api/requests/not-an-id/review", { rating: 5 }], ["GET", "/api/requests/not-an-id/messages"], ["POST", "/api/requests/not-an-id/messages", { body: "x" }],
    ["POST", "/api/requests/not-an-id/dispatch/retry", {}], ["PATCH", "/api/vehicles/not-an-id", { model: "x" }], ["DELETE", "/api/vehicles/not-an-id"],
    ["GET", "/api/payments/request/not-an-id"]
  ];
  await R.check("Security", "Invalid ObjectId returns 400 (not 500)", `${invalidIdRoutes.length} endpoints with id=not-an-id (customer / provider tokens)`, "400 each, never 500", async () => {
    const out = [];
    for (const [m, u, b] of invalidIdRoutes) {
      const who = /accept|decline|extra-work$/.test(u) ? mech : user;
      const r = await who.req(m, u, b);
      out.push({ k: `${m} ${u.replace("/api", "")}`, s: r.status });
    }
    const bad = out.filter((x) => x.s >= 500);
    const not400 = out.filter((x) => x.s !== 400);
    return { pass: bad.length === 0 && not400.length === 0, actual: not400.length ? `non-400: ${not400.map((x) => `${x.k}=${x.s}`).join("; ")}` : "all 400" };
  });
  await R.check("Security", "Unknown request id returns 404", "GET /api/requests/<random ObjectId>", "404", async () =>
    expectStatus(await user.get(`/api/requests/${new ObjectId()}`), 404));
  await R.check("Security", "Accept on a non-existent request", "PATCH /api/requests/<random ObjectId>/accept as mechanic", "404/409", async () =>
    expectStatus(await mech.patch(`/api/requests/${new ObjectId()}/accept`, { offerId: "x" }), [404, 409]));
  await R.check("Security", "Wrong role: customer calls provider-only and admin-only endpoints", "GET /requests/open, /mechanic-verification, /admin/providers as customer", "403 each", async () => {
    const out = [];
    for (const u of ["/api/requests/open", "/api/mechanic-verification", "/api/admin/providers"]) out.push(`${u}=${(await user.get(u)).status}`);
    return { pass: out.every((x) => /=40[13]$/.test(x)) && out[0].endsWith("403"), actual: out.join(", ") };
  });
  await R.check("Security", "IDOR: other customer reads payment/invoice of my job", "GET /api/payments/request/:id as user2", "403", async () =>
    expectStatus(await user2.get(`/api/payments/request/${someReq}`), [403, 404]));
  await R.check("Security", "Body larger than 12 MB", "POST /api/auth/login with 13 MB JSON", "413", async () =>
    expectStatus(await client("x").req("POST", "/api/auth/login", undefined, { auth: "none", rawBody: JSON.stringify({ phone: "x".repeat(13 * 1024 * 1024), password: "x" }) }), 413));
  await R.check("Security", "passwordHash / secrets never returned", `Scanned every API response in this run for passwordHash, bcrypt hashes, googleId, faceDescriptor, providerEnrollment`, "0 leaks", async () =>
    ({ pass: leaks.length === 0, actual: leaks.length ? JSON.stringify(leaks.slice(0, 5)) : "0 leaks" }));

  for (const s of Object.values(sockets)) s.s.close();
  await mongo.close();

  const summary = R.write(path.join(__dirname, "..", "results", "api-results.json"), { leaks });
  console.log("\nSUMMARY", JSON.stringify(summary));
}

main().catch((e) => {
  console.error(e);
  R.write(path.join(__dirname, "..", "results", "api-results.json"), { crashed: String(e.stack || e) });
  process.exit(1);
});
