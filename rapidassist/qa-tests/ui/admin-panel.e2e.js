#!/usr/bin/env node
/**
 * Admin panel E2E (Playwright + local Chrome). Needs the QA stack and the admin dev server:
 *   (cd admin-panel && npm run dev -- --port 5173)
 * Writes qa-tests/results/admin-ui-results.json and screenshots/admin-*.png
 */
const path = require("node:path");
const { Client, Recorder, stackState } = require("../lib/harness");
const { launch, watch, shot } = require("../lib/browser");

const ROOT = path.resolve(__dirname, "../..");
const { MongoClient, ObjectId } = require(path.join(ROOT, "server/node_modules/mongodb"));
const state = stackState();
const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:5173";
const R = new Recorder("ADMIN-UI");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function makePendingProvider(db, name, category) {
  const c = new Client(state.apiUrl, name);
  const phone = `0311${Date.now().toString().slice(-7)}`;
  const profile = category === "mechanic" ? { serviceCategory: category, workshopPhotoUrl: PNG, certificateUrl: PNG } : { serviceCategory: category, drivingLicenseUrl: PNG };
  const r = await c.post("/api/auth/register", { role: "mechanic", name, phone, password: "Str0ngPass!", mechanicProfile: profile }, { auth: "none" });
  c.token = r.body.token; c.user = r.body.user;
  // The selfie/CNIC upload goes to AWS S3 + Rekognition; seed the resulting "awaiting_review" state instead.
  await db.collection("users").updateOne({ _id: new ObjectId(c.user.id) }, { $set: { mechanicVerification: {
    submissionId: `qa-ui-${c.user.id}`, reviewState: "awaiting_review", consent: { version: "mechanic-face-verification-v2", grantedAt: new Date() }
  } } });
  await new Promise((r2) => setTimeout(r2, 5));
  return c;
}

async function main() {
  const mongo = await MongoClient.connect(state.mongoUri);
  const db = mongo.db();
  const approveMe = await makePendingProvider(db, `QA UI Approve ${Date.now() % 10000}`, "towing");
  const rejectMe = await makePendingProvider(db, `QA UI Reject ${Date.now() % 10000}`, "fuel_delivery");

  const api = new Client(state.apiUrl, "admin-api");
  const login = await api.post("/api/auth/admin/login", { email: state.admin.email, password: state.admin.password }, { auth: "none" });
  api.token = login.body.token;

  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const log = watch(page);

  await R.check("Admin UI", "Login page renders", `open ${ADMIN_URL}/login`, "Email + password form", async () => {
    await page.goto(`${ADMIN_URL}/login`, { waitUntil: "networkidle" });
    const ok = await page.locator("#admin-email").isVisible() && await page.locator("#admin-password").isVisible();
    return { pass: ok, actual: `form visible=${ok}, screenshot=${await shot(page, "admin-01-login")}` };
  });
  await R.check("Admin UI", "Login with wrong password shows an error", "submit wrong password", "error message, stays on /login", async () => {
    await page.fill("#admin-email", state.admin.email);
    await page.fill("#admin-password", "wrong-password-123");
    await page.click("button.login-submit");
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    const err = /invalid admin credentials/i.test(text);
    return { pass: err && page.url().includes("/login"), actual: `error shown=${err}, url=${page.url()}, screenshot=${await shot(page, "admin-02-login-error")}` };
  });
  await R.check("Admin UI", "Login with valid credentials", "submit correct admin email/password", "redirect to /dashboard", async () => {
    await page.fill("#admin-password", state.admin.password);
    await page.click("button.login-submit");
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    return { pass: true, actual: `url=${page.url()}` };
  });
  await R.check("Admin UI", "Dashboard loads stats from the API", "wait for 'Operations overview' and compare pending-provider count with GET /api/admin/dashboard", "stats rendered, numbers match API", async () => {
    await page.getByRole("heading", { name: "Operations overview" }).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    const apiStats = (await api.get("/api/admin/dashboard")).body.stats;
    const text = await page.locator("main, body").first().innerText();
    const hasPending = text.includes(`${apiStats.pendingProviders} provider reviews pending`);
    return { pass: hasPending && !/unavailable/i.test(text), actual: `banner shows "${apiStats.pendingProviders} provider reviews pending"=${hasPending}, completed=${apiStats.completedRequests}, screenshot=${await shot(page, "admin-03-dashboard")}` };
  });
  await R.check("Admin UI", "Provider verification page lists the pending provider", "navigate Provider verification, filter=pending", "new provider in list", async () => {
    await page.getByRole("link", { name: /Provider verification/i }).first().click();
    await page.waitForURL(/\/providers/);
    await page.getByRole("button", { name: new RegExp(approveMe.user.name) }).first().waitFor({ timeout: 15000 });
    return { pass: true, actual: `listed, screenshot=${await shot(page, "admin-04-providers-pending")}` };
  });
  await R.check("Admin UI", "Approve a pending provider from the UI", "select provider -> click Approve", "UI shows verified; GET /api/admin/providers?id= shows verified", async () => {
    await page.getByRole("button", { name: new RegExp(approveMe.user.name) }).first().click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const verified = await (async () => {
      for (let i = 0; i < 20; i++) {
        const r = await api.get(`/api/admin/providers?status=all&id=${approveMe.user.id}`);
        if (r.body?.providers?.[0]?.verificationStatus === "verified") return true;
        await page.waitForTimeout(500);
      }
      return false;
    })();
    const me = await approveMe.get("/api/auth/me");
    return { pass: verified && me.body.user.verificationStatus === "verified", actual: `API status=${me.body.user.verificationStatus}, screenshot=${await shot(page, "admin-05-provider-approved")}` };
  });
  await R.check("Admin UI", "Reject a provider with a reason from the UI", "select provider -> Reject -> enter reason in prompt", "API shows rejected with reviewNote", async () => {
    page.once("dialog", (d) => d.accept("Licence photo is unreadable"));
    await page.getByRole("button", { name: new RegExp(rejectMe.user.name) }).first().click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page.waitForTimeout(2000);
    const r = await api.get(`/api/admin/providers/${rejectMe.user.id}/verification`);
    return { pass: r.body?.verification?.verificationStatus === "rejected" && /unreadable/.test(r.body.verification.reviewNote || ""), actual: `status=${r.body?.verification?.verificationStatus}, note=${r.body?.verification?.reviewNote}` };
  });
  await R.check("Admin UI", "Verified filter shows the approved provider", "click 'verified' filter", "approved provider listed", async () => {
    await page.getByRole("button", { name: /^verified$/i }).click();
    await page.getByRole("button", { name: new RegExp(approveMe.user.name) }).first().waitFor({ timeout: 10000 });
    return { pass: true, actual: `listed, screenshot=${await shot(page, "admin-06-providers-verified")}` };
  });
  for (const [label, link, file, expectText] of [["Live jobs map", /Live jobs map/i, "admin-07-live-jobs", /live|jobs/i], ["Request heatmap", /Request heatmap/i, "admin-08-heatmap", /heatmap/i]]) {
    await R.check("Admin UI", `${label} page loads`, `navigate ${label}`, "page renders without API 5xx", async () => {
      await page.getByRole("link", { name: link }).first().click();
      await page.waitForTimeout(3000);
      const text = await page.locator("body").innerText();
      return { pass: expectText.test(text) && log.apiFailures.length === 0, actual: `rendered, api 5xx=${log.apiFailures.length}, screenshot=${await shot(page, file)}` };
    });
  }
  await R.check("Admin UI", "Logout returns to login and protects routes", "click Sign out / Logout, then open /dashboard", "redirect to /login", async () => {
    const btn = page.getByRole("button", { name: /sign out|log ?out/i });
    await btn.first().click();
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await page.goto(`${ADMIN_URL}/dashboard`, { waitUntil: "networkidle" });
    return { pass: page.url().includes("/login"), actual: `url after visiting /dashboard=${page.url()}` };
  });
  await R.check("Admin UI", "No uncaught JS errors on admin pages", "collect pageerror events", "0", async () =>
    ({ pass: log.pageErrors.length === 0, actual: log.pageErrors.length ? log.pageErrors.join(" | ") : `0 page errors; console errors=${log.consoleErrors.length}${log.consoleErrors.length ? ` (${log.consoleErrors.slice(0, 3).join(" | ")})` : ""}` }));

  await browser.close();
  await mongo.close();
  console.log("\nSUMMARY", JSON.stringify(R.write(path.join(__dirname, "..", "results", "admin-ui-results.json"), { console: log })));
}

main().catch((e) => { console.error(e); R.write(path.join(__dirname, "..", "results", "admin-ui-results.json"), { crashed: String(e.stack || e) }); process.exit(1); });
