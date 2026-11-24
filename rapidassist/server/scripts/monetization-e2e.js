// End-to-end check of commission, wallet, blocking and dues payments.
//
// Usage (needs a running MongoDB; uses a separate throwaway database):
//   MONGODB_URI=mongodb://127.0.0.1:27017 node scripts/monetization-e2e.js
//
// The script creates the database "rapidassist_monetization_test", runs the
// checks, and drops that database at the end. It never touches other databases.
require("dotenv").config();
const assert = require("assert");
const mongoose = require("mongoose");
process.env.JWT_SECRET = process.env.JWT_SECRET || "monetization-test-secret";
process.env.NODE_ENV = "test";
const { createApp } = require("../src/app");

const TEST_DB = "rapidassist_monetization_test";

let base;
async function call(method, url, body, token) {
  const r = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  return { status: r.status, ...j };
}
const img = "data:image/png;base64,AAAA";
const loc = { lat: 31.52, lng: 74.35, addressText: "Lahore" };

async function provider(phone, cat) {
  const r = await call("POST", "/api/auth/register", { role: "mechanic", name: "P " + cat, phone, password: "secret1",
    mechanicProfile: { serviceCategory: cat, selfieUrl: img, idCardFrontUrl: img, idCardBackUrl: img, workshopPhotoUrl: img, certificateUrl: img, drivingLicenseUrl: img, liveLocation: loc } });
  assert.equal(r.status, 201, JSON.stringify(r));
  await call("PATCH", `/api/admin/providers/${r.user.id}/verification`, { status: "verified" });
  await call("PATCH", "/api/requests/provider/availability", { isOnline: true, location: loc }, r.token);
  return r;
}
async function runJob(userTok, provTok, body, steps, extra) {
  const c = await call("POST", "/api/requests", body, userTok); assert.equal(c.status, 201, JSON.stringify(c));
  const id = c.request.id;
  const a = await call("PATCH", `/api/requests/${id}/accept`, {}, provTok);
  if (a.status !== 200) return { created: c.request, acceptErr: a };
  if (extra) {
    await call("PATCH", `/api/requests/${id}/extra-work`, extra.work, provTok);
    await call("PATCH", `/api/requests/${id}/extra-work/approve`, { approved: extra.approved }, userTok);
  }
  for (const s of steps) { const r = await call("PATCH", `/api/requests/${id}/status`, { status: s }, provTok); assert.equal(r.status, 200, s + JSON.stringify(r)); }
  const done = await call("PATCH", `/api/requests/${id}/status`, { status: "completed" }, userTok);
  assert.equal(done.status, 200, JSON.stringify(done));
  return { created: c.request, done: done.request, id };
}

(async () => {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI to a MongoDB server");
  await mongoose.connect(process.env.MONGODB_URI, { dbName: TEST_DB });
  if (mongoose.connection.name !== TEST_DB) throw new Error("Refusing to run outside the test database");
  await mongoose.connection.dropDatabase();
  const srv = createApp().listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const user = await call("POST", "/api/auth/register", { role: "user", name: "Cust", phone: "03000000001", password: "secret1" });
    const mech = await provider("03000000002", "mechanic");
    const fuel = await provider("03000000003", "fuel_delivery");

    // 1. Mechanic with approved extra work 2000
    const j1 = await runJob(user.token, mech.token, { category: "mechanic", pickupLocation: loc, mechanicDetails: { issueCategory: "engine" } },
      ["provider_on_way", "provider_arrived", "service_finished"], { work: { partName: "Belt", partPrice: 1500, laborCharge: 500 }, approved: true });
    console.log("created estimate", j1.created.estimate.total, j1.created.settlement);
    console.log("mechanic done", j1.done.estimate.total, j1.done.settlement);
    assert.equal(j1.created.estimate.total, 1350);
    assert.equal(j1.done.estimate.total, 3350);
    assert.equal(j1.done.settlement.commission, Math.round(3250 * 0.15)); // 488
    assert.equal(j1.done.settlement.platformFee, 100);
    assert.equal(j1.done.settlement.providerEarning, 3350 - 100 - 488);
    assert.ok(j1.done.settlement.settledAt);

    // completing again must not double charge
    const again = await call("PATCH", `/api/requests/${j1.id}/status`, { status: "completed" }, user.token);
    let w = await call("GET", "/api/wallet/me", null, mech.token);
    console.log("mech wallet", w.wallet, w.transactions.length);
    assert.equal(w.wallet.balance, -588);
    assert.equal(w.transactions.filter(t => t.type === "commission_debit").length, 1);

    // 2. Mechanic with rejected extra work
    const j2 = await runJob(user.token, mech.token, { category: "mechanic", pickupLocation: loc, mechanicDetails: { issueCategory: "battery" } },
      ["work_started", "service_finished"], { work: { partName: "Battery", partPrice: 9000 }, approved: false });
    assert.equal(j2.done.estimate.total, 1350);
    assert.equal(j2.done.settlement.commission, Math.round(1250 * 0.15));

    // 3. Fuel: commission only on delivery fee
    const j3 = await runJob(user.token, fuel.token, { category: "fuel_delivery", pickupLocation: loc, fuelDetails: { fuelType: "petrol", liters: 5 } },
      ["fuel_delivered", "service_finished"]);
    console.log("fuel", j3.done.estimate, j3.done.settlement);
    assert.equal(j3.done.settlement.commission, 90);
    assert.equal(j3.done.settlement.platformFee, 150);
    assert.equal(j3.done.settlement.providerEarning, 1375 + 450 - 90);

    // 4. Earnings endpoint
    const e = await call("GET", "/api/requests/provider/earnings", null, mech.token);
    console.log("earnings", { today: e.earnings.today, total: e.earnings.total, platformShare: e.earnings.platformShare, dues: e.earnings.wallet.dues });

    // 5. Lower debt limit -> mechanic blocked on next completion
    const s = await call("PATCH", "/api/admin/settings/monetization", { providerDebtLimit: 500 });
    assert.equal(s.settings.providerDebtLimit, 500);
    await runJob(user.token, mech.token, { category: "mechanic", pickupLocation: loc, mechanicDetails: { issueCategory: "tyre" } }, ["service_finished"]);
    w = await call("GET", "/api/wallet/me", null, mech.token);
    console.log("after 3 jobs", w.wallet.balance, "blocked", w.wallet.isBlocked);
    assert.equal(w.wallet.isBlocked, true);
    const open = await call("GET", "/api/requests/open", null, mech.token);
    assert.equal(open.blocked, true);
    const blockedJob = await runJob(user.token, mech.token, { category: "mechanic", pickupLocation: loc, mechanicDetails: { issueCategory: "brake" } }, []);
    console.log("blocked accept:", blockedJob.acceptErr.status, blockedJob.acceptErr.message);
    assert.equal(blockedJob.acceptErr.status, 403);
    const near = await call("GET", "/api/requests/nearby-providers?category=mechanic&lat=31.52&lng=74.35", null, user.token);
    assert.equal(near.providers.length, 0);
    await call("PATCH", `/api/requests/${blockedJob.created.id}/status`, { status: "cancelled" }, user.token);

    // 6. Top-up: validation, then approve -> unblocked
    let t = await call("POST", "/api/wallet/topup", { amount: 50, method: "jazzcash", reference: "TID123" }, mech.token);
    assert.equal(t.status, 400);
    t = await call("POST", "/api/wallet/topup", { amount: w.wallet.dues, method: "jazzcash", reference: "TID12345", proofImage: img }, mech.token);
    assert.equal(t.status, 201, JSON.stringify(t));
    const pend = await call("GET", "/api/admin/topups?status=pending");
    assert.equal(pend.topups.length, 1); assert.ok(pend.topups[0].proofImage);
    const ap = await call("PATCH", `/api/admin/topups/${t.transaction.id}`, { decision: "approve" });
    assert.equal(ap.topup.status, "approved");
    const ap2 = await call("PATCH", `/api/admin/topups/${t.transaction.id}`, { decision: "approve" });
    assert.equal(ap2.status, 404); // no double credit
    w = await call("GET", "/api/wallet/me", null, mech.token);
    console.log("after topup", w.wallet.balance, "blocked", w.wallet.isBlocked);
    assert.equal(w.wallet.balance, 0); assert.equal(w.wallet.isBlocked, false);

    // 7. Admin views
    const rev = await call("GET", "/api/admin/revenue");
    console.log("revenue allTime", rev.totals.allTime, "byCategory mech", rev.byCategory.mechanic);
    const wallets = await call("GET", "/api/admin/wallets");
    console.log("wallets", wallets.wallets.map(x => [x.provider.name, x.balance, x.isBlocked]));
    const dash = await call("GET", "/api/admin/dashboard");
    console.log("dashboard", { platformRevenue: dash.stats.platformRevenue, today: dash.stats.todayPlatformRevenue, dues: dash.stats.outstandingDues, pendingTopups: dash.stats.pendingTopups, blocked: dash.stats.blockedProviders });
    assert.equal(rev.totals.allTime.platformRevenue, dash.stats.platformRevenue);
    const bad = await call("PATCH", "/api/admin/settings/monetization", { commissionRates: { mechanic: 2 } });
    assert.equal(bad.status, 400);
    console.log("\nALL CHECKS PASSED");
  } finally {
    srv.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
