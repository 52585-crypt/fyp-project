const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { generateKeyPairSync } = require("node:crypto");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { Vehicle } = require("../src/models/Vehicle");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { Payment } = require("../src/models/Payment");
const { newDispatch, runDispatchBatch } = require("../src/services/dispatch");
const { signAccessToken, verifyAccessToken } = require("../src/utils/jwt");
const { migrateOptionalPhoneIndex } = require("../scripts/migrateOptionalPhoneIndex");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "google-auth-test-secret";
process.env.GOOGLE_CLIENT_IDS = "test-web-client-id,test-ios-client-id";

describe("Google customer and mechanic authentication", { concurrency: false }, () => {
  let database, server, base;

  before(async () => {
    database = await MongoMemoryServer.create();
    await mongoose.connect(database.getUri(), { dbName: "rapidassist_google_auth_test" });
    await User.init();
    server = createServer(createApp({ mechanicVerification: {
      submit: async ({ submissionId }) => ({
        images: { profile: { key: `${submissionId}/profile` }, cnic: { key: `${submissionId}/cnic` } },
        comparedRegion: { left: 0, top: 0, width: 1, height: 1 },
        matchStatus: "matched", score: 99
      }),
      deleteImages: async () => []
    } }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => User.deleteMany({}));

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (database) await database.stop();
  });

  async function api(path, body, method = "POST", token) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body == null ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }

  function mockGoogle(t, payload) {
    t.mock.method(OAuth2Client.prototype, "verifyIdToken", async ({ idToken, audience }) => {
      assert.equal(idToken, "verified-id-token");
      assert.deepEqual(audience, ["test-web-client-id", "test-ios-client-id"]);
      return { getPayload: () => ({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload }) };
    });
  }

  it("rejects missing, invalid, and unverified Google tokens", async (t) => {
    assert.equal((await api("/api/auth/google", {})).status, 400);
    t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => { throw new Error("bad signature"); });
    assert.equal((await api("/api/auth/google", { idToken: "invalid" })).status, 401);
    t.mock.restoreAll();
    mockGoogle(t, { sub: "google-unverified", email: "new@example.com", email_verified: false });
    assert.equal((await api("/api/auth/google", { idToken: "verified-id-token" })).status, 401);
    assert.equal(await User.countDocuments(), 0);
  });

  it("distinguishes OAuth configuration and verification outages without exposing upstream errors", async (t) => {
    t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => {
      throw new Error("Failed to retrieve verification certificates: private upstream details");
    });
    const original = process.env.GOOGLE_CLIENT_IDS;
    process.env.GOOGLE_CLIENT_IDS = " ";
    try {
      const missing = await api("/api/auth/google", { idToken: "test-token" });
      assert.equal(missing.status, 503);
      assert.equal(missing.data.code, "GOOGLE_AUTH_NOT_CONFIGURED");
    } finally {
      process.env.GOOGLE_CLIENT_IDS = original;
    }
    const unavailable = await api("/api/auth/google", { idToken: "test-token" });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.data.code, "GOOGLE_VERIFICATION_UNAVAILABLE");
    assert.doesNotMatch(unavailable.data.message, /private upstream/);
    assert.equal(await User.countDocuments(), 0);
  });

  it("reports database and session outages without creating a Google account", async (t) => {
    mockGoogle(t, { sub: "google-outage", email: "outage@example.com", email_verified: true });
    const database = t.mock.method(User, "findOne", async () => {
      throw Object.assign(new Error("private database metadata"), { name: "MongoServerSelectionError" });
    });
    const unavailable = await api("/api/auth/google", { idToken: "verified-id-token" });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.data.code, "DATABASE_UNAVAILABLE");
    assert.doesNotMatch(unavailable.data.message, /private database/);
    database.mock.restore();

    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const session = await api("/api/auth/google", { idToken: "verified-id-token" });
      assert.equal(session.status, 500);
      assert.equal(session.data.code, "AUTH_SESSION_UNAVAILABLE");
      assert.doesNotMatch(session.data.message, /JWT_SECRET/);
      assert.equal(await User.countDocuments(), 0);
    } finally {
      process.env.JWT_SECRET = original;
    }
  });

  it("verifies Google signatures and rejects a wrong audience, wrong issuer and expired tokens", async (t) => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    t.mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => ({
      certs: { "test-key": publicKey.export({ type: "spki", format: "pem" }) }
    }));
    const now = Math.floor(Date.now() / 1000);
    const rawToken = (overrides = {}) => jwt.sign({
      sub: "signed-fixture", email: "signed@example.com", email_verified: true,
      iss: "https://accounts.google.com", aud: "test-web-client-id", iat: now - 120, exp: now + 120,
      ...overrides
    }, privateKey, { algorithm: "RS256", keyid: "test-key" });
    const valid = rawToken();
    const invalid = valid.replace(/\.([^.]*)$/, (_, signature) => "." + (signature.startsWith("A") ? "B" : "A") + signature.slice(1));
    for (const idToken of [invalid, rawToken({ aud: "wrong-client-id" }), rawToken({ iss: "https://wrong.example.com" }),
      rawToken({ exp: now - 60 }), rawToken({ sub: "" }), rawToken({ email_verified: false })]) {
      assert.equal((await api("/api/auth/google", { idToken, intent: "mechanic_register" })).status, 401);
    }
    assert.equal((await api("/api/auth/google", { idToken: valid, intent: "mechanic_register" })).status, 200);
    assert.equal(await User.countDocuments(), 0);
    const signedIn = await api("/api/auth/google", { idToken: valid });
    assert.equal(signedIn.status, 200);
    assert.equal(verifyAccessToken(signedIn.data.token).role, "user");
    const session = await api("/api/auth/me", undefined, "GET", signedIn.data.token);
    assert.equal(session.status, 200);
    assert.equal(session.data.user.email, "signed@example.com");
    assert.equal(await User.countDocuments(), 1);
  });

  it("previews a verified Google profile and creates a pending mechanic only after completed registration", async (t) => {
    const image = "data:image/jpeg;base64,AA";
    const idToken = "verified-id-token";
    const profilePictureUrl = "https://lh3.googleusercontent.com/avatar";
    mockGoogle(t, { sub: "google-mechanic", email: "MECHANIC@example.com", email_verified: true, name: "Google Mechanic", picture: profilePictureUrl });
    assert.equal((await api("/api/auth/google", { idToken, intent: "mechanic_login" })).status, 404);
    const preview = await api("/api/auth/google", { idToken, intent: "mechanic_register" });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.data, { ok: true, registrationRequired: true, profile: {
      name: "Google Mechanic", email: "mechanic@example.com", profilePictureUrl
    } });
    assert.equal(await User.countDocuments(), 0);
    const draft = { role: "mechanic", googleIdToken: idToken, name: "Edited Name", phone: "03006660001",
      email: "forged@example.com", googleId: "forged-sub", profilePictureUrl: "https://forged.example.com/",
      email_verified: false, isCertified: true,
      mechanicProfile: { serviceCategory: "mechanic", workshopPhotoUrl: image, certificateUrl: image, selfieUrl: image }
    };
    assert.equal((await api("/api/auth/register", { ...draft, phone: "" })).status, 400);
    assert.equal((await api("/api/auth/register", { ...draft, mechanicProfile: {} })).status, 400);
    assert.equal((await api("/api/auth/register", { ...draft, password: "not-allowed" })).status, 400);
    assert.equal((await api("/api/auth/register", { ...draft, role: "user" })).status, 400);
    const results = await Promise.all([
      api("/api/auth/register", draft),
      api("/api/auth/register", { ...draft, phone: "03006660002" })
    ]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
    const { token, user } = results.find(({ status }) => status === 201).data;
    assert.equal(user.name, "Edited Name");
    assert.equal(user.role, "mechanic");
    assert.equal(user.email, "mechanic@example.com");
    assert.equal(user.profilePictureUrl, profilePictureUrl);
    assert.equal(user.verificationStatus, "pending");
    assert.equal(user.isCertified, false);
    assert.equal(user.mechanicProfile.selfieUrl, null);
    assert.equal(user.googleId, undefined);
    assert.equal(await User.countDocuments({ googleId: "google-mechanic" }), 1);
    const stored = await User.findById(user.id).select("+googleId +passwordHash +mechanicVerification");
    assert.equal(stored.passwordHash, null);
    assert.equal(stored.mechanicVerification, undefined);
    assert.equal((await api("/api/auth/login", { phone: user.phone, password: "not-allowed" })).status, 401);
    assert.equal((await api("/api/auth/me", null, "GET", token)).data.user.id, user.id);
    const kyc = await api("/api/mechanic-verification", null, "GET", token);
    assert.equal(kyc.status, 200);
    assert.equal(kyc.data.verification.submissionId, null);
    for (const intent of ["mechanic_login", "mechanic_register"]) {
      const login = await api("/api/auth/google", { idToken, intent });
      assert.equal(login.status, 200);
      assert.equal(login.data.user.id, user.id);
      assert.equal(verifyAccessToken(login.data.token).role, "mechanic");
    }
    assert.equal((await api("/api/auth/google", { idToken })).status, 409);
  });

  it("adds provider membership once to a Google customer, preserves their records and switches validated modes", async (t) => {
    const idToken = "verified-id-token";
    mockGoogle(t, { sub: "dual-role", email: "customer@example.com", name: "Existing Customer", email_verified: true });
    const customer = await api("/api/auth/google", { idToken });
    assert.equal(customer.status, 200);
    const { token, user: { id } } = customer.data;
    const phone = "03006660003";
    assert.equal((await api("/api/auth/me/phone", { phone }, "PATCH", token)).status, 200);
    const admin = await User.create({ role: "admin", name: "Admin", email: "dual-admin@example.com", phone: "dual-admin",
      passwordHash: await User.hashPassword("admin-password") });
    const adminLogin = await api("/api/auth/admin/login", { email: admin.email, password: "admin-password" });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const vehicle = await Vehicle.create({ userId: id, type: "car", make: "Test", model: "Test", year: 2020 });
    const booking = await ServiceRequest.create({ userId: id, vehicleId: vehicle.id, category: "car_towing", status: "completed",
      pickupLocation: { lat: 31.52, lng: 74.35 }, estimate: { total: 1000 } });
    const payment = await Payment.create({ requestId: booking.id, invoiceId: new mongoose.Types.ObjectId(), userId: id,
      providerId: admin.id, amountMinor: 1000, method: "online_simulated", status: "paid" });
    assert.equal((await api("/api/auth/google", { idToken, intent: "mechanic_login" })).status, 409);
    assert.equal((await api("/api/mechanic-verification", null, "GET", token)).status, 403);
    assert.equal((await api("/api/requests/provider/history", null, "GET", token)).status, 403);
    assert.equal((await api("/api/auth/me/active-role", { activeRole: "mechanic" }, "PATCH", token)).status, 403);
    assert.equal((await api("/api/auth/me", null, "GET", signAccessToken({ sub: id, role: "mechanic" }))).status, 401);
    const first = await api("/api/auth/google", { idToken, intent: "mechanic_register" });
    assert.equal(first.status, 200);
    assert.equal(first.data.profile.phone, phone);
    assert.equal(first.data.token, undefined);
    assert.equal(first.data.profile.name, "Existing Customer");
    assert.deepEqual((await api("/api/auth/me", null, "GET", token)).data.user.roles, ["user"]);
    await User.updateOne({ _id: id }, { $set: { "providerEnrollment.expiresAt": new Date(Date.now() - 1000) } });
    const draft = { phone, mechanicProfile: { serviceCategory: "towing", drivingLicenseUrl: "data:image/jpeg;base64,AA" } };
    const enroll = (enrollmentTicket, updates) => api("/api/auth/provider-enrollment", { ...draft, ...updates, enrollmentTicket });
    assert.equal((await enroll("invalid")).status, 401);
    assert.equal((await enroll(first.data.enrollmentTicket)).status, 401);
    const recognize = await api("/api/auth/google", { idToken, intent: "mechanic_register" });
    const { enrollmentTicket } = recognize.data;
    assert.equal((await enroll(enrollmentTicket, { phone: "03006660009" })).status, 400);
    assert.equal((await enroll(enrollmentTicket, { mechanicProfile: {} })).status, 400);
    const attempts = await Promise.all([enroll(enrollmentTicket), enroll(enrollmentTicket)]);
    const created = attempts.find(({ status }) => status === 201);
    assert.ok(created);
    assert.ok(attempts.some(({ status }) => [401, 409].includes(status)));
    assert.equal((await enroll(enrollmentTicket)).status, 401);
    const provider = created.data;
    assert.equal(provider.user.id, id);
    assert.equal(provider.user.activeRole, "mechanic");
    assert.deepEqual(provider.user.roles, ["user", "mechanic"]);
    assert.equal(provider.user.verificationStatus, "pending");
    assert.equal(provider.user.isCertified, false);
    const stored = await User.findById(id).select("+googleId +providerEnrollment");
    assert.equal(stored.role, "user");
    assert.equal(stored.googleId, "dual-role");
    assert.equal(stored.email, "customer@example.com");
    assert.equal(stored.phone, phone);
    assert.equal(stored.providerEnrollment, undefined);
    assert.equal(await User.countDocuments({ googleId: "dual-role" }), 1);
    assert.equal((await api("/api/auth/me", null, "GET", signAccessToken({ sub: id }))).data.user.activeRole, "user");
    assert.equal((await api("/api/auth/me", null, "GET", provider.token)).data.user.activeRole, "mechanic");
    const availability = { isOnline: true, location: { lat: 33.72, lng: 73.05 } };
    assert.equal((await api("/api/requests/provider/availability", availability, "PATCH", provider.token)).status, 403);
    const expiresAt = new Date(Date.now() + 60_000);
    const pendingOffer = await ServiceRequest.create({ userId: admin.id, category: "car_towing", status: "searching_provider",
      pickupLocation: availability.location, estimate: { total: 1000 },
      dispatch: { enabled: true, state: "offered", offerId: "pending-offer", offeredProviderId: id, expiresAt } });
    await User.updateOne({ _id: id }, { $set: { providerState: {
      isOnline: true, currentLocation: { ...availability.location, updatedAt: new Date() },
      reservedRequestId: pendingOffer.id, reservedOfferId: "pending-offer", reservedUntil: expiresAt
    } } });
    const denied = await api(`/api/requests/${pendingOffer.id}/accept`, { offerId: "pending-offer" }, "PATCH", provider.token);
    assert.equal(denied.status, 409);
    assert.match(denied.data.message, /verified/);
    await ServiceRequest.deleteOne({ _id: pendingOffer.id });
    await User.updateOne({ _id: id }, { $unset: { providerState: "" } });
    const own = await ServiceRequest.create({ userId: id, category: "car_towing", status: "searching_provider",
      pickupLocation: availability.location, estimate: { total: 1000 }, dispatch: newDispatch("car_towing") });
    assert.equal((await api(`/api/requests/${own.id}/accept`, { offerId: "not-an-offer" }, "PATCH", provider.token)).status, 409);
    const queue = await api("/api/admin/providers?status=pending", null, "GET", adminToken);
    assert.ok(queue.data.providers.some(row => row.id === id));
    assert.equal((await api("/api/admin/providers", null, "GET", provider.token)).status, 403);
    const image = "data:image/jpeg;base64,AA";
    const submission = await api("/api/mechanic-verification", { biometricConsent: true, profilePhoto: image, cnicFront: image }, "POST", provider.token);
    assert.equal(submission.status, 201);
    const approved = await api(`/api/admin/providers/${id}/verification`, {
      status: "verified", submissionId: submission.data.verification.submissionId
    }, "PATCH", adminToken);
    assert.equal(approved.status, 200);
    assert.equal((await api("/api/requests/provider/availability", availability, "PATCH", provider.token)).status, 200);
    await runDispatchBatch();
    assert.equal((await ServiceRequest.findById(own.id)).dispatch.state, "searching");
    assert.equal((await api("/api/requests/provider/history", null, "GET", provider.token)).status, 200);
    const asCustomer = await api("/api/auth/me/active-role", { activeRole: "user" }, "PATCH", provider.token);
    assert.equal(asCustomer.data.user.id, id);
    assert.equal(asCustomer.data.user.activeRole, "user");
    assert.equal((await api("/api/requests/provider/history", null, "GET", asCustomer.data.token)).status, 403);
    assert.equal((await api("/api/vehicles", null, "GET", asCustomer.data.token)).data.vehicles[0].id, vehicle.id);
    assert.ok((await api("/api/requests", null, "GET", asCustomer.data.token)).data.requests.some(row => row.id === booking.id));
    assert.equal(String((await Payment.findById(payment.id)).userId), id);
    assert.equal((await Payment.findById(payment.id)).status, "paid");
    assert.equal((await api("/api/auth/me/active-role", { activeRole: "mechanic" }, "PATCH", asCustomer.data.token)).data.user.activeRole, "mechanic");
    assert.equal((await api("/api/auth/me/active-role", { activeRole: "admin" }, "PATCH", asCustomer.data.token)).status, 400);
    for (const [intent, mode] of [["customer", "user"], ["mechanic_login", "mechanic"], ["mechanic_register", "mechanic"]]) {
      const login = await api("/api/auth/google", { idToken, intent });
      assert.equal(login.data.user.id, id);
      assert.equal(login.data.user.activeRole, mode);
      assert.equal(login.data.enrollmentTicket, undefined);
    }
    assert.equal((await User.findById(id)).verificationStatus, "verified");
  });

  it("does not link via email or change manual customer and provider authentication", async (t) => {
    const idToken = "verified-id-token";
    const draft = { role: "mechanic", googleIdToken: idToken, phone: "03006660003",
      mechanicProfile: { serviceCategory: "towing", drivingLicenseUrl: "data:image/jpeg;base64,AA" }
    };
    const manual = await User.create({ role: "mechanic", name: "Manual Provider", phone: "03006660004",
      email: "manual@example.com", passwordHash: await User.hashPassword("secret123") });
    mockGoogle(t, { sub: "unlinked-google", email: "manual@example.com", email_verified: true });
    assert.equal((await api("/api/auth/google", { idToken, intent: "mechanic_register" })).status, 409);
    assert.equal((await api("/api/auth/register", draft)).status, 409);
    assert.equal((await User.findById(manual.id).select("+googleId")).googleId, null);
    assert.equal((await api("/api/auth/login", { phone: manual.phone, password: "secret123" })).status, 200);
    const customer = await api("/api/auth/register", { role: "user", name: "Manual Customer",
      phone: "03006660005", password: "secret123" });
    assert.equal(customer.status, 201);
    assert.deepEqual((await api("/api/auth/login", { phone: "03006660005", password: "secret123" })).data.user.roles, ["user"]);
    assert.equal(await User.countDocuments(), 2);
  });

  it("links a manual customer only after authenticated password and Google reauthentication", async (t) => {
    const idToken = "verified-id-token";
    const password = "manual-secret123";
    const phone = "03006660100";
    const manual = await User.create({ role: "user", name: "Manual Customer", phone, email: "manual-link@example.com",
      passwordHash: await User.hashPassword(password) });
    const customer = await api("/api/auth/login", { phone, password });
    const path = "/api/auth/me/google-link";
    assert.equal((await api(path, { idToken, password })).status, 401);
    assert.equal((await api(path, { idToken, password: "wrong-password" }, "POST", customer.data.token)).status, 401);
    mockGoogle(t, { sub: "other-subject", email: "someone-else@example.com", email_verified: true });
    assert.equal((await api(path, { idToken, password }, "POST", customer.data.token)).status, 409);
    t.mock.restoreAll();
    mockGoogle(t, { sub: "manual-link-subject", email: "manual-link@example.com", email_verified: true });
    assert.equal((await api("/api/auth/google", { idToken, intent: "mechanic_register" })).status, 409);
    const linked = await api(path, { idToken, password }, "POST", customer.data.token);
    assert.equal(linked.status, 200);
    assert.equal(linked.data.profile.phone, phone);
    assert.equal((await api(path, { idToken, password }, "POST", customer.data.token)).status, 403);
    const googleCustomer = await api("/api/auth/google", { idToken });
    assert.equal(googleCustomer.data.user.id, manual.id);
    assert.equal(googleCustomer.data.user.authProvider, "local");
    assert.equal(googleCustomer.data.user.hasGoogleSignIn, true);
    const enrolled = await api("/api/auth/provider-enrollment", { enrollmentTicket: linked.data.enrollmentTicket, phone,
      mechanicProfile: { serviceCategory: "towing", drivingLicenseUrl: "data:image/jpeg;base64,AA" } });
    assert.equal(enrolled.status, 201);
    assert.equal(enrolled.data.user.id, manual.id);
    assert.equal(enrolled.data.user.activeRole, "mechanic");
    assert.deepEqual((await api("/api/auth/login", { phone, password })).data.user.roles, ["user", "mechanic"]);
    assert.equal((await api("/api/auth/google", { idToken, intent: "mechanic_login" })).data.user.id, manual.id);
    assert.equal(await User.countDocuments(), 1);
  });

  it("creates customer-only accounts, reuses them by sub, and permits multiple null phones", async (t) => {
    mockGoogle(t, { sub: "google-1", email: "First@Example.com", email_verified: true, name: "Google Customer" });
    const first = await api("/api/auth/google", { idToken: "verified-id-token", role: "admin" });
    assert.equal(first.status, 200);
    assert.equal(first.data.user.role, "user");
    assert.equal(first.data.user.phone, null);
    assert.equal(first.data.user.authProvider, "google");
    assert.equal(first.data.user.email, "first@example.com");
    assert.equal(verifyAccessToken(first.data.token).sub, first.data.user.id);
    assert.equal((await User.findById(first.data.user.id).select("+passwordHash +googleId")).passwordHash, null);

    const again = await api("/api/auth/google", { idToken: "verified-id-token" });
    assert.equal(again.status, 200);
    assert.equal(again.data.user.id, first.data.user.id);
    t.mock.restoreAll();
    mockGoogle(t, { sub: "google-2", email: "second@example.com", email_verified: true, name: "Second Customer" });
    assert.equal((await api("/api/auth/google", { idToken: "verified-id-token" })).status, 200);
    assert.equal(await User.countDocuments({ role: "user", phone: null }), 2);
  });

  it("keeps local accounts separate, rejects email collisions, and blocks password login for Google-only users", async (t) => {
    await User.create({ role: "user", name: "Local Customer", phone: "03001234567", email: "local@example.com", passwordHash: await User.hashPassword("secret123") });
    const localLogin = await api("/api/auth/login", { phone: "03001234567", password: "secret123" });
    assert.equal(localLogin.status, 200);

    mockGoogle(t, { sub: "google-3", email: "local@example.com", email_verified: true, name: "Different Google Account" });
    const collision = await api("/api/auth/google", { idToken: "verified-id-token" });
    assert.equal(collision.status, 409);
    assert.match(collision.data.message, /already exists/i);
    assert.equal(await User.countDocuments(), 1);

    t.mock.restoreAll();
    mockGoogle(t, { sub: "google-4", email: "google@example.com", email_verified: true, name: "Google Customer" });
    const google = await api("/api/auth/google", { idToken: "verified-id-token" });
    assert.equal(google.status, 200);
    assert.equal((await api("/api/auth/me/phone", { phone: "03001234567" }, "PATCH", google.data.token)).status, 409);
    const completed = await api("/api/auth/me/phone", { phone: "03007654321" }, "PATCH", google.data.token);
    assert.equal(completed.status, 200);
    assert.equal(completed.data.user.phone, "03007654321");
    assert.equal((await api("/api/auth/login", { phone: "03007654321", password: "secret123" })).status, 401);
    assert.equal((await api("/api/auth/me/phone", { phone: "03009999999" }, "PATCH", google.data.token)).status, 403);
  });

  it("keeps mechanic identity evidence out of signup and requires a separate submission for approval", async (t) => {
    const image = "data:image/jpeg;base64,AA";
    const registration = await api("/api/auth/register", {
      role: "mechanic", name: "Test Tow Provider", phone: "03001112222", password: "secret123",
      mechanicProfile: { serviceCategory: "towing", drivingLicenseUrl: image }
    });
    assert.equal(registration.status, 201);
    assert.equal((await api("/api/auth/login", { phone: "03001112222", password: "secret123" })).data.user.id, registration.data.user.id);
    assert.equal(registration.data.user.verificationStatus, "pending");
    const mechanic = await User.findById(registration.data.user.id);
    assert.equal(mechanic.mechanicProfile.drivingLicenseUrl, image);
    assert.equal(mechanic.mechanicProfile.selfieUrl, null);
    const legacy = await api("/api/auth/register", {
      role: "mechanic", name: "Legacy Tow Provider", phone: "03001112223", password: "secret123",
      mechanicProfile: { serviceCategory: "towing", selfieUrl: image, idCardFrontUrl: image, idCardBackUrl: image, drivingLicenseUrl: image }
    });
    assert.equal(legacy.status, 201);
    const legacyMechanic = await User.findById(legacy.data.user.id);
    for (const field of ["selfieUrl", "idCardFrontUrl", "idCardBackUrl"]) assert.equal(legacyMechanic.mechanicProfile[field], null);
    mechanic.email = "provider@example.com";
    await mechanic.save();

    const admin = await User.create({ role: "admin", name: "Test Admin", phone: "admin-test", email: "admin@example.com", passwordHash: await User.hashPassword("admin-secret") });
    const approval = await api(`/api/admin/providers/${mechanic.id}/verification`, { status: "verified" }, "PATCH", signAccessToken({ sub: admin.id, role: "admin" }));
    assert.equal(approval.status, 409);

    mockGoogle(t, { sub: "google-provider", email: "provider@example.com", email_verified: true, name: "Provider" });
    assert.equal((await api("/api/auth/google", { idToken: "verified-id-token" })).status, 409);
    assert.equal((await User.findById(mechanic.id)).role, "mechanic");
    assert.equal((await User.findById(mechanic.id)).verificationStatus, "pending");

    t.mock.restoreAll();
    mockGoogle(t, { sub: "google-admin", email: "admin@example.com", email_verified: true, name: "Admin" });
    assert.equal((await api("/api/auth/google", { idToken: "verified-id-token" })).status, 409);
    admin.googleId = "google-admin";
    await admin.save();
    assert.equal((await api("/api/auth/google", { idToken: "verified-id-token" })).status, 403);
  });

  it("replaces the legacy phone index so more than one absent phone is allowed", async () => {
    const collection = mongoose.connection.db.collection("legacy_phone_index_test");
    await collection.createIndex({ phone: 1 }, { name: "phone_1", unique: true });
    await collection.insertOne({ phone: "03005555555", passwordHash: "legacy-hash" });
    await migrateOptionalPhoneIndex(collection);
    await migrateOptionalPhoneIndex(collection);
    const names = (await collection.indexes()).map((index) => index.name);
    assert.ok(names.includes("phone_present_unique"));
    assert.ok(!names.includes("phone_1"));
    assert.equal((await collection.findOne({ phone: "03005555555" })).authProvider, "local");
    await collection.insertMany([{ phone: null }, { phone: null }]);
    await assert.rejects(collection.insertOne({ phone: "03001234567" }).then(() => collection.insertOne({ phone: "03001234567" })), /duplicate key/);
  });
});
