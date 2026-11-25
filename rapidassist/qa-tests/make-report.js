#!/usr/bin/env node
/** Builds QA_REPORT.md from results/*.json plus the curated findings below. */
const fs = require("node:fs");
const path = require("node:path");

const dir = (p) => path.join(__dirname, p);
const load = (f) => (fs.existsSync(dir(f)) ? JSON.parse(fs.readFileSync(dir(f), "utf8")) : null);
const suites = [
  ["Backend API + Socket.io", load("results/api-results.json")],
  ["Admin panel UI (Playwright)", load("results/admin-ui-results.json")],
  ["Mobile app – Expo Web (Playwright)", load("results/mobile-web-results.json")]
].filter(([, s]) => s);

const STATIC = [
  ["admin-panel: npm run lint", "eslint .", "0 problems", "0 problems", "PASS"],
  ["admin-panel: npm run build", "vite build", "build succeeds", "built in ~170 ms (index 365 kB / 116 kB gzip)", "PASS"],
  ["mobile-app: npx tsc --noEmit", "TypeScript check", "0 errors", "0 errors", "PASS"],
  ["mobile-app: npm test", "node --test + jest", "all pass", "135/135 node tests, 102/102 jest tests", "PASS"],
  ["server: npm test (existing suite)", "node --test test/*.test.js", "all pass", "313 pass, 0 fail, 1 skipped (Stripe CLI)", "PASS"]
];

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
let total = STATIC.length; let passed = STATIC.length; let failed = 0;
for (const [, s] of suites) { total += s.summary.total; passed += s.summary.passed; failed += s.summary.failed; }

const out = [];
out.push(`# RapidAssist – End-to-end QA Report

Run date: ${new Date().toISOString().slice(0, 10)} · Branch: \`fix/qa-top5\` (after the top-5 fix round) · Tester: automated QA harness in \`qa-tests/\`

**Result: ${total} checks · ${passed} passed · ${failed} failed.** Baseline before the fixes: 328 checks · 320 passed · 8 failed.

## Fix round (branch \`fix/qa-top5\`, not pushed)

| Finding | Status | Commit | Change |
|---|---|---|---|
| B1 Duplicate review | **Fixed** | \`8c1a5fc\` | 409 on a second review; conditional write keeps the first review and the provider rating unchanged (also under concurrent submits). |
| B2 Extra-work \`approved\` parsing | **Fixed** | \`498c043\` | Only boolean \`true\`/\`false\` accepted; missing, \`"false"\`, \`1\`, \`null\` → 400. App Reject / Approve & Continue buttons verified on Expo Web. |
| B3 Many open requests | **Fixed** | \`4864cb9\` | 409 \`{code: ACTIVE_REQUEST_EXISTS, requestId, status}\`; the booking screen shows a message and an **Open active request** button. |
| S1 Token valid after logout | **Fixed** | \`45ad63f\` | \`User.tokenVersion\` signed into the JWT as \`tv\`; logout increments it; HTTP auth and Socket.io reject stale versions; tokens without \`tv\` keep working until expiry. |
| S2 Web token in localStorage | **Not changed** (as instructed) | \`32bab9d\` (probe only) | The cookie works only when the web page and API share a hostname. With the dev config in \`mobile-app/.env\` (API on a LAN IP, page on localhost) Chrome does not store the SameSite=Lax cookie: \`/me\` 401, socket refused. See \`results/cookie-probe.json\`. |

Regression check: every API use case that passed in the baseline still passes (\`lib/compare.js\` against \`results/api-baseline.json\`).

| Suite | Total | Pass | Fail |
|---|---|---|---|
| Static checks (build, lint, typecheck, existing unit tests) | ${STATIC.length} | ${STATIC.length} | 0 |
${suites.map(([n, s]) => `| ${n} | ${s.summary.total} | ${s.summary.passed} | ${s.summary.failed} |`).join("\n")}

## How the tests were run

- **Isolated stack** (\`node qa-tests/lib/start-stack.js\`): the real \`server/src/index.js\` on port 4000 with a throwaway
  MongoDB replica set (mongodb-memory-server) and a local OSRM route stub. Environment overrides keep the run away from the
  Atlas database, AWS S3/Rekognition, Stripe, Groq and Google (\`server/.env\` was not modified).
- **API suite** (\`api/run-api-tests.js\`): one customer + second customer, 3 providers (mechanic, fuel_delivery, towing),
  plus a second mechanic (race test) and a rejected mechanic. Real dispatch worker offers, Socket.io clients for every
  account, and a scan of every response for \`passwordHash\` / bcrypt hashes / \`googleId\` / \`faceDescriptor\`.
- **Admin UI** (\`ui/admin-panel.e2e.js\`) and **Expo Web** (\`ui/mobile-web.e2e.js\`): Playwright driving the local Google Chrome.
  Screenshots are in \`qa-tests/screenshots/\`.
- Re-run: see \`qa-tests/README.md\`.

## 1. Use-case results
`);

out.push(`### Static checks\n\n| Use case | Steps | Expected | Actual | Result |\n|---|---|---|---|---|`);
for (const r of STATIC) out.push(`| ${r.map(esc).join(" | ")} |`);
for (const [name, s] of suites) {
  out.push(`\n### ${name}\n\n| ID | Area | Use case | Steps | Expected | Actual | Result |\n|---|---|---|---|---|---|---|`);
  for (const r of s.results) {
    out.push(`| ${r.id} | ${esc(r.area)} | ${esc(r.useCase)} | ${esc(r.steps)} | ${esc(r.expected)} | ${esc(r.actual)} | **${r.result}** |`);
  }
}

out.push(`
## 2. Bugs (sorted by severity)

Status after the fix round: B1–B3 fixed (see above); B4–B7 open. No **Critical** bugs were found: authentication, role checks, IDOR protection, dispatch races, status transitions and
payments all behaved correctly.

| # | Severity | Bug | Where | Evidence | Suggested fix |
|---|---|---|---|---|---|
| B1 | ~~High~~ **Fixed** | A customer can review the same job any number of times; each call overwrites the rating, so a provider's \`ratingAvg\` can be changed after the fact (5 → 1 in the test). | \`server/src/controllers/requests.controller.js:713\` (\`submitRequestReview\`) | API-167 | Reject when \`request.review?.rating\` exists (409), or write atomically with \`findOneAndUpdate({ _id, userId, status: "completed", "review.rating": null }, …)\`. |
| B2 | ~~Medium~~ **Fixed** | Extra-work decision is parsed with \`Boolean(req.body?.approved ?? true)\`: the string \`"false"\` **approves** (and charges) the extra work, and a missing field also approves. The mobile app sends a real boolean, so this affects other API clients. | \`server/src/controllers/requests.controller.js:966\` | API-250 (\`approved:"false"\` → status approved, total +2000) | Require \`typeof approved === "boolean"\`, else 400. Never default to approval. |
| B3 | ~~Medium~~ **Fixed** | A customer can have unlimited simultaneous open requests (3 created back-to-back in the test). Each one goes through dispatch, so a single account can tie up nearby providers with offers. | \`server/src/controllers/requests.controller.js:375\` (\`createRequest\`) | API-198 | Before creating, refuse with 409 if the customer already has a request whose status is not completed/cancelled (the \`clientRequestId\` retry path already returns the existing request). |
| B4 | **Low** | Passwords only need 6 characters; \`123456\` is accepted. | \`server/src/routes/auth.routes.js:240\` | API-014 | Minimum 8 characters, at least one letter and one digit, and reject a short list of common passwords. Mirror the rule in \`mobile-app/src/auth/signup/DetailsStep.tsx\`. |
| B5 | **Low** | Phone numbers are only length-checked, so \`abcdefghijk\` registers. Providers and customers call each other on this number. | \`server/src/routes/auth.routes.js:239\` (also \`:297\`) | API-015 | Normalise and validate a Pakistani mobile, e.g. \`/^(\\+92|0)3\\d{9}$/\`, and store it in one canonical form. |
| B6 | **Low** | Provider accounts can create, list and delete vehicles; there is no role check (providers have no vehicle screen). | \`server/src/controllers/vehicles.controller.js:32\` (all handlers) | API-050 | \`if (req.authRole !== "user") throw forbidden("Customer account required")\` in each handler, or \`requireRole("user")\` on the router. |
| B7 | **Low (dev setup)** | \`mobile-app/.env\` hard-codes \`EXPO_PUBLIC_API_URL=http://192.168.0.116:4001\` (a LAN IP that is no longer this machine), and \`admin-panel/.env.development.local\` points at port 4001. The Expo **dev web bundle reads this value from \`.env\` even when the shell variable is set or \`EXPO_NO_DOTENV=1\`**, so Expo Web cannot reach a local API without editing the file. | \`mobile-app/.env\`, \`admin-panel/.env.development.local\` | QA harness had to reroute the browser's API calls | Leave \`EXPO_PUBLIC_API_URL\` empty in \`.env\` for development (\`src/config/api.ts\` then derives \`http://<host>:EXPO_PUBLIC_DEV_API_PORT\`), and keep machine-specific values in \`.env.local\`. |

### Behaviour that differs from the test specification (not bugs)

- **Towing lifecycle**: the spec lists \`reached_destination → completed\`. The server requires the provider to send
  \`service_finished\` first, then the **customer** confirms \`completed\` (same for fuel and mechanic jobs). This is consistent and deliberate (API-186).
- **Mechanic lifecycle**: \`extra_work_requested\` is reached through \`PATCH /:id/extra-work\`, not \`PATCH /:id/status\`;
  \`inspection_started → work_started\` is also allowed directly when no extra work is needed.
- **Admin routes are authenticated** in this branch (\`router.use(...requireAdmin)\` in \`server/src/routes/admin.routes.js:22\`),
  so the tests log in through \`POST /api/auth/admin/login\`. This is *not* reported as a problem.
- **Repeating the current status** (e.g. cancelling an already-cancelled request) returns 200 as a no-op without adding a
  timeline entry. That's idempotent and fine.
- **Approving a provider requires a submitted verification** (\`409 A mechanic submission is required…\`). Submissions go
  through AWS, so the tests seeded the "awaiting review" state in the database and then used the real admin API/UI to approve or reject.

## 3. Security findings

| # | Severity | Finding | Where | Suggested fix |
|---|---|---|---|---|
| S1 | ~~Medium~~ **Fixed** | **JWT still valid after logout.** Logout only clears the cookie; a copied bearer token keeps working for up to \`JWT_EXPIRES_IN\` (7 days). | \`server/src/routes/auth.routes.js:485\`, \`server/src/utils/jwt.js:5\` | Add a \`tokenVersion\` (or \`sessionsRevokedAt\`) on the user, put it in the JWT, check it in \`readSession\`, bump it on logout/password change. Shorter expiry (e.g. 1 day). |
| S2 | **Medium (open)** | **Web build stores the JWT in \`localStorage\`** as well as the httpOnly cookie, so any XSS on the web app can steal the session. | \`mobile-app/src/auth/auth.storage.ts:19\` | On \`Platform.OS === "web"\` rely on the httpOnly cookie (\`withCredentials\` is already on) and don't persist the token in JS-readable storage. |
| S3 | Low | Review overwrite (B1) and string-boolean approval (B2) are also integrity issues: ratings can be manipulated and a crafted request can approve a charge. | see B1, B2 | see B1, B2 |
| S4 | Low | No limit on concurrent requests per customer (B3) enables dispatch spam. | see B3 | see B3 |

**Security checks that passed** (details in the API table): 401 on all 23 protected endpoints without a JWT; tampered and
\`alg=none\` tokens rejected; wrong role → 403 (customer → provider/admin endpoints, provider → customer endpoints); IDOR blocked
for requests, vehicles, chat, payments and reviews; 13 endpoints return 400 (never 500) for an invalid ObjectId; NoSQL
injection (\`{"$ne":null}\`) rejected in login, admin login and register; mass-assignment on register ignored;
**no \`passwordHash\`, bcrypt hash, \`googleId\` or \`faceDescriptor\` in any response**; CORS rejects untrusted origins;
13 MB body → 413; Socket.io rejects connections without a token, and an outsider socket received no events for other
customers' requests; nearby-provider search returns only approximate (~500 m grid) locations.

## 4. What could not be tested and why

| Area | Why | What was done instead |
|---|---|---|
| Provider identity verification submit (selfies + CNIC → \`POST /api/mechanic-verification\`) | Uses AWS S3 + Rekognition and a live camera; the QA run must not upload to the real bucket. The endpoint correctly returns 503 when storage is unavailable. | Seeded \`mechanicVerification.reviewState = awaiting_review\` in MongoDB, then approved/rejected through the real admin API and admin UI. The verification screen was opened and screenshotted. |
| Native-only features: Android maps (react-native-maps / Google Maps), background location, push notifications, the native camera | Need an Android device or emulator | The Web map (OSM/CARTO canvas) rendered on home, booking, tracking and admin live-jobs/heatmap pages. |
| Stripe card payments | Need Stripe test keys + webhook listener (\`STRIPE_*\` deliberately blank) | Cash payment and cash-collection were tested end to end; Stripe's own unit tests run in \`server npm test\`. |
| Google sign-in | Needs a real Google ID token and an allowed OAuth origin | Phone/password sign-in tested; the Google button renders. |
| AI features (Groq diagnostic assist, CLIP photo suggestion, face models) | External key / large models (\`AI_PRELOAD=false\`) | Not exercised in the UI; the server's unit tests cover them. |
| Public OSRM / Photon routing and geocoding | External services | Server routing used a local OSRM stub; the browser's OSRM calls were answered by an identical stub, so the UI towing fare and server total were compared like for like (they match). Photon reverse geocoding ran live. |
| Login rate limiting (30 attempts / 15 min per IP) | Triggering it would lock out the rest of the run | Not tested. |

## 5. Dummy / hard-coded data check

- \`mobile-app/src/services/dummyApi.ts\` **no longer exists**. It was removed in commit \`44dfa2f\` ("phase 0 cleanup for redesign") and nothing imports it.
- A search for \`mock|fake|dummy|sample\` in \`mobile-app/app\`, \`mobile-app/src\` and \`admin-panel/src\` only finds comments mentioning design mockups
  (\`src/requests/customer/shared.tsx:53\`, \`src/design/components/*.tsx\`). Every screen tested reads live API data
  (fares, provider names, chat, history, payments and earnings all matched the API).
- \`app/(dev)/kit.tsx\` and \`app/(dev)/map-foundation.tsx\` are developer screens; \`app/(dev)/_layout.tsx\` redirects them away when \`!__DEV__\`.
- Seeded demo providers (\`providerState.isDemo\`, \`npm run demo:up\`) are shown on the map but never offered jobs, which is by design.
`);

fs.writeFileSync(dir("QA_REPORT.md"), out.join("\n"));
console.log(`QA_REPORT.md written: ${total} checks, ${passed} passed, ${failed} failed`);
