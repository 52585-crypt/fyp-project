// One pending offer per provider: the unique partial index, its startup behaviour, createOffer's handling of a
// conflict, the orphan sweep, and scripts/cleanupPendingOffers.js (isolated in-memory MongoDB).
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { DispatchOffer } = require("../src/models/DispatchOffer");
const { Notification } = require("../src/models/Notification");
const dispatch = require("../src/services/dispatch");
const {
  PENDING_OFFER_INDEX_NAME, ensurePendingOfferIndex, isPendingOfferConflict, pendingOfferIndexExists
} = require("../src/services/pendingOfferIndex");
const { applyCleanup, planCleanup, formatPlan } = require("../scripts/cleanupPendingOffers");

process.env.JWT_SECRET = "isolated-pending-offer-test-secret";
process.env.NODE_ENV = "test";
delete process.env.DISPATCH_TEST_BYPASS_RADIUS;
delete process.env.SMART_MATCHING_ENABLED;
for (const key of Object.keys(process.env)) if (key.startsWith("MATCHING_")) delete process.env[key];

const SCRIPT = path.join(__dirname, "..", "scripts", "cleanupPendingOffers.js");
const DB_NAME = "rapidassist_pending_offer_test";
const pickup = { lat: 31.52, lng: 74.35, addressText: "Pickup" };
let db, uri, customer, sequence = 0;

async function provider(name, overrides = {}) {
  const now = new Date();
  return User.create({
    name, phone: `provider-${++sequence}`, passwordHash: "test-only", role: "mechanic", verificationStatus: "verified",
    ratingAvg: 4.5, ratingCount: 10, mechanicProfile: { serviceCategory: "mechanic" },
    providerState: { isOnline: true, currentLocation: { ...pickup, lat: 31.521, updatedAt: now }, lastSeenAt: now },
    ...overrides
  });
}

async function request(fields = {}) {
  return ServiceRequest.create({
    userId: customer._id, category: "mechanic", pickupLocation: pickup, dispatch: dispatch.newDispatch("mechanic"),
    estimate: { currency: "PKR", total: 1000 }, status: "searching_provider", ...fields
  });
}

/** A raw DispatchOffer document (bypasses Mongoose so tests can create states the app never would). */
function offerDoc(providerId, requestId, offerId, outcome = "offered", { offeredAt = new Date(), expiresAt = new Date(Date.now() + 15000) } = {}) {
  return {
    requestId, providerId, offerId, algorithmVersion: "batch-mincost-v1", priority: "normal", distanceKm: 1,
    score: 50, components: { proximity: 0.5, rating: 0.9, experience: 0.2, responseSpeed: 0.5 },
    offeredAt, expiresAt, outcome, respondedAt: null, responseSeconds: null, createdAt: offeredAt, updatedAt: offeredAt
  };
}

async function dumpAll() {
  const dump = async (collection) => JSON.stringify(await mongoose.connection.db.collection(collection).find({}).sort({ _id: 1 }).toArray());
  return { offers: await dump("dispatchoffers"), requests: await dump("servicerequests"), users: await dump("users") };
}

async function dropPendingOfferIndex() {
  if (await pendingOfferIndexExists()) await DispatchOffer.collection.dropIndex(PENDING_OFFER_INDEX_NAME);
}

function withEnv(t, vars) {
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

describe("one pending offer per provider (isolated real MongoDB)", { concurrency: false }, () => {
  before(async () => {
    db = await MongoMemoryServer.create();
    uri = db.getUri();
    await mongoose.connect(uri, { dbName: DB_NAME });
    await Promise.all([User.init(), ServiceRequest.init(), DispatchOffer.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), ServiceRequest.deleteMany({}), DispatchOffer.deleteMany({}), Notification.deleteMany({})]);
    await ensurePendingOfferIndex();
    customer = await User.create({ name: "Customer", phone: `customer-${++sequence}`, passwordHash: "test-only", role: "user" });
  });
  after(async () => { await mongoose.disconnect(); if (db) await db.stop(); });

  it("blocks a second pending offer for the same provider at the database level", async () => {
    assert.equal(await pendingOfferIndexExists(), true);
    const p = await provider("P");
    const q = await provider("Q");
    const r = await request();
    await DispatchOffer.collection.insertOne(offerDoc(p._id, r._id, "first"));
    await assert.rejects(DispatchOffer.collection.insertOne(offerDoc(p._id, r._id, "second")), (error) => isPendingOfferConflict(error));
    // Other outcomes and other providers are unaffected.
    await DispatchOffer.collection.insertOne(offerDoc(p._id, r._id, "old-accepted", "accepted"));
    await DispatchOffer.collection.insertOne(offerDoc(p._id, r._id, "old-expired", "expired"));
    await DispatchOffer.collection.insertOne(offerDoc(q._id, r._id, "q-offer"));
    // A duplicate offerId is a different unique index and must not be mistaken for a pending-offer conflict.
    const duplicateId = await DispatchOffer.collection.insertOne(offerDoc(q._id, r._id, "q-offer", "expired")).catch((error) => error);
    assert.equal(duplicateId.code, 11000);
    assert.equal(isPendingOfferConflict(duplicateId), false);
  });

  it("concurrent pending offers for one provider leave exactly one", async () => {
    const p = await provider("P");
    const r = await request();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) => DispatchOffer.collection.insertOne(offerDoc(p._id, r._id, `race-${index}`)))
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(results.filter((result) => result.status === "rejected").every((result) => isPendingOfferConflict(result.reason)));
    assert.equal(await DispatchOffer.countDocuments({ providerId: p._id, outcome: "offered" }), 1);
  });

  it("two dispatcher instances racing for one provider create exactly one pending offer", async () => {
    // A second module instance has its own in-process batch lock, like a second server process.
    const modulePath = require.resolve("../src/services/dispatch");
    delete require.cache[modulePath];
    const secondInstance = require(modulePath);
    require.cache[modulePath].exports = dispatch;
    for (let round = 0; round < 10; round += 1) {
      await Promise.all([ServiceRequest.deleteMany({}), DispatchOffer.deleteMany({}), User.deleteMany({ role: "mechanic" })]);
      const p = await provider(`P${round}`);
      await request();
      await request();
      const now = new Date();
      const [first, second] = await Promise.all([dispatch.runDispatchBatch(now), secondInstance.runDispatchBatch(now)]);
      assert.equal(await DispatchOffer.countDocuments({ providerId: p._id, outcome: "offered" }), 1, `round ${round}`);
      assert.equal(await ServiceRequest.countDocuments({ "dispatch.state": "offered" }), 1, `round ${round}`);
      assert.equal(first.offersCreated + second.offersCreated, 1, `round ${round}: actual offers reported`);
    }
  });

  for (const smart of [false, true]) {
    it(`createOffer treats an index conflict as "provider already has a pending offer" (flag ${smart ? "on" : "off"})`, async (t) => {
      withEnv(t, { SMART_MATCHING_ENABLED: smart ? "true" : null });
      const warnings = [];
      t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
      const now = new Date();
      const p = await provider("P");
      const old = await request();
      // An interrupted flow left a pending record that its request no longer references; the reservation is free.
      await DispatchOffer.collection.insertOne(offerDoc(p._id, old._id, "orphan", "offered", {
        offeredAt: new Date(+now - 60000), expiresAt: new Date(+now - 40000)
      }));
      await ServiceRequest.deleteOne({ _id: old._id });
      const job = await request();

      const result = await dispatch.runDispatchBatch(now);
      assert.equal(result.offersCreated, 0);
      assert.deepEqual(result.offersFailed, [{ requestId: job.id, providerId: p.id, reason: "duplicate_pending_offer" }]);
      if (smart) {
        assert.deepEqual(result.assignments, [], "smart result lists actual offers only");
        assert.deepEqual(result.unassignedRequestIds, [job.id]);
        assert.equal(result.plannedMatches, 1);
      }
      const untouched = await ServiceRequest.findById(job.id);
      assert.equal(untouched.dispatch.state, "searching");
      assert.equal(untouched.dispatch.attemptedProviderIds.length, 0, "the provider stays eligible for this request");
      assert.equal((await User.findById(p.id)).providerState.reservedOfferId, null, "reservation rolled back");
      assert.equal(await DispatchOffer.countDocuments({ outcome: "offered" }), 1, "only the orphan is pending");
      assert.ok(warnings.some((line) => /already has a pending offer/.test(line)));

      // The periodic recovery sweep withdraws the orphan (not "expired": the provider did not ignore it) ...
      await dispatch.recoverReservations(now);
      const orphan = await DispatchOffer.findOne({ offerId: "orphan" });
      assert.equal(orphan.outcome, "withdrawn");
      // ... and the next batch re-plans and offers normally.
      const next = await dispatch.runDispatchBatch(new Date(+now + 1000));
      assert.equal(next.offersCreated, 1);
      assert.equal(String((await ServiceRequest.findById(job.id)).dispatch.offeredProviderId), p.id);
    });
  }

  it("the recovery sweep never withdraws a live offer", async () => {
    const p = await provider("P");
    const job = await request();
    await dispatch.runDispatchBatch(new Date());
    const live = await ServiceRequest.findById(job.id);
    assert.equal(live.dispatch.state, "offered");
    // Even long after expiry, an offer its request still references is left to reconcileOffers.
    await dispatch.recoverReservations(new Date(Date.now() + 120000));
    assert.equal((await DispatchOffer.findOne({ offerId: live.dispatch.offerId })).outcome, "offered");
    assert.equal(String(p._id), String(live.dispatch.offeredProviderId));
  });

  it("startup index build with existing duplicates warns instead of throwing", async () => {
    await dropPendingOfferIndex();
    const p = await provider("P");
    const r = await request();
    await DispatchOffer.collection.insertMany([offerDoc(p._id, r._id, "dup-1"), offerDoc(p._id, r._id, "dup-2")]);
    const warnings = [];
    const result = await ensurePendingOfferIndex({ logger: { warn: (line) => warnings.push(line) } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "duplicates");
    assert.equal(await pendingOfferIndexExists(), false);
    assert.ok(warnings.some((line) => line.includes(PENDING_OFFER_INDEX_NAME) && line.includes("cleanupPendingOffers.js")));
    // The dispatcher keeps working without the index (reservations still guard it).
    await provider("Q");
    await request();
    const batch = await dispatch.runDispatchBatch(new Date());
    assert.ok(batch.offersCreated >= 1);
  });

  it("cleanup: dry run changes nothing; apply resolves duplicates; a second run finds nothing", async () => {
    await dropPendingOfferIndex();
    const now = new Date();
    const p = await provider("P");
    const q = await provider("Q");
    const liveRequest = await request({ dispatch: { ...dispatch.newDispatch("mechanic"), state: "offered", offerId: "live-1", offeredProviderId: p._id, offeredAt: now, expiresAt: new Date(+now + 15000), attemptedProviderIds: [p._id] } });
    const staleRequest = await request();
    const acceptedAt = new Date(+now - 60000);
    const assignedRequest = await request({
      status: "provider_assigned", providerId: p._id, assignmentActive: true, acceptedAt,
      dispatch: { ...dispatch.newDispatch("mechanic"), state: "assigned", offerId: "assigned-1", offeredProviderId: p._id, attemptedProviderIds: [p._id] }
    });
    const qRequest = await request({ dispatch: { ...dispatch.newDispatch("mechanic"), state: "offered", offerId: "q-1", offeredProviderId: q._id, offeredAt: now, expiresAt: new Date(+now + 15000), attemptedProviderIds: [q._id] } });
    await User.updateOne({ _id: p._id }, { $set: { "providerState.reservedOfferId": "live-1", "providerState.reservedRequestId": liveRequest._id, "providerState.reservedUntil": new Date(+now + 15000) } });
    await DispatchOffer.collection.insertMany([
      offerDoc(p._id, liveRequest._id, "live-1", "offered", { offeredAt: new Date(+now - 1000) }),
      offerDoc(p._id, staleRequest._id, "stale-1", "offered", { offeredAt: new Date(+now - 300000) }),
      offerDoc(p._id, assignedRequest._id, "assigned-1", "offered", { offeredAt: new Date(+now - 70000) }),
      offerDoc(p._id, assignedRequest._id, "old-accepted", "accepted", { offeredAt: new Date(+now - 900000) }),
      offerDoc(q._id, qRequest._id, "q-1", "offered")
    ]);

    const before = await dumpAll();
    const dry = await planCleanup({ now });
    assert.deepEqual(await dumpAll(), before, "planning writes nothing");
    assert.equal(dry.groups.length, 1);
    assert.equal(dry.groups[0].providerId, p.id);
    assert.deepEqual(Object.fromEntries(dry.groups[0].offers.map((offer) => [offer.offerId, offer.action])), {
      "live-1": "keep", "assigned-1": "accepted", "stale-1": "withdrawn"
    });
    assert.deepEqual(dry.totals, { groups: 1, keep: 1, accepted: 1, withdrawn: 1 });
    assert.match(formatPlan(dry, { apply: false, target: "test", indexExists: false }), /DRY RUN[\s\S]*keep\s+offer live-1[\s\S]*Nothing was written/);

    // The CLI dry run against the same database also writes nothing.
    const cli = spawnSync(process.execPath, [SCRIPT, "--confirm-local-dev", `--uri=${uri.replace(/\/?$/, "/")}${DB_NAME}`], { encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /DRY RUN \(no writes\)/);
    assert.match(cli.stdout, /Duplicate groups \(providers with more than one pending offer\): 1/);
    assert.deepEqual(await dumpAll(), before, "CLI dry run writes nothing");

    const applied = await applyCleanup(dry);
    assert.equal(applied.modified, 2);
    const after = await dumpAll();
    assert.equal(after.requests, before.requests, "service requests (including the active job) untouched");
    assert.equal(after.users, before.users, "users untouched");
    const outcome = async (offerId) => (await DispatchOffer.findOne({ offerId }).lean());
    assert.equal((await outcome("live-1")).outcome, "offered");
    const accepted = await outcome("assigned-1");
    assert.equal(accepted.outcome, "accepted");
    assert.equal(+accepted.respondedAt, +acceptedAt);
    assert.equal(accepted.responseSeconds, 10);
    const stale = await outcome("stale-1");
    assert.equal(stale.outcome, "withdrawn");
    assert.equal(stale.responseSeconds, null);
    const beforeOffers = JSON.parse(before.offers);
    const afterOffers = JSON.parse(after.offers);
    for (const offerId of ["old-accepted", "q-1"]) {
      assert.deepEqual(afterOffers.find((offer) => offer.offerId === offerId), beforeOffers.find((offer) => offer.offerId === offerId), `${offerId} untouched`);
    }

    const second = await planCleanup({ now });
    assert.equal(second.groups.length, 0, "idempotent: a second run finds nothing");
    assert.deepEqual(await applyCleanup(second), { modified: 0 });
    assert.equal((await ensurePendingOfferIndex()).ok, true, "the index now builds");
  });

  it("cleanup can mark stale duplicates expired when asked", async () => {
    await dropPendingOfferIndex();
    const p = await provider("P");
    const a = await request();
    const b = await request();
    await DispatchOffer.collection.insertMany([offerDoc(p._id, a._id, "s-1"), offerDoc(p._id, b._id, "s-2")]);
    const plan = await planCleanup({ staleOutcome: "expired" });
    assert.deepEqual(plan.groups[0].offers.map((offer) => offer.action), ["expired", "expired"]);
    await applyCleanup(plan);
    assert.equal(await DispatchOffer.countDocuments({ outcome: "expired" }), 2);
  });

  it("the cleanup CLI refuses unsafe invocations before connecting", () => {
    const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
    const noConfirm = run([`--uri=${uri}`]);
    assert.equal(noConfirm.status, 2);
    assert.match(noConfirm.stderr, /--confirm-local-dev/);
    const remote = run(["--confirm-local-dev", "--uri=mongodb+srv://fake-user:fake-password@cluster0.example.invalid/prod"]);
    assert.equal(remote.status, 2);
    assert.match(remote.stderr, /not localhost/);
    assert.doesNotMatch(remote.stderr, /fake-password/, "credentials are never printed");
    const production = run(["--confirm-local-dev", `--uri=${uri}`], { NODE_ENV: "production" });
    assert.equal(production.status, 2);
    assert.match(production.stderr, /NODE_ENV=production/);
    const noUri = run(["--confirm-local-dev"]);
    assert.equal(noUri.status, 2);
    assert.match(noUri.stderr, /\.env files are not read/);
    const both = run(["--confirm-local-dev", "--apply", "--dry-run", `--uri=${uri}`]);
    assert.equal(both.status, 2);
  });
});
