const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { applyMissing, planIndexes, requiredIndexes } = require("../scripts/checkIndexes");
const { describeUri } = require("../scripts/lib/scriptDatabase");

process.env.NODE_ENV = "test";

describe("index check script (isolated real MongoDB)", () => {
  let db;
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_index_check_test", autoIndex: false });
  });
  after(async () => {
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  it("requires the indexes the map, heatmap and dispatch queries use", () => {
    const keys = requiredIndexes().map((r) => `${r.model.modelName} ${JSON.stringify(r.key)}`);
    for (const expected of [
      'User {"providerState.locationPoint":"2dsphere"}',
      'User {"providerState.isOnline":1,"providerState.currentLocation.updatedAt":-1}',
      'ServiceRequest {"createdAt":-1,"_id":-1}',
      'ServiceRequest {"dispatch.enabled":1,"status":1,"dispatch.nextAttemptAt":1}',
      'DispatchOffer {"providerId":1}'
    ]) assert.ok(keys.includes(expected), expected);
  });

  it("reports missing indexes without changing anything, creates only those with apply, and never drops extras", async () => {
    const before = await planIndexes();
    assert.ok(before.missing.length >= requiredIndexes().length - 1, "empty database: (nearly) everything is missing");
    assert.equal((await planIndexes()).missing.length, before.missing.length, "a dry run changes nothing");

    await applyMissing(before);
    const users = mongoose.model("User").collection;
    await users.dropIndex("online_providers_by_fix_time");
    await users.createIndex({ name: 1 }, { name: "hand_made" });

    const plan = await planIndexes();
    assert.deepEqual(plan.missing.map((m) => m.options.name), ["online_providers_by_fix_time"]);
    assert.deepEqual(plan.extra.map((e) => e.options.name), ["hand_made"]);
    assert.equal(plan.differing.length, 0);

    await applyMissing(plan);
    const after = await planIndexes();
    assert.equal(after.missing.length, 0);
    assert.ok((await users.indexes()).some((i) => i.name === "hand_made"), "extra index left alone");
    const pending = (await mongoose.model("DispatchOffer").collection.indexes()).find((i) => i.name === "one_pending_offer_per_provider");
    assert.deepEqual(pending.partialFilterExpression, { outcome: "offered" });
  });

  it("refuses remote databases unless explicitly allowed (shared script guard)", () => {
    assert.equal(describeUri("mongodb://127.0.0.1:27018/rapidassist_dev").remote, false);
    assert.equal(describeUri("mongodb+srv://user:pw@cluster0.example.mongodb.net/rapidassist").remote, true);
  });
});
