const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { DEMO_ACCOUNTS, credentialsText, demoUp } = require("../scripts/demoUp");

describe("demoUp (isolated real MongoDB)", () => {
  let db, server, base;
  before(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri(), { dbName: "rapidassist_demo_up_test" });
    await User.init();
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/auth`;
  });
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (db) await db.stop();
  });

  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("seeds the map providers and three accounts whose printed credentials sign in", async () => {
    const first = await demoUp();
    assert.equal(first.providers.total, 18);
    assert.deepEqual(first.accounts, ["customer", "provider", "admin"]);
    const [customer, provider, admin] = DEMO_ACCOUNTS;
    for (const account of [customer, provider]) {
      assert.ok(credentialsText().includes(account.phone) && credentialsText().includes(account.password));
      const res = await post("/login", { phone: account.phone, password: account.password });
      assert.equal(res.status, 200, account.key);
    }
    assert.equal((await post("/admin/login", { email: admin.email, password: admin.password })).status, 200);
    assert.equal((await post("/login", { phone: customer.phone, password: "wrong" })).status, 401);

    const live = await User.findOne({ phone: provider.phone }).lean();
    assert.equal(live.verificationStatus, "verified");
    assert.equal(live.mechanicProfile.serviceCategory, "mechanic");
    assert.notEqual(live.providerState?.isDemo, true, "the demo provider must be dispatchable, unlike the map-only ones");
  });

  it("is idempotent: a second run creates nothing new and resets passwords", async () => {
    await User.updateOne({ phone: DEMO_ACCOUNTS[0].phone }, { $set: { passwordHash: await User.hashPassword("changed-by-someone") } });
    const second = await demoUp();
    assert.deepEqual(second.accounts, []);
    assert.equal(second.providers.created, 0);
    assert.equal(await User.countDocuments({ phone: { $in: DEMO_ACCOUNTS.map((a) => a.phone).filter(Boolean) } }), 2);
    assert.equal((await post("/login", { phone: DEMO_ACCOUNTS[0].phone, password: DEMO_ACCOUNTS[0].password })).status, 200);
  });

  it("refuses remote databases even with --allow-remote, and --production-env", () => {
    const script = path.join(__dirname, "../scripts/demoUp.js");
    const remote = spawnSync(process.execPath, [script, "--uri=mongodb+srv://user:pw@cluster0.example.mongodb.net/rapidassist", "--allow-remote"], { encoding: "utf8", timeout: 30000 });
    assert.equal(remote.status, 1);
    assert.match(remote.stderr, /Refusing to use a remote database/);
    assert.ok(!remote.stderr.includes("pw@"), "credentials are not echoed");
    const production = spawnSync(process.execPath, [script, "--production-env"], { encoding: "utf8", timeout: 30000 });
    assert.equal(production.status, 1);
    assert.match(production.stderr, /--production-env is not allowed/);
  });
});
