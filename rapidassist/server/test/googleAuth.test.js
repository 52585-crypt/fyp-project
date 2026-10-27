const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { OAuth2Client } = require("google-auth-library");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { signAccessToken, verifyAccessToken } = require("../src/utils/jwt");
const { migrateOptionalPhoneIndex } = require("../scripts/migrateOptionalPhoneIndex");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "google-auth-test-secret";
process.env.GOOGLE_CLIENT_IDS = "test-web-client-id,test-ios-client-id";

describe("Google customer authentication", { concurrency: false }, () => {
  let database, server, base;

  before(async () => {
    database = await MongoMemoryServer.create();
    await mongoose.connect(database.getUri(), { dbName: "rapidassist_google_auth_test" });
    await User.init();
    server = createServer(createApp());
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
      return { getPayload: () => payload };
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

  it("preserves mechanic registration and admin verification without Google role access", async (t) => {
    const image = "data:image/jpeg;base64,AA";
    const registration = await api("/api/auth/register", {
      role: "mechanic", name: "Test Tow Provider", phone: "03001112222", password: "secret123",
      mechanicProfile: { serviceCategory: "towing", selfieUrl: image, idCardFrontUrl: image, idCardBackUrl: image, drivingLicenseUrl: image }
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.data.user.verificationStatus, "pending");
    const mechanic = await User.findById(registration.data.user.id);
    mechanic.email = "provider@example.com";
    await mechanic.save();

    const admin = await User.create({ role: "admin", name: "Test Admin", phone: "admin-test", email: "admin@example.com", passwordHash: await User.hashPassword("admin-secret") });
    const approved = await api(`/api/admin/providers/${mechanic.id}/verification`, { status: "verified" }, "PATCH", signAccessToken({ sub: admin.id, role: "admin" }));
    assert.equal(approved.status, 200);
    assert.equal(approved.data.provider.verificationStatus, "verified");

    mockGoogle(t, { sub: "google-provider", email: "provider@example.com", email_verified: true, name: "Provider" });
    assert.equal((await api("/api/auth/google", { idToken: "verified-id-token" })).status, 409);
    assert.equal((await User.findById(mechanic.id)).role, "mechanic");
    assert.equal((await User.findById(mechanic.id)).verificationStatus, "verified");

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
