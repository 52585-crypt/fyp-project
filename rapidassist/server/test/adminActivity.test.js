const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { io: connectSocket } = require("socket.io-client");
const { MongoMemoryServer, MongoMemoryReplSet } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { attachRealtime, notifyAdmins, notifyRequest } = require("../src/services/realtime");
const { AdminActivityLog } = require("../src/models/AdminActivityLog");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { Payment } = require("../src/models/Payment");
const { signAccessToken } = require("../src/utils/jwt");
const { ACCESS_TOKEN_COOKIE_NAME } = require("../src/utils/authCookie");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
delete process.env.CORS_ORIGIN;

async function users() {
  const password = randomBytes(24).toString("hex");
  const passwordHash = await User.hashPassword(password);
  const [admin, customer, provider, outsider] = await User.create([
    { role: "admin", name: "Staff [North]", email: "admin@example.invalid", phone: "admin-fixture" },
    { role: "user", name: "Test customer", phone: "customer-fixture" },
    { role: "mechanic", name: "Test provider", phone: "provider-fixture", verificationStatus: "pending",
      mechanicVerification: { submissionId: "fixture-submission", reviewState: "awaiting_review",
        images: { cnic: { key: "private-image-key" } } },
      mechanicProfile: { idCardFrontUrl: "private-document", liveLocation: { lat: 31.72, lng: 74.55 } },
      providerState: { currentLocation: { lat: 31.72, lng: 74.55 } } },
    { role: "mechanic", name: "Other provider", phone: "outsider-fixture", verificationStatus: "pending",
      mechanicVerification: { submissionId: "other-submission", reviewState: "awaiting_review" } }
  ].map(user => ({ ...user, passwordHash })));
  return { admin, customer, provider, outsider, password };
}

const tokenFor = user => signAccessToken({ sub: user.id, role: user.role });
function apiFor(base) {
  return async (path, { actor, body, method, cookie } = {}) => {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        ...(actor ? { Authorization: "Bearer " + tokenFor(actor) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
}

describe("admin activity on a disposable replica set", () => {
  let mongo, server, realtime, base, api, actor;
  const logPath = "/api/admin/activity";
  const signIn = "/api/auth/admin/login";
  const review = user => `/api/admin/providers/${user.id}/verification`;

  before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
    await AdminActivityLog.init();
    actor = await users();
    server = createServer(createApp());
    realtime = attachRealtime(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
    api = apiFor(base);
  });

  after(async () => {
    if (realtime) await realtime.close();
    else if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  test("admin-only log and sensitive routes reject public roles; audit history has no write API", async () => {
    for (const path of [logPath, "/api/admin/customers", "/api/admin/provider-directory", "/api/admin/finance/payments",
      "/api/admin/requests", "/api/admin/active-jobs", review(actor.provider)]) {
      const unauthenticated = await api(path);
      assert.equal(unauthenticated.status, 401);
      assert.equal(unauthenticated.headers.get("cache-control"), "no-store");
      assert.equal((await api(path, { actor: actor.customer })).status, 403);
      assert.equal((await api(path, { actor: actor.provider })).status, 403);
    }
    const providerList = await api("/api/admin/providers", { actor: actor.admin });
    assert.ok(providerList.body.providers.length);
    assert.equal(JSON.stringify(providerList.body).includes("private-document"), false);
    assert.equal(JSON.stringify(providerList.body).includes("31.72"), false);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      assert.equal((await api(logPath, { actor: actor.admin, method })).status, 404);
    }
    assert.equal(await AdminActivityLog.countDocuments(), 0);
  });

  test("audits sign-in and validated sign-out without submitted identity, credentials or JWTs", async () => {
    const failure = await api(signIn, { body: { email: "submitted@example.invalid", password: "private-password" } });
    assert.equal(failure.status, 401);
    assert.equal(failure.headers.get("set-cookie"), null);
    const failed = await AdminActivityLog.findOne({ requestId: failure.headers.get("x-request-id") }).lean();
    assert.equal(failed.adminId, null);
    assert.equal(failed.result, "failed");

    const login = await api(signIn, { body: { email: actor.admin.email, password: actor.password } });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get("cache-control"), "no-store");
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    const loginEntry = await AdminActivityLog.findOne({ requestId: login.headers.get("x-request-id") });
    assert.equal(String(loginEntry.adminId), actor.admin.id);
    assert.equal(loginEntry.action, "admin.login");
    assert.equal(loginEntry.result, "success");

    const cookie = login.headers.get("set-cookie").split(";")[0];
    const logout = await api("/api/auth/logout", { method: "POST", cookie });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /expires=/i);
    const signout = await AdminActivityLog.findOne({ requestId: logout.headers.get("x-request-id") });
    assert.equal(signout.action, "admin.logout");
    assert.equal(String(signout.adminId), actor.admin.id);
    await api("/api/auth/logout", { method: "POST", actor: actor.customer });
    await api("/api/auth/logout", { method: "POST", cookie: ACCESS_TOKEN_COOKIE_NAME + "=invalid" });
    assert.equal(await AdminActivityLog.countDocuments({ action: "admin.logout" }), 1);
    const records = JSON.stringify(await AdminActivityLog.find().lean());
    for (const secret of [actor.password, "submitted@example.invalid", "private-password", login.body.token, actor.admin.email]) {
      assert.equal(records.includes(secret), false);
    }
  });

  test("audits verification outcomes and rejects unauthorized or stale requests without false successes", async () => {
    const approval = { status: "verified", submissionId: "fixture-submission", note: "Private verification note 0000000000000" };
    const wrongActor = await api(review(actor.provider), { method: "PATCH", actor: actor.provider, body: approval });
    assert.equal(wrongActor.status, 403);
    const stale = await api(review(actor.provider), { method: "PATCH", actor: actor.admin, body: { ...approval, submissionId: "stale" } });
    assert.equal(stale.status, 409);
    const approved = await api(review(actor.provider), { method: "PATCH", actor: actor.admin, body: approval });
    assert.equal(approved.status, 200);
    assert.deepEqual(Object.keys(approved.body.provider).sort(), ["id", "isCertified", "verificationStatus"]);
    const resubmit = await api(review(actor.provider), { method: "PATCH", actor: actor.admin, body: { ...approval, status: "pending" } });
    assert.equal(resubmit.status, 200);
    const rejected = await api(review(actor.outsider), { method: "PATCH", actor: actor.admin,
      body: { status: "rejected", submissionId: "other-submission", note: "Private review details" } });
    assert.equal(rejected.status, 200);
    const actions = await AdminActivityLog.find({ resourceType: "provider" }).sort({ createdAt: 1, _id: 1 }).lean();
    assert.deepEqual(actions.map(row => [row.action, row.result, row.httpStatus]), [
      ["verification.approve", "failed", 409], ["verification.approve", "success", 200],
      ["verification.resubmit", "success", 200], ["verification.reject", "success", 200]
    ]);
    assert.ok(actions.every(row => String(row.adminId) === actor.admin.id));
    assert.equal(String(actions[0].resourceId), actor.provider.id);
    assert.equal(String(actions[3].resourceId), actor.outsider.id);
    const result = await api(logPath, { actor: actor.admin });
    assert.ok(result.body.entries.every(row => Object.keys(row).sort().join(",") ===
      "action,adminId,adminName,createdAt,httpStatus,id,requestId,resourceId,resourceType,result"));
    const serialized = JSON.stringify(result.body);
    for (const secret of ["Private verification note", "Private review details", "private-image-key", "private-document", "31.72", actor.provider.phone]) {
      assert.equal(serialized.includes(secret), false, secret);
    }
  });

  test("records an admin cash confirmation exactly once and distinguishes a no-change replay", async () => {
    const request = await ServiceRequest.create({
      userId: actor.customer._id, providerId: actor.provider._id, category: "mechanic", status: "completed",
      pickupLocation: { lat: 1, lng: 2 }
    });
    const payment = await Payment.create({ userId: actor.customer._id, providerId: actor.provider._id,
      requestId: request._id, invoiceId: new mongoose.Types.ObjectId(), method: "cash", status: "pending", amountMinor: 100 });
    const path = `/api/payments/request/${request.id}/cash-collected`;
    assert.equal((await api(path, { method: "PATCH", actor: actor.customer })).status, 403);
    for (let i = 0; i < 2; i++) {
      const response = await api(path, { method: "PATCH", actor: actor.admin });
      assert.equal(response.status, 200);
      assert.equal(response.body.payment.cashCollectionRecorded, true);
    }
    assert.equal((await Payment.findById(payment.id)).status, "paid");
    const rows = await AdminActivityLog.find({ action: "cash.confirm" }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(rows.map(row => [row.result, String(row.resourceId), String(row.adminId)]), [
      ["success", request.id, actor.admin.id], ["no_change", request.id, actor.admin.id]
    ]);
  });

  test("records the admin location refresh outcome without storing location data", async () => {
    const request = await ServiceRequest.create({
      userId: actor.customer._id, providerId: actor.provider._id, category: "mechanic", status: "completed",
      pickupLocation: { lat: 31.728, lng: 74.559, source: "google_places", placeId: "private-place", googleContentCachedAt: new Date() }
    });
    const refresh = `/api/requests/${request.id}/location/`;
    assert.equal((await api(refresh + "pickup/refresh", { actor: actor.admin, method: "POST" })).status, 200);
    assert.equal((await api(refresh + "dropoff/refresh", { actor: actor.admin, method: "POST" })).status, 400);
    assert.equal((await api(refresh + "pickup/refresh", { actor: actor.customer, method: "POST" })).status, 200);
    const rows = await AdminActivityLog.find({ action: "request.location_refresh" }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(rows.map(row => [row.result, row.httpStatus]), [["success", 200], ["failed", 400]]);
    const serialized = JSON.stringify(rows);
    for (const secret of ["private-place", "31.728", "74.559", "addressText"]) assert.equal(serialized.includes(secret), false);
  });

  test("rolls back verification when the audit insert fails on a replica set", async t => {
    const save = t.mock.method(AdminActivityLog.prototype, "save", async function () { throw new Error("database fixture"); });
    const log = t.mock.method(console, "error", () => {});
    try {
      const response = await api(review(actor.provider), { method: "PATCH", actor: actor.admin,
        body: { status: "pending", submissionId: "fixture-submission", note: "Rollback check" } });
      assert.equal(response.status, 503);
      assert.equal(response.body.code, "ADMIN_AUDIT_UNAVAILABLE");
      assert.equal(response.headers.get("x-admin-audit-status"), "unavailable");
      const provider = await User.findById(actor.provider.id).select("+mechanicVerification");
      assert.notEqual(provider.mechanicVerification.reviewNote, "Rollback check");
      assert.equal(await AdminActivityLog.countDocuments({ requestId: response.headers.get("x-request-id") }), 0);
      assert.equal(log.mock.calls.some(call => call.arguments[0] === "Admin activity write failed"), true);
    } finally {
      save.mock.restore();
      log.mock.restore();
    }
  });

  test("supports bounded UTC pagination, combined filters and stable safe identifiers", async () => {
    const fixed = ["2025-07-01T23:59:59.999Z", "2025-07-01T23:59:59.999Z", "2025-07-02T00:00:00.000Z"];
    const records = await AdminActivityLog.create(fixed.map(createdAt => ({
      adminId: actor.admin._id, resourceId: actor.provider._id, action: "verification.approve",
      resourceType: "provider", result: "success", httpStatus: 200, requestId: randomUUID(), createdAt: new Date(createdAt)
    })));
    const query = new URLSearchParams({ q: actor.provider.id, admin: "staff [", action: "verification.approve",
      resource: "provider", result: "success", from: "2025-07-01", to: "2025-07-01", limit: "1" });
    const { body: first } = await api(logPath + "?" + query, { actor: actor.admin });
    assert.equal(first.entries[0].id, records[1].id);
    assert.equal(first.entries[0].adminName, actor.admin.name);
    query.set("cursor", first.next);
    const { body: second } = await api(logPath + "?" + query, { actor: actor.admin });
    assert.equal(second.entries[0].id, records[0].id);
    assert.equal(second.next, null);
    for (const q of [records[2].id, records[2].requestId]) {
      assert.equal((await api(logPath + "?q=" + q, { actor: actor.admin })).body.entries[0].id, records[2].id);
    }
    assert.deepEqual((await api(logPath + "?q=%5E.*", { actor: actor.admin })).body.entries, []);
    for (const bad of ["q=a", "q=xx&q=yy", "admin[x]=bad", "cursor=bad", "action=__proto__", "result=yes",
      "resource=none", "unknown=x", "limit=51", "from=2025-02-30", "from=2025-01-02&to=2025-01-01"]) {
      assert.equal((await api(logPath + "?" + bad, { actor: actor.admin })).status, 400, bad);
    }
    await assert.rejects(AdminActivityLog.updateOne({ _id: records[0]._id }, { $set: { result: "failed" } }), /append-only/);
    await assert.rejects(AdminActivityLog.deleteOne({ _id: records[0]._id }), /append-only/);
    await assert.rejects(records[0].deleteOne(), /append-only/);
    await assert.rejects(records[0].save(), /append-only/);
    await assert.rejects(AdminActivityLog.bulkWrite([{ deleteOne: { filter: { _id: records[0]._id } } }]), /append-only/);
    assert.equal(await AdminActivityLog.countDocuments({ _id: { $in: records.map(row => row._id) } }), 3);
  });

  test("rejects unauthorized sockets and preserves trusted Web and native bearer room isolation", async t => {
    const sockets = [];
    t.after(() => sockets.forEach(socket => socket.disconnect()));
    async function connect({ token, origin, cookie } = {}) {
      const socket = connectSocket(base, { forceNew: true, reconnection: false, autoConnect: false, transports: ["websocket"],
        auth: token ? { token } : undefined, extraHeaders: { ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) } });
      sockets.push(socket);
      const outcome = new Promise(resolve => {
        socket.once("connect", () => resolve(true));
        socket.once("connect_error", () => resolve(false));
      });
      socket.connect();
      return { socket, connected: await outcome };
    }
    const trustedAdmin = "http://localhost:5173";
    const trustedExpo = "http://localhost:8081";
    const adminCookie = ACCESS_TOKEN_COOKIE_NAME + "=" + tokenFor(actor.admin);
    const expired = jwt.sign({ sub: actor.admin.id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: -1 });
    const wrongRole = signAccessToken({ sub: actor.customer.id, role: "admin" });
    const noExpiry = jwt.sign({ sub: actor.admin.id, role: "admin" }, process.env.JWT_SECRET);
    for (const options of [
      { origin: "https://untrusted.example", cookie: adminCookie },
      { origin: "https://untrusted.example", token: tokenFor(actor.customer) },
      { origin: trustedAdmin }, { origin: trustedAdmin, token: expired }, { origin: trustedAdmin, token: noExpiry },
      { origin: trustedAdmin, token: wrongRole }, { origin: base, cookie: adminCookie },
      { origin: base, token: tokenFor(actor.admin) }
    ]) assert.equal((await connect(options)).connected, false, JSON.stringify({ origin: options.origin }));

    const admin = await connect({ origin: trustedAdmin, cookie: adminCookie });
    const customer = await connect({ origin: trustedExpo, token: tokenFor(actor.customer) });
    const native = await connect({ origin: base, token: tokenFor(actor.provider) });
    assert.equal((await connect({ token: tokenFor(actor.outsider) })).connected, true);
    assert.ok(admin.connected && customer.connected && native.connected);
    let customerAdminEvents = 0;
    customer.socket.on("admin:test", () => customerAdminEvents++);
    native.socket.on("admin:test", () => customerAdminEvents++);
    const adminEvent = once(admin.socket, "admin:test");
    notifyAdmins({ requestId: "known-event" }, "admin:test");
    assert.equal((await adminEvent)[0].requestId, "known-event");
    const customerEvent = once(customer.socket, "request:changed");
    const providerEvent = once(native.socket, "request:changed");
    notifyRequest({ id: "assigned-event", userId: actor.customer.id, providerId: actor.provider.id, status: "assigned" });
    assert.equal((await customerEvent)[0].requestId, "assigned-event");
    assert.equal((await providerEvent)[0].requestId, "assigned-event");
    await delay(40);
    assert.equal(customerAdminEvents, 0);
    const reconnected = once(native.socket, "connect");
    native.socket.disconnect().connect();
    await reconnected;
    const expiry = jwt.sign({ sub: actor.admin.id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: 2 });
    const shortSession = await connect({ origin: trustedAdmin, token: expiry });
    assert.equal(shortSession.connected, true);
    assert.equal((await once(shortSession.socket, "disconnect"))[0], "io server disconnect");
  });

  test("public password throttling is separate from the dedicated admin budget", async () => {
    for (let i = 0; i < 31; i++) {
      const reply = await api("/api/auth/login", { body: { phone: "unknown-fixture", password: "invalid" } });
      assert.equal(reply.status, i < 30 ? 401 : 429);
      if (i === 30) assert.ok(Number(reply.headers.get("retry-after")) > 0);
    }
    const login = await api(signIn, { body: { email: actor.admin.email, password: actor.password } });
    assert.equal(login.status, 200);
  });
});

test("standalone audit failures are reported without misreporting the committed decision", async t => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { admin, provider } = await users();
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  });
  t.mock.method(AdminActivityLog.prototype, "save", async function () { throw new Error("standalone fixture"); });
  const log = t.mock.method(console, "error", () => {});
  const api = apiFor(`http://127.0.0.1:${server.address().port}`);
  const response = await api(`/api/admin/providers/${provider.id}/verification`, {
    method: "PATCH", actor: admin, body: { status: "verified", submissionId: "fixture-submission" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-admin-audit-status"), "unavailable");
  assert.equal((await User.findById(provider.id)).verificationStatus, "verified");
  assert.equal(log.mock.calls[0].arguments[0], "Admin activity write failed");
  assert.equal(await AdminActivityLog.countDocuments(), 0);
});
