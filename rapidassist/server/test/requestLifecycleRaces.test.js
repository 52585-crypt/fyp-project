// Regression tests for lost updates in the request lifecycle (isolated in-memory MongoDB + real HTTP app):
//  - extra-work request / approval racing a cancellation must never overwrite the cancellation;
//  - offer response time is recorded in one write, so no zero/partial value can be left behind.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { DispatchOffer } = require("../src/models/DispatchOffer");
const { Notification } = require("../src/models/Notification");
const { signAccessToken } = require("../src/utils/jwt");
const dispatch = require("../src/services/dispatch");

process.env.JWT_SECRET = "isolated-lifecycle-race-test-secret";
process.env.NODE_ENV = "test";
delete process.env.DISPATCH_TEST_BYPASS_RADIUS;
delete process.env.SMART_MATCHING_ENABLED;

const pickup = { lat: 31.52, lng: 74.35, addressText: "Pickup" };
let db, server, base, customer, mechanic, sequence = 0;

async function api(actor, path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: actor.id })}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

/** An assigned mechanic job already at `status` (inspection_started or extra_work_requested). */
async function assignedJob(status = "inspection_started") {
  const now = new Date();
  const job = await ServiceRequest.create({
    userId: customer._id, providerId: mechanic._id, assignmentActive: true, acceptedAt: now,
    category: "mechanic", mechanicDetails: { issueCategory: "engine" }, pickupLocation: pickup,
    dispatch: { ...dispatch.newDispatch("mechanic"), state: "assigned" },
    estimate: { currency: "PKR", lines: [{ label: "Inspection fee", amount: 900 }], total: 900 },
    status, statusTimeline: [{ status, at: now }]
  });
  if (status === "extra_work_requested") {
    await ServiceRequest.updateOne({ _id: job._id }, { $set: { "mechanicDetails.extraWork": {
      partName: "Radiator hose", partPrice: 1500, laborCharge: 500, description: "Replace hose",
      approvedByUser: false, status: "pending", requestedAt: now, decidedAt: null
    } } });
  }
  await User.updateOne({ _id: mechanic._id }, { $set: { "providerState.activeRequestId": job._id } });
  return job;
}

/**
 * Makes the next ServiceRequest.findById(job) return its document and *then* commit a customer cancellation
 * through the real API, i.e. the cancel lands between the handler's read and its write.
 */
function cancelAfterNextRead(t, job) {
  const original = ServiceRequest.findById;
  let armed = true;
  const cancel = { response: null };
  t.mock.method(ServiceRequest, "findById", async function readThenCancel(id, ...rest) {
    const doc = await original.call(this, id, ...rest);
    if (armed && String(id) === job.id) {
      armed = false;
      cancel.response = await api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" });
    }
    return doc;
  });
  return cancel;
}

describe("request lifecycle races (isolated real MongoDB)", { concurrency: false }, () => {
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_lifecycle_race_test" });
    await Promise.all([User.init(), ServiceRequest.init(), DispatchOffer.init()]);
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), ServiceRequest.deleteMany({}), DispatchOffer.deleteMany({}), Notification.deleteMany({})]);
    customer = await User.create({ name: "Customer", phone: `customer-${++sequence}`, passwordHash: "test-only", role: "user" });
    mechanic = await User.create({
      name: "Mechanic", phone: `mechanic-${++sequence}`, passwordHash: "test-only", role: "mechanic", verificationStatus: "verified",
      mechanicProfile: { serviceCategory: "mechanic" },
      providerState: { isOnline: true, currentLocation: { ...pickup, updatedAt: new Date() }, lastSeenAt: new Date() }
    });
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  it("extra-work request still works on its own", async () => {
    const job = await assignedJob();
    const result = await api(mechanic, `/api/requests/${job.id}/extra-work`, "PATCH", { partName: "Belt", partPrice: 800, laborCharge: 200, description: "Replace belt" });
    assert.equal(result.status, 200);
    const stored = await ServiceRequest.findById(job.id);
    assert.equal(stored.status, "extra_work_requested");
    assert.equal(stored.mechanicDetails.extraWork.status, "pending");
    assert.equal(stored.mechanicDetails.extraWork.partPrice, 800);
    assert.equal(stored.statusTimeline.at(-1).status, "extra_work_requested");
  });

  it("a cancel landing between extra-work's read and write is never overwritten", async (t) => {
    const job = await assignedJob();
    const cancel = cancelAfterNextRead(t, job);
    const extra = await api(mechanic, `/api/requests/${job.id}/extra-work`, "PATCH", { partName: "Belt", partPrice: 800, laborCharge: 200 });
    assert.equal(cancel.response.status, 200, "the cancellation committed");
    assert.equal(extra.status, 409, "the stale extra-work request is rejected");
    const stored = await ServiceRequest.findById(job.id);
    assert.equal(stored.status, "cancelled");
    assert.equal(stored.assignmentActive, false);
    assert.equal(stored.mechanicDetails.extraWork.status, "pending", "no extra-work data written onto the cancelled job");
    assert.equal(stored.mechanicDetails.extraWork.requestedAt, null);
    assert.equal(stored.statusTimeline.at(-1).status, "cancelled");
  });

  it("approval still works on its own (approve adds the line, reject returns to inspection)", async () => {
    const job = await assignedJob("extra_work_requested");
    const approved = await api(customer, `/api/requests/${job.id}/extra-work/approve`, "PATCH", { approved: true });
    assert.equal(approved.status, 200);
    let stored = await ServiceRequest.findById(job.id);
    assert.equal(stored.status, "work_started");
    assert.equal(stored.mechanicDetails.extraWork.status, "approved");
    assert.equal(stored.estimate.total, 2900);
    assert.deepEqual(stored.estimate.lines.at(-1).toObject(), { label: "Approved extra work", amount: 2000 });
    assert.equal((await api(customer, `/api/requests/${job.id}/extra-work/approve`, "PATCH", { approved: true })).status, 400, "cannot decide twice");

    await ServiceRequest.updateOne({ _id: job._id }, { $set: { assignmentActive: false } });
    const other = await assignedJob("extra_work_requested");
    const rejected = await api(customer, `/api/requests/${other.id}/extra-work/approve`, "PATCH", { approved: false });
    assert.equal(rejected.status, 200);
    stored = await ServiceRequest.findById(other.id);
    assert.equal(stored.status, "inspection_started");
    assert.equal(stored.mechanicDetails.extraWork.status, "rejected");
    assert.equal(stored.estimate.total, 900);
  });

  it("a cancel landing between approval's read and write is never overwritten", async (t) => {
    const job = await assignedJob("extra_work_requested");
    const cancel = cancelAfterNextRead(t, job);
    const approval = await api(customer, `/api/requests/${job.id}/extra-work/approve`, "PATCH", { approved: true });
    assert.equal(cancel.response.status, 200);
    assert.equal(approval.status, 409);
    const stored = await ServiceRequest.findById(job.id);
    assert.equal(stored.status, "cancelled");
    assert.equal(stored.estimate.total, 900, "no extra charge added to a cancelled job");
    assert.equal(stored.mechanicDetails.extraWork.status, "pending");
  });

  it("concurrent extra-work and cancel requests: a successful cancel always sticks (30 rounds)", async () => {
    for (let round = 0; round < 30; round += 1) {
      await ServiceRequest.deleteMany({});
      const job = await assignedJob();
      const [extra, cancel] = await Promise.all([
        api(mechanic, `/api/requests/${job.id}/extra-work`, "PATCH", { partName: "Belt", partPrice: 800, laborCharge: 200 }),
        api(customer, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })
      ]);
      const stored = await ServiceRequest.findById(job.id);
      if (cancel.status === 200) assert.equal(stored.status, "cancelled", `round ${round}: cancel overwritten (extra-work ${extra.status})`);
      else assert.equal(stored.status, "extra_work_requested", `round ${round}`);
      assert.ok([200, 409].includes(extra.status) || extra.status === 400, `round ${round}: extra-work ${extra.status}`);
    }
  });

  describe("offer response time", () => {
    async function offeredJob(secondsAgo) {
      const job = await ServiceRequest.create({
        userId: customer._id, category: "mechanic", pickupLocation: pickup, dispatch: dispatch.newDispatch("mechanic"),
        estimate: { currency: "PKR", total: 1000 }, status: "searching_provider"
      });
      await dispatch.runDispatchBatch(new Date());
      const offered = await ServiceRequest.findById(job.id);
      assert.equal(offered.dispatch.state, "offered");
      await DispatchOffer.collection.updateOne({ offerId: offered.dispatch.offerId }, { $set: { offeredAt: new Date(Date.now() - secondsAgo * 1000) } });
      return offered;
    }

    it("a decline records the response time in one write (a crash after it cannot leave 0)", async (t) => {
      const offered = await offeredJob(7);
      // Any second write would be a document save; make it fail like a crash between two writes.
      t.mock.method(DispatchOffer.prototype, "save", async () => { throw new Error("simulated crash before second write"); });
      await dispatch.declineOffer(offered.id, mechanic.id, offered.dispatch.offerId);
      const record = await DispatchOffer.findOne({ offerId: offered.dispatch.offerId }).lean();
      assert.equal(record.outcome, "declined");
      assert.ok(record.responseSeconds >= 6.9 && record.responseSeconds < 60, `responseSeconds ${record.responseSeconds}`);
      assert.ok(record.respondedAt instanceof Date);
      const performance = (await User.findById(mechanic.id)).providerPerformance;
      assert.equal(performance.responseSamples, 1);
      assert.ok(performance.averageResponseSeconds >= 6.9);
    });

    it("an expiry and an acceptance record their response time in the same single write", async (t) => {
      t.mock.method(DispatchOffer.prototype, "save", async () => { throw new Error("simulated crash before second write"); });
      const first = await offeredJob(3);
      await dispatch.runDispatchBatch(new Date(Date.now() + 21000));
      const expired = await DispatchOffer.findOne({ offerId: first.dispatch.offerId }).lean();
      assert.equal(expired.outcome, "expired");
      assert.ok(expired.responseSeconds >= 23.9, `expired responseSeconds ${expired.responseSeconds}`);

      await ServiceRequest.deleteMany({});
      await User.updateOne({ _id: mechanic._id }, { $set: { "providerState.currentLocation.updatedAt": new Date(), "providerState.currentLocation.capturedAt": null } });
      const second = await offeredJob(4);
      await dispatch.acceptOffer(second.id, mechanic.id, second.dispatch.offerId);
      const accepted = await DispatchOffer.findOne({ offerId: second.dispatch.offerId }).lean();
      assert.equal(accepted.outcome, "accepted");
      assert.ok(accepted.responseSeconds >= 3.9 && accepted.responseSeconds < 60, `accepted responseSeconds ${accepted.responseSeconds}`);
    });

    it("no resolved offer is ever left with a zero response time", async () => {
      const offered = await offeredJob(5);
      await dispatch.declineOffer(offered.id, mechanic.id, offered.dispatch.offerId);
      const zeroes = await DispatchOffer.countDocuments({ outcome: { $in: ["accepted", "declined", "expired"] }, responseSeconds: 0 });
      assert.equal(zeroes, 0);
    });
  });
});
