// Integration tests for the SMART_MATCHING_ENABLED branch of the batch dispatcher (isolated in-memory MongoDB).
// The flag-off test compares against a golden snapshot recorded from the dispatcher *before* the smart branch
// was added (RECORD_DISPATCH_GOLDEN=1 rewrites it; never do that to paper over a regression).
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { DispatchOffer } = require("../src/models/DispatchOffer");
const { Notification } = require("../src/models/Notification");
const { newDispatch, runDispatchBatch, acceptOffer, declineOffer } = require("../src/services/dispatch");
const { ensurePendingOfferIndex } = require("../src/services/pendingOfferIndex");

process.env.JWT_SECRET = "isolated-smart-matching-test-secret";
process.env.NODE_ENV = "test";
delete process.env.DISPATCH_TEST_BYPASS_RADIUS;
delete process.env.SMART_MATCHING_ENABLED;
for (const key of Object.keys(process.env)) if (key.startsWith("MATCHING_")) delete process.env[key];

const GOLDEN_PATH = path.join(__dirname, "fixtures", "dispatch-flag-off-golden.json");
const BASE = { lat: 31.52, lng: 74.35 };
const KM_PER_DEGREE = 6371 * (Math.PI / 180);
const at = (northKm, eastKm = 0) => ({
  lat: BASE.lat + northKm / KM_PER_DEGREE,
  lng: BASE.lng + eastKm / (KM_PER_DEGREE * Math.cos((BASE.lat * Math.PI) / 180))
});

let db, customer;
const names = new Map();
let nextId = 1;
function oid(name) {
  const id = new mongoose.Types.ObjectId((nextId++).toString(16).padStart(24, "0"));
  names.set(String(id), name);
  return id;
}
const nameOf = (id) => (id == null ? null : names.get(String(id)) ?? String(id));

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
const smartOn = (t, extra = {}) => withEnv(t, { SMART_MATCHING_ENABLED: "true", ...extra });

async function makeProvider(name, category, location, now, { state = {}, ...extra } = {}) {
  return User.create({
    _id: oid(name), name, phone: `provider-${name}-${nextId}`, passwordHash: "test-only", role: "mechanic",
    verificationStatus: "verified", ratingAvg: 4.5, ratingCount: 10, completedJobs: 20,
    mechanicProfile: { serviceCategory: category },
    providerState: { isOnline: true, currentLocation: { ...location, updatedAt: new Date(+now - 10000) }, lastSeenAt: now, ...state },
    ...extra
  });
}

async function makeRequest(name, category, location, now, { priority = "normal", waitedSeconds = 30, dispatch = {} } = {}) {
  const createdAt = new Date(+now - waitedSeconds * 1000);
  const _id = oid(name);
  await ServiceRequest.create({
    _id, userId: customer._id, category, priority,
    pickupLocation: { ...location, addressText: name },
    ...(category === "car_towing" ? { destinationLocation: { ...at(5, 5), addressText: "Garage" } } : {}),
    dispatch: { ...newDispatch(category, createdAt), ...dispatch },
    estimate: { currency: "PKR", total: 1000 }, status: "searching_provider"
  });
  // Raw collection write: Mongoose treats createdAt as immutable and would silently drop this update.
  await ServiceRequest.collection.updateOne({ _id }, { $set: { createdAt } });
  return ServiceRequest.findById(_id);
}

async function snapshot(now, result) {
  const requests = await ServiceRequest.find({}).sort({ _id: 1 });
  const offers = await DispatchOffer.find({}).sort({ requestId: 1, providerId: 1 }).lean();
  const providers = await User.find({ role: "mechanic" }).sort({ _id: 1 });
  return {
    result: result && {
      assignments: [...result.assignments].map((item) => ({
        request: nameOf(item.requestId), provider: nameOf(item.providerId), cost: item.cost, durationSeconds: item.durationSeconds, source: item.source
      })).sort((a, b) => a.request.localeCompare(b.request)),
      unassigned: [...result.unassignedRequestIds].map(nameOf).sort(),
      totalCost: result.totalCost
    },
    requests: requests.map((request) => ({
      request: nameOf(request._id), status: request.status, state: request.dispatch.state,
      offeredTo: nameOf(request.dispatch.offeredProviderId),
      attempts: request.dispatch.attemptedProviderIds.map(nameOf),
      expiresInMs: request.dispatch.expiresAt ? +request.dispatch.expiresAt - +now : null,
      version: request.dispatch.version
    })),
    offers: offers.map((offer) => ({
      request: nameOf(offer.requestId), provider: nameOf(offer.providerId), algorithmVersion: offer.algorithmVersion,
      priority: offer.priority, distanceKm: offer.distanceKm, routeDistanceKm: offer.routeDistanceKm,
      travelDurationSeconds: offer.travelDurationSeconds, routeSource: offer.routeSource,
      assignmentCost: offer.assignmentCost, waitingCost: offer.waitingCost,
      baselineNearestDistanceKm: offer.baselineNearestDistanceKm, score: offer.score, components: offer.components,
      outcome: offer.outcome, offeredAtMs: +offer.offeredAt - +now, expiresInMs: +offer.expiresAt - +now,
      hasCostBreakdown: "costBreakdown" in offer, hasAttempt: "attempt" in offer
    })),
    reservations: providers.map((provider) => ({
      provider: nameOf(provider._id), reservedFor: nameOf(provider.providerState.reservedRequestId),
      reservedUntilMs: provider.providerState.reservedUntil ? +provider.providerState.reservedUntil - +now : null
    }))
  };
}

/** Mixed categories, contested mechanic and towing capacity, one out-of-radius provider. */
async function goldenFixture(now) {
  await makeProvider("M1", "mechanic", at(0.5), now, { ratingAvg: 4.8, ratingCount: 10 });
  await makeProvider("M2", "mechanic", at(3, 1), now, { ratingAvg: 4.2, ratingCount: 30 });
  await makeProvider("M3", "mechanic", at(9), now);
  await makeProvider("F1", "fuel_delivery", at(-2), now);
  await makeProvider("F2", "fuel_delivery", at(0, 6), now, { ratingAvg: 5, ratingCount: 2 });
  await makeProvider("T1", "towing", at(-7), now);
  await makeRequest("RM1", "mechanic", at(0), now, { priority: "normal", waitedSeconds: 100 });
  await makeRequest("RM2", "mechanic", at(0, 2), now, { priority: "urgent", waitedSeconds: 10 });
  await makeRequest("RM3", "mechanic", at(1), now, { priority: "high", waitedSeconds: 50 });
  await makeRequest("RF1", "fuel_delivery", at(-1), now, { priority: "normal", waitedSeconds: 20 });
  await makeRequest("RF2", "fuel_delivery", at(0, 4), now, { priority: "high", waitedSeconds: 60 });
  await makeRequest("RT1", "car_towing", at(-3), now, { priority: "normal", waitedSeconds: 40 });
  await makeRequest("RT2", "car_towing", at(-6), now, { priority: "urgent", waitedSeconds: 5 });
}

const idNamed = (name) => [...names].find(([, value]) => value === name)[0];
const requestNamed = (name) => ServiceRequest.findById(idNamed(name));
const userNamed = (name) => User.findById(idNamed(name));
const offerFor = requestNamed;
const later = (now, ms) => new Date(+now + ms);

describe("smart matching integration (isolated real MongoDB)", { concurrency: false }, () => {
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_smart_matching_test" });
    await Promise.all([User.init(), ServiceRequest.init(), DispatchOffer.init()]);
    assert.equal((await ensurePendingOfferIndex()).ok, true);
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), ServiceRequest.deleteMany({}), DispatchOffer.deleteMany({}), Notification.deleteMany({})]);
    names.clear();
    nextId = 1;
    customer = await User.create({ _id: oid("customer"), name: "Customer", phone: "customer", passwordHash: "test-only", role: "user" });
  });
  after(async () => { await mongoose.disconnect(); if (db) await db.stop(); });

  it("flag off: dispatcher output is identical to the pre-change golden snapshot", async (t) => {
    withEnv(t, { SMART_MATCHING_ENABLED: null });
    const now = new Date();
    await goldenFixture(now);
    const round1 = await snapshot(now, await runDispatchBatch(now));
    const declined = round1.requests.find((item) => item.state === "offered" && item.request === "RM1")
      || round1.requests.find((item) => item.state === "offered");
    const declinedRequest = await offerFor(declined.request);
    await declineOffer(declinedRequest.id, declinedRequest.dispatch.offeredProviderId, declinedRequest.dispatch.offerId);
    const now2 = new Date(+now + 5000);
    const round2 = await snapshot(now2, await runDispatchBatch(now2));
    const actual = { round1, declined: declined.request, round2 };
    if (process.env.RECORD_DISPATCH_GOLDEN === "1") {
      fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
      fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    assert.deepEqual(actual, JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")));
  });
  it("flag on: matches each service category separately and records real pair costs", async (t) => {
    smartOn(t);
    const now = new Date();
    await makeProvider("M1", "mechanic", at(1), now);
    await makeProvider("M2", "mechanic", at(-1), now);
    await makeProvider("F1", "fuel_delivery", at(1), now);
    await makeProvider("T1", "towing", at(1), now);
    await makeRequest("RM", "mechanic", at(0), now);
    await makeRequest("RF", "fuel_delivery", at(0.2), now);
    await makeRequest("RT", "car_towing", at(-0.2), now);
    await makeRequest("RF-far", "fuel_delivery", at(30), now);
    const result = await runDispatchBatch(now);

    assert.equal(result.algorithmVersion, "smart-hungarian-v1");
    assert.deepEqual(result.categories.map((item) => item.category), ["fuel_delivery", "mechanic", "towing"]);
    const expectedCategory = { RM: "mechanic", RF: "fuel_delivery", RT: "towing" };
    const offers = await DispatchOffer.find({}).lean();
    assert.equal(offers.length, 3);
    for (const offer of offers) {
      const provider = await User.findById(offer.providerId);
      assert.equal(provider.mechanicProfile.serviceCategory, expectedCategory[nameOf(offer.requestId)]);
      assert.equal(offer.algorithmVersion, "smart-hungarian-v1");
      assert.equal(offer.waitingCost, null, "no unmatched penalty stored on an offer");
      assert.equal(offer.attempt, 1);
      for (const term of ["E", "Q", "A", "S", "F", "T"]) assert.ok(Number.isFinite(offer.costBreakdown[term]), term);
      assert.equal(offer.costBreakdown.pairCost, offer.assignmentCost);
      assert.ok(offer.assignmentCost >= 0 && offer.assignmentCost <= 100, `real pair cost ${offer.assignmentCost}`);
    }
    assert.equal((await requestNamed("RF-far")).dispatch.state, "searching");
    assert.deepEqual(result.unassignedRequestIds.map(nameOf), ["RF-far"]);
    assert.equal(result.unmatchedCount, 1);
    const offeredCost = offers.reduce((sum, offer) => sum + offer.assignmentCost, 0);
    assert.ok(Math.abs(result.assignedCost - offeredCost) < 1e-9, "batch cost = sum of real pair costs, no penalties");
  });

  it("flag on: respects existing reservations and pending offers; no provider holds two pending offers", async (t) => {
    smartOn(t);
    const now = new Date();
    const reservedUntil = later(now, 15000);
    const reserved = await makeProvider("R", "mechanic", at(0.1), now);
    await makeProvider("S", "mechanic", at(3), now);
    const held = await makeRequest("HELD", "mechanic", at(0.2), now, { dispatch: {
      state: "offered", offerId: "pre-existing-offer", offeredProviderId: reserved._id, offeredAt: now,
      expiresAt: reservedUntil, attemptedProviderIds: [reserved._id], nextAttemptAt: null
    } });
    await User.updateOne({ _id: reserved._id }, { $set: {
      "providerState.reservedRequestId": held._id, "providerState.reservedOfferId": "pre-existing-offer", "providerState.reservedUntil": reservedUntil
    } });
    await makeRequest("NEW", "mechanic", at(0), now);

    await Promise.all([runDispatchBatch(now), runDispatchBatch(now)]);
    for (let round = 1; round <= 3; round += 1) await runDispatchBatch(later(now, round * 1000));

    const heldAfter = await requestNamed("HELD");
    assert.equal(heldAfter.dispatch.state, "offered");
    assert.equal(heldAfter.dispatch.offerId, "pre-existing-offer");
    assert.equal(nameOf(heldAfter.dispatch.offeredProviderId), "R");
    assert.equal(nameOf((await requestNamed("NEW")).dispatch.offeredProviderId), "S");
    assert.equal((await userNamed("R")).providerState.reservedOfferId, "pre-existing-offer");
    assert.equal(await DispatchOffer.countDocuments({}), 1, "one new offer only, despite five batch runs");
    const pendingPerProvider = await DispatchOffer.aggregate([{ $match: { outcome: "offered" } }, { $group: { _id: "$providerId", count: { $sum: 1 } } }]);
    assert.ok(pendingPerProvider.every((row) => row.count === 1));
  });

  it("flag on: offline, busy, stale, unverified, wrong-category and out-of-radius providers are excluded", async (t) => {
    smartOn(t);
    const now = new Date();
    const stale = new Date(+now - 10 * 60 * 1000);
    await makeProvider("OFFLINE", "mechanic", at(0.1), now, { state: { isOnline: false } });
    await makeProvider("BUSY", "mechanic", at(0.1), now, { state: { activeRequestId: new mongoose.Types.ObjectId() } });
    await makeProvider("STALE", "mechanic", at(0.1), now, { state: { currentLocation: { ...at(0.1), updatedAt: stale } } });
    await makeProvider("OLD-FIX", "mechanic", at(0.1), now, { state: { currentLocation: { ...at(0.1), updatedAt: later(now, -5000), capturedAt: stale } } });
    await makeProvider("UNVERIFIED", "mechanic", at(0.1), now, { verificationStatus: "pending" });
    await makeProvider("TOWER", "towing", at(0.1), now);
    await makeProvider("FAR", "mechanic", at(8.5), now);
    await makeProvider("OK", "mechanic", at(6), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    await runDispatchBatch(now);
    assert.equal(nameOf((await requestNamed("JOB")).dispatch.offeredProviderId), "OK");

    // OK is now reserved; nobody else qualifies, so a second job keeps searching.
    await makeRequest("JOB2", "mechanic", at(0), now);
    await runDispatchBatch(later(now, 1000));
    const second = await requestNamed("JOB2");
    assert.equal(second.dispatch.state, "searching");
    assert.equal(second.dispatch.attemptedProviderIds.length, 0);
    assert.equal(await DispatchOffer.countDocuments({}), 1);
  });

  it("flag on: decline re-matches and never re-offers the request to the declining provider", async (t) => {
    smartOn(t);
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeProvider("B", "mechanic", at(3), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    await runDispatchBatch(now);
    let job = await requestNamed("JOB");
    assert.equal(nameOf(job.dispatch.offeredProviderId), "A");
    await declineOffer(job.id, job.dispatch.offeredProviderId, job.dispatch.offerId);

    await runDispatchBatch(later(now, 1000));
    job = await requestNamed("JOB");
    assert.equal(nameOf(job.dispatch.offeredProviderId), "B");
    assert.deepEqual(job.dispatch.attemptedProviderIds.map(nameOf), ["A", "B"]);
    assert.equal((await DispatchOffer.findOne({ offerId: job.dispatch.offerId })).attempt, 2);
    await declineOffer(job.id, job.dispatch.offeredProviderId, job.dispatch.offerId);

    for (let round = 2; round < 5; round += 1) await runDispatchBatch(later(now, round * 1000));
    job = await requestNamed("JOB");
    assert.equal(job.dispatch.state, "searching");
    assert.equal(job.dispatch.offeredProviderId, null);
    assert.equal(await DispatchOffer.countDocuments({}), 2);
    assert.equal((await userNamed("A")).providerPerformance.declinedOffers, 1);
  });

  it("flag on: an expired offer (20 s) re-matches and counts against the provider's acceptance", async (t) => {
    smartOn(t);
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeProvider("B", "mechanic", at(3), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    await runDispatchBatch(now);
    const first = await requestNamed("JOB");
    assert.equal(nameOf(first.dispatch.offeredProviderId), "A");
    assert.equal(+first.dispatch.expiresAt - +now, 20000);

    await runDispatchBatch(later(now, 20001));
    const job = await requestNamed("JOB");
    assert.equal(nameOf(job.dispatch.offeredProviderId), "B");
    assert.equal((await DispatchOffer.findOne({ offerId: first.dispatch.offerId })).outcome, "expired");
    const a = await userNamed("A");
    assert.equal(a.providerPerformance.expiredOffers, 1);
    assert.equal(a.providerPerformance.acceptedOffers, 0);
    assert.equal(a.providerPerformance.declinedOffers, 0);
    assert.equal(a.providerPerformance.responseSamples, 0, "ignored offers are not response-time samples");
    assert.equal(a.providerPerformance.averageResponseSeconds, null);
    assert.equal(a.providerState.reservedOfferId, null);
  });

  it("flag off: expired offers are also counted (stats only; the existing solver does not read them)", async (t) => {
    withEnv(t, { SMART_MATCHING_ENABLED: null });
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    await runDispatchBatch(now);
    await runDispatchBatch(later(now, 20001));
    assert.equal((await userNamed("A")).providerPerformance.expiredOffers, 1);
  });

  it("flag on by default: a search is never ended early by attempts; only the 180 s timeout ends it", async (t) => {
    smartOn(t);
    const now = new Date();
    for (let index = 0; index < 7; index += 1) await makeProvider(`P${index}`, "mechanic", at(0.3 + index * 0.5), now);
    await makeRequest("JOB", "mechanic", at(0), now, { waitedSeconds: 0 });
    let clock = +now;
    for (let round = 0; round < 6; round += 1) {
      await runDispatchBatch(new Date(clock));
      const job = await requestNamed("JOB");
      assert.equal(job.dispatch.state, "offered", `round ${round}: still matching after ${round} declines`);
      await declineOffer(job.id, job.dispatch.offeredProviderId, job.dispatch.offerId);
      clock += 1000;
    }
    await runDispatchBatch(new Date(clock));
    const seventh = await requestNamed("JOB");
    assert.equal(seventh.dispatch.state, "offered", "7th provider offered: more than the old default of 5 attempts");
    assert.equal(seventh.dispatch.attemptedProviderIds.length, 7);
    // Once every provider has declined, the request keeps searching until the deadline, then times out as today.
    await declineOffer(seventh.id, seventh.dispatch.offeredProviderId, seventh.dispatch.offerId);
    await runDispatchBatch(new Date(+now + 179000));
    assert.equal((await requestNamed("JOB")).dispatch.state, "searching");
    await runDispatchBatch(new Date(+now + 180000));
    assert.equal((await requestNamed("JOB")).dispatch.state, "unavailable");
  });

  it("flag on: max attempts (opt-in) and the search timeout stop re-matching", async (t) => {
    smartOn(t, { MATCHING_MAX_ATTEMPTS: "2" });
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeProvider("B", "mechanic", at(1), now);
    await makeProvider("C", "mechanic", at(1.5), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    let clock = +now;
    for (let round = 0; round < 2; round += 1) {
      await runDispatchBatch(new Date(clock));
      const job = await requestNamed("JOB");
      assert.equal(job.dispatch.state, "offered");
      await declineOffer(job.id, job.dispatch.offeredProviderId, job.dispatch.offerId);
      clock += 1000;
    }
    for (let round = 0; round < 5; round += 1) {
      await runDispatchBatch(new Date(clock));
      clock += 1000;
    }
    const job = await requestNamed("JOB");
    assert.equal(job.dispatch.state, "unavailable");
    assert.equal(job.dispatch.attemptedProviderIds.length, 2);
    assert.equal(await DispatchOffer.countDocuments({}), 2, "provider C is never offered the exhausted request");
    assert.equal((await userNamed("C")).providerState.reservedOfferId, null);

    // Search timeout: created 200 s ago with the 180 s deadline already passed.
    await makeRequest("LATE", "mechanic", at(0), now, { waitedSeconds: 200 });
    await runDispatchBatch(new Date(clock));
    assert.equal((await requestNamed("LATE")).dispatch.state, "unavailable");
    assert.equal(await DispatchOffer.countDocuments({}), 2);
  });

  it("flag on: a cancellation landing during matching leaves no offer and frees the provider", async (t) => {
    smartOn(t);
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    const original = ServiceRequest.findOneAndUpdate;
    let intercepted = false;
    const mocked = t.mock.method(ServiceRequest, "findOneAndUpdate", async function interceptOfferClaim(filter, update, ...rest) {
      if (!intercepted && update?.$set?.["dispatch.state"] === "offered") {
        intercepted = true; // the customer cancels after matching chose a provider, before the offer is written
        await ServiceRequest.updateOne({ _id: filter._id }, {
          $set: { status: "cancelled", cancelledAt: new Date(), "dispatch.state": "cancelled" }, $inc: { "dispatch.version": 1 }
        });
      }
      return original.call(this, filter, update, ...rest);
    });
    await runDispatchBatch(now);
    mocked.mock.restore();

    assert.ok(intercepted, "the offer claim ran");
    const job = await requestNamed("JOB");
    assert.equal(job.status, "cancelled");
    assert.equal(job.dispatch.offerId, null);
    assert.equal(await DispatchOffer.countDocuments({}), 0);
    assert.equal((await userNamed("A")).providerState.reservedOfferId, null, "reservation rolled back");

    await makeRequest("NEXT", "mechanic", at(0), now);
    await runDispatchBatch(later(now, 1000));
    assert.equal(nameOf((await requestNamed("NEXT")).dispatch.offeredProviderId), "A", "provider is not stuck");
  });

  it("flag on: concurrent accepts on one offer produce exactly one winner", async (t) => {
    smartOn(t);
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeProvider("B", "mechanic", at(1), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    await runDispatchBatch(now);
    const job = await requestNamed("JOB");
    const winner = String(job.dispatch.offeredProviderId);
    const other = String(idNamed(nameOf(winner) === "A" ? "B" : "A"));
    const results = await Promise.allSettled([
      acceptOffer(job.id, winner, job.dispatch.offerId),
      acceptOffer(job.id, other, job.dispatch.offerId),
      acceptOffer(job.id, winner, job.dispatch.offerId)
    ]);
    assert.equal(results[1].status, "rejected");
    const final = await requestNamed("JOB");
    assert.equal(final.status, "provider_assigned");
    assert.equal(String(final.providerId), winner);
    assert.equal(await ServiceRequest.countDocuments({ assignmentActive: true }), 1);
    assert.equal(String((await User.findById(winner)).providerState.activeRequestId), job.id);
    assert.equal((await User.findById(other)).providerState.activeRequestId, null);
    assert.equal(await DispatchOffer.countDocuments({ outcome: "accepted" }), 1);
  });

  it("flag on: an urgent request gets the only provider over a nearer normal request", async (t) => {
    smartOn(t);
    const now = new Date();
    await makeProvider("P", "mechanic", at(0), now);
    await makeRequest("NORMAL", "mechanic", at(0.3), now, { priority: "normal", waitedSeconds: 100 });
    await makeRequest("URGENT", "mechanic", at(-7.5), now, { priority: "urgent", waitedSeconds: 0 });
    const result = await runDispatchBatch(now);
    assert.equal(nameOf((await requestNamed("URGENT")).dispatch.offeredProviderId), "P");
    assert.equal((await requestNamed("NORMAL")).dispatch.state, "searching");
    assert.deepEqual(result.unassignedRequestIds.map(nameOf), ["NORMAL"]);
    const offer = await DispatchOffer.findOne({}).lean();
    assert.ok(offer.assignmentCost <= 100, "offer cost is the real pair cost, not the U_batch-inflated objective");
    assert.ok(offer.costBreakdown.E > 90, "the urgent pair is the far one");
  });

  it("flag on with an invalid config falls back to the existing dispatcher and logs why", async (t) => {
    smartOn(t, { MATCHING_WEIGHT_E: "0.9" });
    const errors = [];
    t.mock.method(console, "error", (...args) => errors.push(args.join(" ")));
    const now = new Date();
    await makeProvider("A", "mechanic", at(0.5), now);
    await makeRequest("JOB", "mechanic", at(0), now);
    const result = await runDispatchBatch(now);
    assert.equal(result.algorithmVersion, undefined);
    assert.equal((await DispatchOffer.findOne({}).lean()).algorithmVersion, "batch-mincost-v1");
    assert.ok(errors.some((line) => /invalid config/.test(line) && /sum to 1/.test(line)));
  });
});
