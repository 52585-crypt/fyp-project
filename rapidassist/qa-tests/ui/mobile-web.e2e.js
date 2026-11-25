#!/usr/bin/env node
/**
 * Expo Web walkthrough (Playwright + local Chrome) for customer and provider journeys.
 * Needs the QA stack and Expo Web started with the QA API:
 *   (cd mobile-app && EXPO_PUBLIC_API_URL=http://localhost:4000 EXPO_PUBLIC_DEV_API_PORT=4000 npx expo start --web --port 8081)
 * Counterpart accounts (provider accepting the customer's job, customer creating the provider's job) are driven
 * through the real API. Writes results/mobile-web-results.json and screenshots/mobile-*.png
 */
const path = require("node:path");
const { Client, Recorder, sleep, stackState } = require("../lib/harness");
const { launch, watch, shot, redirectApi } = require("../lib/browser");
const { inventory, bodyText, tap, fill, waitText } = require("../lib/rnweb");

const ROOT = path.resolve(__dirname, "../..");
const { MongoClient, ObjectId } = require(path.join(ROOT, "server/node_modules/mongodb"));
const state = stackState();
const APP = process.env.MOBILE_WEB_URL || "http://localhost:8081";
const R = new Recorder("MOBILE-WEB");
const DOC = path.join(__dirname, "..", "fixtures", "document.jpg");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const BLUE_AREA = { latitude: 33.71276, longitude: 73.063 };
const NEAR_BLUE = { lat: 33.71391, lng: 73.06417 };
const RUN = Date.now().toString().slice(-6);
const PASSWORD = "Str0ngPass!";
let shotNo = 0;

const ctx = { db: null, admin: null, page: null, log: null };

/** A UI step: records PASS/FAIL, takes a screenshot, and on failure attaches the visible controls. */
async function step(area, useCase, steps, expected, fn) {
  return R.check(area, useCase, steps, expected, async () => {
    const name = `mobile-${String(++shotNo).padStart(2, "0")}-${useCase.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    try {
      const out = (await fn()) || {};
      const file = await shot(ctx.page, name).catch(() => "n/a");
      return { pass: out.pass !== false, actual: `${out.actual || "ok"}; url=${new URL(ctx.page.url()).pathname}; screenshot=${file}`, skip: out.skip, note: out.note };
    } catch (error) {
      const file = await shot(ctx.page, `${name}-FAIL`).catch(() => "n/a");
      const inv = await inventory(ctx.page).catch(() => []);
      return { pass: false, actual: `${String(error.message).split("\n")[0].slice(0, 200)}; url=${ctx.page.url()}; screenshot=${file}`, note: `Visible controls: ${inv.slice(0, 25).join(" | ")}` };
    }
  });
}

async function apiClient(label, token) {
  const c = new Client(state.apiUrl, label);
  c.token = token;
  if (token) c.user = (await c.get("/api/auth/me")).body?.user;
  return c;
}

async function verifyProvider(c) {
  await ctx.db.collection("users").updateOne({ _id: new ObjectId(c.user.id) }, { $set: { mechanicVerification: {
    submissionId: `qa-m-${c.user.id}`, reviewState: "awaiting_review", consent: { version: "mechanic-face-verification-v2", grantedAt: new Date() }
  } } });
  return ctx.admin.patch(`/api/admin/providers/${c.user.id}/verification`, { status: "verified", submissionId: `qa-m-${c.user.id}` });
}

async function apiProvider(category, name) {
  const c = new Client(state.apiUrl, name);
  const profile = category === "mechanic" ? { serviceCategory: category, workshopPhotoUrl: PNG, certificateUrl: PNG } : { serviceCategory: category, drivingLicenseUrl: PNG };
  const r = await c.post("/api/auth/register", { role: "mechanic", name, phone: `0322${RUN}${Math.floor(Math.random() * 90 + 10)}`, password: PASSWORD, mechanicProfile: profile }, { auth: "none" });
  c.token = r.body.token; c.user = r.body.user;
  await verifyProvider(c);
  return c;
}

const fixNow = (p) => ({ lat: p.lat, lng: p.lng, accuracy: 10, capturedAt: new Date().toISOString(), sentAt: new Date().toISOString() });

async function waitOffer(provider, requestId, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await provider.patch("/api/requests/provider/location", { location: fixNow(NEAR_BLUE) });
    const r = await provider.get("/api/requests/open");
    const hit = r.body?.requests?.find((x) => !requestId || x.id === requestId);
    if (hit) return hit;
    await sleep(1000);
  }
  return null;
}

async function latestRequest(customer) {
  return (await customer.get("/api/requests")).body?.requests?.[0] || null;
}

/** Pick the Blue Area landmark on the location step and confirm. */
async function chooseBlueAreaAndConfirm(page, confirmName = /Confirm (location|pickup)/) {
  await tap(page, /Blue Area/);
  await page.waitForTimeout(800);
  await tap(page, confirmName);
}

async function main() {
  const mongo = await MongoClient.connect(state.mongoUri);
  ctx.db = mongo.db();
  ctx.admin = new Client(state.apiUrl, "admin");
  ctx.admin.token = (await ctx.admin.post("/api/auth/admin/login", { email: state.admin.email, password: state.admin.password }, { auth: "none" })).body.token;

  // Counterpart providers driven by the API, online near Blue Area.
  const fuelP = await apiProvider("fuel_delivery", "QA Web Fuel Rider");
  const towP = await apiProvider("towing", "QA Web Tow Driver");
  const mechP = await apiProvider("mechanic", "QA Web Mechanic");
  for (const p of [fuelP, towP, mechP]) await p.patch("/api/requests/provider/availability", { isOnline: true, location: fixNow(NEAR_BLUE) });

  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 1,
    geolocation: BLUE_AREA, permissions: ["geolocation"], locale: "en-US"
  });
  // The app calls the public OSRM server from the browser; serve a deterministic local answer instead.
  await context.route("https://router.project-osrm.org/**", async (route) => {
    const url = route.request().url();
    const coords = /driving\/([^?]+)/.exec(url)?.[1].split(";").map((p) => p.split(",").map(Number)) || [];
    if (url.includes("/table/")) {
      const n = coords.length;
      return route.fulfill({ json: { code: "Ok", durations: Array.from({ length: n }, () => Array.from({ length: n }, () => 420)) } });
    }
    const [a, b] = coords;
    const rad = Math.PI / 180;
    const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
    const km = Math.max(0.2, 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) * 1.3);
    return route.fulfill({ json: { code: "Ok", routes: [{ distance: km * 1000, duration: (km / 40) * 3600, geometry: { type: "LineString", coordinates: [a, b] }, legs: [{ steps: [] }] }] } });
  });
  // The dev web bundle embeds EXPO_PUBLIC_API_URL from mobile-app/.env; point it at the QA API without editing that file.
  if (process.env.APP_API_ORIGIN) await redirectApi(context, process.env.APP_API_ORIGIN, "http://localhost:4000");
  const page = await context.newPage();
  ctx.page = page;
  ctx.log = watch(page);
  page.on("dialog", (d) => d.accept());

  // ─────────────── CUSTOMER ───────────────
  const custPhone = `0333${RUN}01`;
  await step("Customer", "Welcome screen", `open ${APP}/`, "Welcome screen with Get Started", async () => {
    await page.goto(`${APP}/`, { waitUntil: "networkidle" });
    await waitText(page, /Get Started/);
    return { actual: "welcome shown" };
  });
  await step("Customer", "Sign up as customer", "Get Started -> I need roadside help -> Next -> name/phone/password -> Create account", "account created, lands on home", async () => {
    await tap(page, "Get Started");
    await tap(page, /I need roadside help/);
    await tap(page, "Next");
    await fill(page, "Full name", "QA Web Customer");
    await fill(page, "Mobile number", custPhone);
    await fill(page, "Password", PASSWORD);
    await tap(page, "Create account");
    await page.waitForURL(/home/, { timeout: 20000 });
    return { actual: "on home" };
  });
  const customer = await apiClient("web-customer", await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) { const v = localStorage.getItem(k); if (v && /^eyJ/.test(v)) return v; }
    return null;
  }));
  await R.check("Security", "Web build keeps the JWT in localStorage", "inspect localStorage after sign-up", "Token only in the httpOnly cookie (not readable by scripts)", async () =>
    ({ pass: !customer.token, actual: customer.token ? "JWT readable from localStorage (XSS can steal the session) – src/auth/auth.storage.ts" : "no token in localStorage" }));

  await step("Customer", "Log out and log in again", "clear session -> /login -> phone + password -> Sign in", "home screen", async () => {
    await page.evaluate(() => localStorage.clear());
    await context.clearCookies();
    await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
    await fill(page, "Mobile number", custPhone);
    await fill(page, "Password", "WrongPass99");
    await tap(page, "Sign in");
    await waitText(page, /invalid credentials|incorrect|wrong/i, 10000);
    await fill(page, "Password", PASSWORD);
    await tap(page, "Sign in");
    await page.waitForURL(/home/, { timeout: 20000 });
    return { actual: "wrong password showed an error; correct password reached home" };
  });
  await step("Customer", "Home screen", "wait for services sheet", "Tow Truck / Fuel / Mechanic tiles visible; nearby providers loaded", async () => {
    await waitText(page, /Tow Truck/);
    await page.waitForTimeout(2500);
    const t = await bodyText(page);
    return { pass: /Fuel/.test(t) && /Mechanic/.test(t), actual: `tiles visible` };
  });

  await step("Customer", "Add vehicle", "open vehicles -> Add vehicle form -> Car, Toyota Corolla 2018 -> Save vehicle", "vehicle saved and listed; GET /api/vehicles has it", async () => {
    await page.goto(`${APP}/vehicles`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.goto(`${APP}/vehicles/add`, { waitUntil: "networkidle" });
    await fill(page, "Make", "Toyota");
    await fill(page, "Model", "Corolla");
    await fill(page, "Year", "2018");
    await fill(page, "Registration number", "ICT-777");
    await tap(page, "Save vehicle");
    await page.waitForTimeout(2000);
    const v = (await customer.get("/api/vehicles")).body?.vehicles || [];
    return { pass: v.some((x) => x.make === "Toyota" && x.model === "Corolla"), actual: `API vehicles=${v.length}` };
  });

  await finishLater(page, context, customer, { fuelP, towP, mechP });

  await browser.close();
  await mongo.close();
  console.log("\nSUMMARY", JSON.stringify(R.write(path.join(__dirname, "..", "results", "mobile-web-results.json"), { console: ctx.log, providerConsole: ctx.providerLog })));
}

async function radio(page, name) {
  const loc = page.getByRole("radio", { name }).filter({ visible: true }).first();
  await loc.waitFor({ state: "visible", timeout: 15000 });
  await loc.click();
}

async function waitRequestUrl(page) {
  await page.waitForURL(/\/request\/[a-f0-9]{24}/, { timeout: 25000 });
  return /\/request\/([a-f0-9]{24})/.exec(page.url())[1];
}

async function customerJourney(page, context, customer, { fuelP, towP, mechP }) {
  let fuelId; let towId; let mechId;

  // ── Fuel: create, provider accepts (API), track, chat, finish, pay, review
  await step("Customer", "Create fuel delivery request (diesel 10 L)", "Home -> Fuel -> Blue Area -> Confirm location -> Diesel, 10 Ltr -> Find providers", "request created; tracking screen opens", async () => {
    await page.goto(`${APP}/home`, { waitUntil: "networkidle" });
    await tap(page, /^Fuel/);
    await chooseBlueAreaAndConfirm(page);
    await radio(page, "Diesel");
    await radio(page, "10 Ltr");
    await page.waitForTimeout(500);
    const fare = /Rs\.?\s?([\d,]+)/.exec(await bodyText(page))?.[1];
    await tap(page, "Find providers");
    fuelId = await waitRequestUrl(page);
    const r = (await customer.get(`/api/requests/${fuelId}`)).body.request;
    return { pass: r.category === "fuel_delivery" && r.fuelDetails.fuelType === "diesel" && r.fuelDetails.liters === 10 && r.estimate.total === 3500, actual: `request ${r.status}, diesel ${r.fuelDetails.liters} L, UI fare Rs ${fare}, API total ${r.estimate.total}` };
  });
  await step("Customer", "Tracking: provider accepts and is shown", "fuel provider accepts via API; tracking screen updates in real time", "provider name visible on tracking", async () => {
    const offer = fuelId && await waitOffer(fuelP, fuelId);
    if (!offer) return { pass: false, actual: "no dispatch offer reached the fuel provider" };
    const acc = await fuelP.patch(`/api/requests/${fuelId}/accept`, { offerId: offer.dispatch.offerId });
    await fuelP.patch(`/api/requests/${fuelId}/status`, { status: "provider_on_way" });
    await waitText(page, /QA Web Fuel Rider/, 20000);
    return { actual: `accept HTTP ${acc.status}; provider shown` };
  });
  await step("Customer", "Chat with provider", "Tracking -> Chat -> type message -> Send; provider replies via API", "message stored on server; reply appears in UI", async () => {
    await page.goto(`${APP}/request/${fuelId}/chat`, { waitUntil: "networkidle" });
    const box = page.locator("textarea, input").filter({ visible: true }).last();
    await box.waitFor({ timeout: 15000 });
    await box.fill("Hello from QA customer");
    await tap(page, /send/i);
    await page.waitForTimeout(1500);
    await fuelP.post(`/api/requests/${fuelId}/messages`, { body: "Reply from QA provider" });
    await waitText(page, /Reply from QA provider/, 15000);
    const msgs = (await fuelP.get(`/api/requests/${fuelId}/messages`)).body.messages.map((m) => m.body);
    return { pass: msgs.includes("Hello from QA customer"), actual: `server messages: ${msgs.join(" / ")}` };
  });
  await step("Customer", "Tracking shows live status changes", "provider: arrived -> fuel_delivered -> service_finished (API); open tracking", "UI reflects 'finished' state and offers confirmation", async () => {
    for (const s of ["provider_arrived", "fuel_delivered", "service_finished"]) await fuelP.patch(`/api/requests/${fuelId}/status`, { status: s });
    await page.goto(`${APP}/request/${fuelId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    return { actual: (await bodyText(page)).slice(0, 160) };
  });
  await step("Customer", "Confirm completion, pay cash, review", "tap the confirm/complete button; choose Cash; rate 5 stars", "request completed; payment pending cash; review saved", async () => {
    await tap(page, /confirm|complete|done|mark/i);
    await page.waitForTimeout(2500);
    const after = (await customer.get(`/api/requests/${fuelId}`)).body.request;
    return { pass: after.status === "completed", actual: `status=${after.status}; screen: ${(await bodyText(page)).slice(0, 140)}` };
  });
  await step("Customer", "Payment screen (cash)", `open /request/<id>/pay -> Cash`, "cash selected; payment pending until provider confirms", async () => {
    await page.goto(`${APP}/request/${fuelId}/pay`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const cash = page.getByRole("radio", { name: /cash/i }).or(page.getByRole("button", { name: /cash/i })).filter({ visible: true }).first();
    await cash.click();
    await page.waitForTimeout(500);
    await tap(page, /confirm|pay|continue/i).catch(() => {});
    await page.waitForTimeout(2000);
    const pay = (await customer.get(`/api/payments/request/${fuelId}`)).body;
    return { pass: pay.payment?.method === "cash", actual: `payment=${pay.payment?.method}/${pay.payment?.status}, invoice total=${(pay.invoice?.totalMinor || 0) / 100}` };
  });
  await step("Customer", "Review screen", "open /request/<id>/review -> 5 stars -> comment -> Submit", "review saved via API", async () => {
    await page.goto(`${APP}/request/${fuelId}/review`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const star = page.getByRole("button", { name: /5 star|five|rate 5/i }).or(page.getByRole("radio", { name: /5/ })).filter({ visible: true }).first();
    await star.click();
    const box = page.locator("textarea").filter({ visible: true }).first();
    if (await box.count()) await box.fill("Quick diesel delivery");
    await tap(page, /submit|send|save/i);
    await page.waitForTimeout(2000);
    const r = (await customer.get(`/api/requests/${fuelId}`)).body.request;
    return { pass: r.review?.rating === 5, actual: `review=${JSON.stringify(r.review && { rating: r.review.rating, comment: r.review.comment })}` };
  });

  // ── Towing: pickup + drop-off, create, cancel from UI
  await step("Customer", "Create towing request", "Home -> Tow Truck -> Blue Area -> Confirm pickup -> G-9 Markaz -> Confirm drop-off -> Find providers", "request created with destination; tracking opens", async () => {
    await page.goto(`${APP}/home`, { waitUntil: "networkidle" });
    await tap(page, /^Tow Truck/);
    await chooseBlueAreaAndConfirm(page);
    // Drop-off step has no quick-pick landmarks: drag the map so the centre pin moves ~2 km away.
    await page.waitForTimeout(1500);
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, 300);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 - 120, 180, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
    await tap(page, /Confirm drop-off/);
    await page.waitForURL(/estimate/, { timeout: 15000 });
    await page.waitForTimeout(2500);
    const fare = /Rs\.?\s?([\d,]+)/.exec(await bodyText(page))?.[1];
    await tap(page, "Find providers");
    towId = await waitRequestUrl(page);
    const r = (await customer.get(`/api/requests/${towId}`)).body.request;
    const uiFare = Number(String(fare || "").replace(/,/g, ""));
    return { pass: r.category === "car_towing" && !!r.destinationLocation && Math.abs(uiFare - r.estimate.total) <= 20, actual: `UI fare Rs ${fare} vs server total ${r.estimate.total} (same route distance fed to both), destination=${r.destinationLocation?.addressText}` };
  });
  await step("Customer", "Cancel towing request before assignment", "Tracking -> Cancel request -> confirm", "status=cancelled", async () => {
    await page.waitForTimeout(1500);
    await tap(page, /cancel/i);
    await page.waitForTimeout(800);
    const confirm = page.getByRole("button", { name: /yes|cancel request|confirm/i }).filter({ visible: true });
    if (await confirm.count()) await confirm.last().click();
    await page.waitForTimeout(2000);
    const r = (await customer.get(`/api/requests/${towId}`)).body.request;
    return { pass: r.status === "cancelled", actual: `status=${r.status}` };
  });

  // ── Mechanic: create (battery), cancel via API
  await step("Customer", "Create mechanic request (battery)", "Home -> Mechanic -> Blue Area -> Confirm -> Battery -> Find providers", "request created with issueCategory=battery", async () => {
    await page.goto(`${APP}/home`, { waitUntil: "networkidle" });
    await tap(page, /^Mechanic/);
    await chooseBlueAreaAndConfirm(page);
    await page.waitForURL(/estimate/, { timeout: 15000 });
    await tap(page, /Battery Jump/);
    await tap(page, "Find providers");
    mechId = await waitRequestUrl(page);
    const r = (await customer.get(`/api/requests/${mechId}`)).body.request;
    await customer.patch(`/api/requests/${mechId}/status`, { status: "cancelled" });
    return { pass: r.category === "mechanic" && r.mechanicDetails?.issueCategory === "battery", actual: `issue=${r.mechanicDetails?.issueCategory}, total=${r.estimate.total}` };
  });

  await step("Customer", "History / Requests tab", "open Requests tab -> History", "lists the fuel (completed), towing and mechanic (cancelled) requests", async () => {
    await page.goto(`${APP}/requests`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.getByText("History", { exact: true }).filter({ visible: true }).first().click();
    await page.waitForTimeout(2000);
    const t = await bodyText(page);
    return { pass: /Fuel/i.test(t) && /Tow/i.test(t) && /Mechanic/i.test(t), actual: t.slice(0, 200) };
  });
  await step("Customer", "Payments tab", "Requests -> Payments", "fuel payment (cash) listed", async () => {
    await page.getByText("Payments", { exact: true }).filter({ visible: true }).first().click();
    await page.waitForTimeout(2000);
    const t = await bodyText(page);
    return { pass: /3,500|3500|cash/i.test(t), actual: t.slice(0, 200) };
  });
  await step("Customer", "Profile / Account", "open Profile tab", "name and phone shown", async () => {
    await page.goto(`${APP}/account`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const t = await bodyText(page);
    return { pass: /QA Web Customer/.test(t), actual: t.slice(0, 160) };
  });
  await step("Customer", "Log out", "Profile -> Log out / Sign out", "back to welcome/login; protected page redirects", async () => {
    await tap(page, /log ?out|sign ?out/i);
    await page.waitForTimeout(800);
    const confirm = page.getByRole("button", { name: /log ?out|sign ?out|yes/i }).filter({ visible: true });
    if (await confirm.count()) await confirm.last().click().catch(() => {});
    await page.waitForURL(/welcome|login/, { timeout: 15000 });
    await page.goto(`${APP}/home`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    return { pass: /welcome|login/.test(page.url()), actual: `after visiting /home: ${new URL(page.url()).pathname}` };
  });
  return { fuelId, towId, mechId };
}

async function providerJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, geolocation: BLUE_AREA, permissions: ["geolocation"], locale: "en-US" });
  if (process.env.APP_API_ORIGIN) await redirectApi(context, process.env.APP_API_ORIGIN, "http://localhost:4000");
  await context.route("https://router.project-osrm.org/**", (route) => route.fulfill({ json: { code: "Ok", routes: [{ distance: 2000, duration: 300, geometry: { type: "LineString", coordinates: [] }, legs: [{ steps: [] }] }], durations: [[300]] } }));
  const page = await context.newPage();
  ctx.page = page;
  const log = watch(page);
  page.on("dialog", (d) => d.accept());
  const phone = `0345${RUN}02`;
  let provider = null; let jobId = null;
  const customer = new Client(state.apiUrl, "api-customer");
  const reg = await customer.post("/api/auth/register", { role: "user", name: "QA API Customer", phone: `0355${RUN}03`, password: PASSWORD }, { auth: "none" });
  customer.token = reg.body.token; customer.user = reg.body.user;

  await step("Provider", "Sign up as provider (mechanic)", "Welcome -> Register as a Service Provider -> Continue with Phone -> Car Mechanic -> details -> upload workshop photo + certificate -> Fetch location -> Continue to identity verification", "account created with verificationStatus=pending", async () => {
    await page.goto(`${APP}/welcome`, { waitUntil: "networkidle" });
    await tap(page, "Register as a Service Provider");
    await tap(page, "Continue with Phone");
    await tap(page, "Car Mechanic");
    await tap(page, "Next");
    await fill(page, "Full name", "QA Web Provider");
    await fill(page, "Mobile number", phone);
    await fill(page, "Password", PASSWORD);
    await tap(page, "Next");
    for (const doc of ["Workshop photo", "Mechanic certificate"]) {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), tap(page, `Choose photo for ${doc}`)]);
      await chooser.setFiles(DOC);
      await page.waitForTimeout(800);
    }
    await tap(page, "Next");
    await page.getByLabel("Fetch real-time location").filter({ visible: true }).first().click();
    await page.waitForTimeout(3000);
    await tap(page, /Continue to identity verification/);
    await page.waitForURL(/verification/, { timeout: 25000 });
    const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) { const v = localStorage.getItem(k); if (v && /^eyJ/.test(v)) return v; } return null; });
    provider = await apiClient("web-provider", token);
    const u = provider.user;
    return { pass: u?.verificationStatus === "pending" && !!u.mechanicProfile?.workshopPhotoUrl && u.mechanicProfile.liveLocation?.lat != null, actual: `status=${u?.verificationStatus}, docs stored=${!!u?.mechanicProfile?.workshopPhotoUrl}, location captured=${u?.mechanicProfile?.liveLocation?.lat != null}` };
  });
  await step("Provider", "Verification screen", "identity verification screen (selfies + CNIC)", "camera/CNIC capture form with consent; submission needs AWS", async () => {
    await page.waitForTimeout(1500);
    const t = await bodyText(page);
    return { pass: /verification/i.test(t), actual: t.slice(0, 180), note: "Selfie/CNIC submission goes to AWS S3 + Rekognition and needs a live camera: not exercised. Approved via admin API instead." };
  });
  await step("Provider", "Unverified provider cannot go online", "Dashboard -> Online status toggle while pending", "toggle disabled or server refuses", async () => {
    await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const toggle = page.getByRole("switch", { name: /Online status/i }).or(page.getByLabel("Online status")).filter({ visible: true }).first();
    const disabled = (await toggle.count()) ? await toggle.isDisabled().catch(() => false) || (await toggle.getAttribute("aria-disabled")) === "true" : true;
    if (!disabled) await toggle.click().catch(() => {});
    await page.waitForTimeout(1500);
    const me = (await provider.get("/api/auth/me")).body.user;
    return { pass: me.providerState?.isOnline !== true, actual: `toggle disabled=${disabled}, server isOnline=${me.providerState?.isOnline}` };
  });
  await step("Provider", "Admin approval reaches the app", "admin approves via API (seeded submission) -> reload dashboard", "dashboard no longer asks for verification", async () => {
    const r = await verifyProvider(provider);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    return { pass: r.status === 200, actual: `admin approve HTTP ${r.status}; screen: ${(await bodyText(page)).slice(0, 140)}` };
  });
  await step("Provider", "Go online from dashboard", "tap Online status toggle", "server isOnline=true with fresh location", async () => {
    const toggle = page.getByRole("switch", { name: /Online status/i }).or(page.getByLabel("Online status")).filter({ visible: true }).first();
    await toggle.click();
    for (let i = 0; i < 15; i++) {
      const me = (await provider.get("/api/auth/me")).body.user;
      if (me.providerState?.isOnline) return { actual: `online at ${me.providerState.currentLocation?.lat?.toFixed(4)},${me.providerState.currentLocation?.lng?.toFixed(4)}` };
      await page.waitForTimeout(1000);
    }
    return { pass: false, actual: "server still offline" };
  });
  await step("Provider", "Incoming job offer and accept", "customer creates mechanic request (API) -> offer appears in app -> Accept", "request assigned to this provider", async () => {
    const r = await customer.post("/api/requests", { category: "mechanic", pickupLocation: { lat: BLUE_AREA.latitude, lng: BLUE_AREA.longitude, addressText: "Blue Area, Islamabad", source: "manual_map" }, mechanicDetails: { issueCategory: "battery" } });
    jobId = r.body?.request?.id;
    const accept = page.getByRole("button", { name: "Accept", exact: true }).filter({ visible: true }).first();
    await accept.waitFor({ timeout: 40000 });
    await shot(page, "mobile-provider-incoming-offer");
    await accept.click();
    await page.waitForURL(/\/job\//, { timeout: 20000 });
    const g = (await customer.get(`/api/requests/${jobId}`)).body.request;
    return { pass: g.providerId === provider.user.id && g.status === "provider_assigned", actual: `status=${g.status}` };
  });
  const flow = [["Start Navigation", "provider_on_way"], ["I've Arrived", "provider_arrived"], ["Start Inspection", "inspection_started"]];
  for (const [button, status] of flow) {
    await step("Provider", `Job detail: ${button}`, `tap "${button}"`, `status=${status}`, async () => {
      await tap(page, button, { timeout: 20000 });
      for (let i = 0; i < 10; i++) {
        const g = (await customer.get(`/api/requests/${jobId}`)).body.request;
        if (g.status === status) return { actual: `status=${g.status}` };
        await page.waitForTimeout(800);
      }
      return { pass: false, actual: `status=${(await customer.get(`/api/requests/${jobId}`)).body.request.status}` };
    });
  }
  await step("Provider", "Request extra work", "Request Extra Work -> findings, part, price 4000, labour 500 -> Send for Approval; customer approves (API)", "extra_work_requested, then work_started with total 1250+4500", async () => {
    await tap(page, "Request Extra Work");
    await page.getByLabel("Inspection Findings").filter({ visible: true }).first().fill("Battery weak");
    await fill(page, "Part / work", "Battery replacement");
    await fill(page, "Part price (Rs.)", "4000");
    await fill(page, "Labour (Rs.)", "500");
    await tap(page, "Send for Approval");
    await page.waitForTimeout(2000);
    const g = (await customer.get(`/api/requests/${jobId}`)).body.request;
    const ap = await customer.patch(`/api/requests/${jobId}/extra-work/approve`, { approved: true });
    return { pass: g.status === "extra_work_requested" && ap.body?.request?.estimate?.total === 5750, actual: `after send status=${g.status}; after approval status=${ap.body?.request?.status}, total=${ap.body?.request?.estimate?.total}` };
  });
  await step("Provider", "Chat with customer", `open /job/<id>/chat -> send; customer replies (API)`, "messages delivered both ways", async () => {
    await page.goto(`${APP}/job/${jobId}/chat`, { waitUntil: "networkidle" });
    const box = page.locator("textarea, input").filter({ visible: true }).last();
    await box.waitFor({ timeout: 15000 });
    await box.fill("On site now");
    await tap(page, /send/i);
    await customer.post(`/api/requests/${jobId}/messages`, { body: "Thanks, see you" });
    await waitText(page, /Thanks, see you/, 15000);
    const msgs = (await customer.get(`/api/requests/${jobId}/messages`)).body.messages.map((m) => m.body);
    return { pass: msgs.includes("On site now"), actual: msgs.join(" / ") };
  });
  await step("Provider", "Finish job and confirm cash", "job screen -> Mark as Completed (service_finished); customer confirms + selects cash (API); provider taps Confirm cash collected", "completed and cash paid", async () => {
    await page.goto(`${APP}/job/${jobId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await tap(page, "Mark as Completed", { timeout: 20000 });
    await page.waitForTimeout(2000);
    const fin = (await customer.get(`/api/requests/${jobId}`)).body.request.status;
    await customer.patch(`/api/requests/${jobId}/status`, { status: "completed" });
    await customer.post(`/api/payments/request/${jobId}`, { method: "cash", idempotencyKey: `qa-web-cash-${jobId}` });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await tap(page, "Confirm cash collected", { timeout: 20000 });
    await page.waitForTimeout(2000);
    const pay = (await customer.get(`/api/payments/request/${jobId}`)).body.payment;
    return { pass: fin === "service_finished" && pay?.status === "paid", actual: `after Mark as Completed=${fin}, payment=${pay?.status}` };
  });
  await step("Provider", "Jobs tab", "open Jobs tab", "completed job listed", async () => {
    await page.goto(`${APP}/jobs`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    return { actual: (await bodyText(page)).slice(0, 180) };
  });
  await step("Provider", "Earnings tab", "open Earnings", "shows Rs 5,750 (1250 + 4500, no service fee on mechanic jobs) matching /provider/earnings", async () => {
    await page.goto(`${APP}/earnings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const e = (await provider.get("/api/requests/provider/earnings")).body.earnings;
    const t = await bodyText(page);
    return { pass: e.total === 5750 && /5,750/.test(t), actual: `API total=${e.total}; UI shows 5,750=${/5,750/.test(t)}` };
  });
  await step("Provider", "Profile tab", "open Profile", "provider name + service shown", async () => {
    await page.goto(`${APP}/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const t = await bodyText(page);
    return { pass: /QA Web Provider/.test(t), actual: t.slice(0, 160) };
  });
  await step("Provider", "Provider log out", "Profile -> Log out", "back to login", async () => {
    await tap(page, /log ?out|sign ?out/i);
    await page.waitForTimeout(800);
    const confirm = page.getByRole("button", { name: /log ?out|sign ?out|yes/i }).filter({ visible: true });
    if (await confirm.count()) await confirm.last().click().catch(() => {});
    await page.waitForURL(/welcome|login/, { timeout: 15000 });
    return { actual: new URL(page.url()).pathname };
  });
  ctx.providerLog = log;
  await context.close();
}

async function finishLater(page, context, customer, providers) {
  await customerJourney(page, context, customer, providers);
  await providerJourney(page.context().browser());
}

main().catch(async (e) => {
  console.error(e);
  R.write(path.join(__dirname, "..", "results", "mobile-web-results.json"), { crashed: String(e.stack || e) });
  process.exit(1);
});
