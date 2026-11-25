# RapidAssist – End-to-end QA Report

Run date: 2026-11-25 · Branch: `fix/qa-top5` (after the top-5 fix round) · Tester: automated QA harness in `qa-tests/`

**Result: 345 checks · 341 passed · 4 failed.** Baseline before the fixes: 328 checks · 320 passed · 8 failed.

## Fix round (branch `fix/qa-top5`, not pushed)

| Finding | Status | Commit | Change |
|---|---|---|---|
| B1 Duplicate review | **Fixed** | `8c1a5fc` | 409 on a second review; conditional write keeps the first review and the provider rating unchanged (also under concurrent submits). |
| B2 Extra-work `approved` parsing | **Fixed** | `498c043` | Only boolean `true`/`false` accepted; missing, `"false"`, `1`, `null` → 400. App Reject / Approve & Continue buttons verified on Expo Web. |
| B3 Many open requests | **Fixed** | `4864cb9` | 409 `{code: ACTIVE_REQUEST_EXISTS, requestId, status}`; the booking screen shows a message and an **Open active request** button. |
| S1 Token valid after logout | **Fixed** | `45ad63f` | `User.tokenVersion` signed into the JWT as `tv`; logout increments it; HTTP auth and Socket.io reject stale versions; tokens without `tv` keep working until expiry. |
| S2 Web token in localStorage | **Not changed** (as instructed) | `32bab9d` (probe only) | The cookie works only when the web page and API share a hostname. With the dev config in `mobile-app/.env` (API on a LAN IP, page on localhost) Chrome does not store the SameSite=Lax cookie: `/me` 401, socket refused. See `results/cookie-probe.json`. |

Regression check: every API use case that passed in the baseline still passes (`lib/compare.js` against `results/api-baseline.json`).

| Suite | Total | Pass | Fail |
|---|---|---|---|
| Static checks (build, lint, typecheck, existing unit tests) | 5 | 5 | 0 |
| Backend API + Socket.io | 289 | 286 | 3 |
| Admin panel UI (Playwright) | 12 | 12 | 0 |
| Mobile app – Expo Web (Playwright) | 39 | 38 | 1 |

## How the tests were run

- **Isolated stack** (`node qa-tests/lib/start-stack.js`): the real `server/src/index.js` on port 4000 with a throwaway
  MongoDB replica set (mongodb-memory-server) and a local OSRM route stub. Environment overrides keep the run away from the
  Atlas database, AWS S3/Rekognition, Stripe, Groq and Google (`server/.env` was not modified).
- **API suite** (`api/run-api-tests.js`): one customer + second customer, 3 providers (mechanic, fuel_delivery, towing),
  plus a second mechanic (race test) and a rejected mechanic. Real dispatch worker offers, Socket.io clients for every
  account, and a scan of every response for `passwordHash` / bcrypt hashes / `googleId` / `faceDescriptor`.
- **Admin UI** (`ui/admin-panel.e2e.js`) and **Expo Web** (`ui/mobile-web.e2e.js`): Playwright driving the local Google Chrome.
  Screenshots are in `qa-tests/screenshots/`.
- Re-run: see `qa-tests/README.md`.

## 1. Use-case results

### Static checks

| Use case | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| admin-panel: npm run lint | eslint . | 0 problems | 0 problems | PASS |
| admin-panel: npm run build | vite build | build succeeds | built in ~170 ms (index 365 kB / 116 kB gzip) | PASS |
| mobile-app: npx tsc --noEmit | TypeScript check | 0 errors | 0 errors | PASS |
| mobile-app: npm test | node --test + jest | all pass | 135/135 node tests, 102/102 jest tests | PASS |
| server: npm test (existing suite) | node --test test/*.test.js | all pass | 313 pass, 0 fail, 1 skipped (Stripe CLI) | PASS |

### Backend API + Socket.io

| ID | Area | Use case | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| API-001 | Setup | GET /health | GET /health | 200 {ok:true} | HTTP 200 {"ok":true,"name":"rapidassist-server"} | **PASS** |
| API-002 | Auth | Register customer (valid) | POST /api/auth/register role=user | 201, token, role=user, httpOnly cookie | HTTP 201, role=user, cookie httpOnly=true | **PASS** |
| API-003 | Auth | Register provider (mechanic) is pending verification | POST /api/auth/register role=mechanic serviceCategory=mechanic | 201 and verificationStatus=pending | HTTP 201, verificationStatus=pending, category=mechanic | **PASS** |
| API-004 | Auth | Register provider (fuel_delivery) is pending verification | POST /api/auth/register role=mechanic serviceCategory=fuel_delivery | 201 and verificationStatus=pending | HTTP 201, verificationStatus=pending, category=fuel_delivery | **PASS** |
| API-005 | Auth | Register provider (towing) is pending verification | POST /api/auth/register role=mechanic serviceCategory=towing | 201 and verificationStatus=pending | HTTP 201, verificationStatus=pending, category=towing | **PASS** |
| API-006 | Auth | Register with duplicate phone | POST /register with the customer's phone again | 409 Phone already registered | HTTP 409 "Phone already registered" | **PASS** |
| API-007 | Auth | Register with invalid role (admin) | POST /register role=admin | 400 Invalid role | HTTP 400 "Invalid role" | **PASS** |
| API-008 | Auth | Register with invalid role (random) | POST /register role=superuser | 400 Invalid role | HTTP 400 "Invalid role" | **PASS** |
| API-009 | Auth | Register with missing name | POST /register without name | 400 | HTTP 400 "Name is required" | **PASS** |
| API-010 | Auth | Register with missing phone | POST /register without phone | 400 | HTTP 400 "Phone is required" | **PASS** |
| API-011 | Auth | Register with missing password | POST /register without password | 400 | HTTP 400 "Password must be at least 6 characters" | **PASS** |
| API-012 | Auth | Register with empty body | POST /register {} | 400 | HTTP 400 "Invalid role" | **PASS** |
| API-013 | Auth | Register with too-short password (5 chars) | POST /register password=12345 | 400 | HTTP 400 "Password must be at least 6 characters" | **PASS** |
| API-014 | Auth | Register with weak password (123456) | POST /register password=123456 | 400 – a trivially guessable password should be rejected | HTTP 201 (only a length >= 6 rule exists) | **FAIL** |
| API-015 | Auth | Register with non-numeric phone | POST /register phone=abcdefghijk | 400 invalid phone number | HTTP 201 (phone is only length-checked) | **FAIL** |
| API-016 | Auth | Register mechanic with invalid serviceCategory | POST /register role=mechanic serviceCategory=plumber | 400 | HTTP 400 "Invalid mechanic service category" | **PASS** |
| API-017 | Auth | Register mechanic (mechanic category) without workshop/certificate photos | POST /register mechanic without images | 400 | HTTP 400 "Workshop photo" | **PASS** |
| API-018 | Auth | Mass assignment on register | POST /register role=user with verificationStatus=verified, isCertified=true, ratingAvg=5 | Extra fields ignored | HTTP 201, verificationStatus=pending, isCertified=false, ratingAvg=0 | **PASS** |
| API-019 | Auth | Login with correct credentials | POST /api/auth/login | 200, token, cookie | HTTP 200, token=true, cookies=rapidassist_access_token | **PASS** |
| API-020 | Auth | Login with wrong password | POST /login wrong password | 401 Invalid credentials | HTTP 401 "Invalid credentials" | **PASS** |
| API-021 | Auth | Login with unknown phone | POST /login unknown phone | 401 with the same message as wrong password (no account enumeration) | HTTP 401 "Invalid credentials" vs "Invalid credentials" | **PASS** |
| API-022 | Auth | Login with missing fields | POST /login {} | 400 | HTTP 400 "Phone and password are required" | **PASS** |
| API-023 | Auth | Admin account cannot log in through the mobile login | POST /login phone=admin-system password=<admin password> | 401 | HTTP 401 "Invalid credentials" | **PASS** |
| API-024 | Auth | GET /me with bearer token | GET /api/auth/me Authorization: Bearer | 200 with user | HTTP 200, id match=true | **PASS** |
| API-025 | Auth | GET /me with cookie only | GET /api/auth/me with only the auth cookie | 200 | HTTP 200 | **PASS** |
| API-026 | Auth | GET /me without token | GET /api/auth/me no auth | 401 | HTTP 401 "Unauthorized" | **PASS** |
| API-027 | Auth | GET /me with tampered token | Bearer token with modified signature | 401 | HTTP 401 "Session expired or invalid. Please sign in again." | **PASS** |
| API-028 | Auth | GET /me with unsigned (alg=none) token | Bearer token with alg=none | 401 | HTTP 401 "Session expired or invalid. Please sign in again." | **PASS** |
| API-029 | Auth | Login token carries a token version | decode the JWT payload from POST /login | payload has tv (number) | tv=0 | **PASS** |
| API-030 | Auth | Logout clears cookie | POST /api/auth/logout then GET /me with cookie | Set-Cookie clears token; /me with cookie -> 401 | logout HTTP 200, clear-cookie="rapidassist_access_token=; Path=/; Expires=Thu, 01 Jan 1970 …", /me via cookie HTTP 401 | **PASS** |
| API-031 | Security | JWT still valid after logout (no server-side revocation) | Logout, then reuse the same bearer token | 401 – a logged-out token should not keep working | HTTP 401 – revoked token rejected | **PASS** |
| API-032 | Security | Logout also revokes the account's other sessions | second login of the same account (other device), first device logs out, other device calls /me | 401 (tokenVersion is per account) | HTTP 401 "Unauthorized" | **PASS** |
| API-033 | Security | Socket.io refuses a token revoked by logout | io(BASE,{auth:{token:<logged-out token>}}) | connect_error Unauthorized | connect_error: Unauthorized | **PASS** |
| API-034 | Auth | Signing in again after logout works | POST /login again, GET /me with the new token | 200 | /me HTTP 200, socket connected | **PASS** |
| API-035 | Auth | Other users' sessions are unaffected by a logout | GET /me with the main customer's token | 200 | HTTP 200 | **PASS** |
| API-036 | Auth | Pre-deploy token without a version keeps working | JWT {sub, role} with no tv (as issued before this change), after the account has logged out | 200 on /me and socket connects (valid until it expires) | /me HTTP 200, socket connected | **PASS** |
| API-037 | Security | NoSQL injection in login phone | POST /login {"phone":{"$ne":null},"password":"x"} | 401/400, never 200 | HTTP 401 "Invalid credentials" | **PASS** |
| API-038 | Security | NoSQL injection in login password | POST /login {"phone":<real>,"password":{"$ne":null}} | 401/400 | HTTP 401 "Invalid credentials" | **PASS** |
| API-039 | Security | NoSQL injection in admin login | POST /auth/admin/login {"email":{"$ne":null},"password":{"$ne":null}} | 400/401 | HTTP 401 "Invalid admin credentials" | **PASS** |
| API-040 | Security | NoSQL injection in register phone | POST /register phone={"$gt":""} | 400 | HTTP 400 "Phone is required" | **PASS** |
| API-041 | Security | Malformed JSON body | POST /login with invalid JSON | 400 Invalid JSON | HTTP 400 "Invalid JSON request body" | **PASS** |
| API-042 | Security | CORS rejects untrusted origin | GET /health with Origin: https://evil.example | No Access-Control-Allow-Origin for evil origin | HTTP 403, ACAO=null | **PASS** |
| API-043 | Security | CORS allows admin-panel origin | GET /health with Origin: http://localhost:5173 | ACAO echoes origin with credentials | ACAO=http://localhost:5173, credentials=true | **PASS** |
| API-044 | Vehicles | Create vehicle | POST /api/vehicles {type:car, make, model, year} | 201 vehicle owned by caller | HTTP 201, owner=caller (userId in body ignored) | **PASS** |
| API-045 | Vehicles | List my vehicles | GET /api/vehicles | 200, only my vehicles | HTTP 200, count=2, all mine=true | **PASS** |
| API-046 | Vehicles | Other customer's list does not include my vehicles | GET /api/vehicles as user2 | 200, 0 vehicles | HTTP 200, count=0 | **PASS** |
| API-047 | Vehicles | Update vehicle | PATCH /api/vehicles/:id {model, year} | 200 updated | HTTP 200, model=Corolla Altis, year=2019 | **PASS** |
| API-048 | Vehicles | Create vehicle with invalid type | POST /api/vehicles type=plane | 400 | HTTP 400 "Invalid vehicle type" | **PASS** |
| API-049 | Vehicles | Create vehicle with invalid year | POST /api/vehicles year=1800 | 400 | HTTP 400 "Invalid year" | **PASS** |
| API-050 | Vehicles | Create vehicle with missing make/model | POST /api/vehicles {type:car, year} | 400 | HTTP 400 "Make is required" | **PASS** |
| API-051 | Security | IDOR: other customer edits my vehicle | PATCH /api/vehicles/:myId as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-052 | Security | IDOR: other customer deletes my vehicle | DELETE /api/vehicles/:myId as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-053 | Security | IDOR: provider edits a customer's vehicle | PATCH /api/vehicles/:id as mechanic | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-054 | Vehicles | Invalid vehicle id | PATCH /api/vehicles/not-an-id | 400 | HTTP 400 "Invalid vehicle id" | **PASS** |
| API-055 | Vehicles | Unknown vehicle id | DELETE /api/vehicles/<random ObjectId> | 404 | HTTP 404 "Vehicle not found" | **PASS** |
| API-056 | Vehicles | Provider account can manage vehicles | POST /api/vehicles as mechanic | Customers only (403) – providers have no vehicle screen | HTTP 201 – a provider can create (and list/delete) vehicles; no role check in vehicles.controller | **FAIL** |
| API-057 | Vehicles | Delete vehicle | DELETE /api/vehicles/:id then GET list | 200, removed from list | HTTP 200, remaining=1 | **PASS** |
| API-058 | Security | Vehicles without JWT | GET /api/vehicles no auth | 401 | HTTP 401 "Unauthorized" | **PASS** |
| API-059 | Admin | Admin login | POST /api/auth/admin/login | 200 with admin token | HTTP 200, role=admin | **PASS** |
| API-060 | Admin | Admin login wrong password | POST /api/auth/admin/login wrong password | 401 | HTTP 401 "Invalid admin credentials" | **PASS** |
| API-061 | Admin | Dashboard stats | GET /api/admin/dashboard | 200 with stats.users/providers/vehicles/pendingProviders | HTTP 200, users=5, providers=6, pending=6, vehicles=1 | **PASS** |
| API-062 | Admin | List pending providers | GET /api/admin/providers?status=pending | 200, includes the new mechanics | HTTP 200, count=6, all QA mechanics listed=true | **PASS** |
| API-063 | Admin | List providers with invalid status filter | GET /api/admin/providers?status=foo | 400 | HTTP 400 "Invalid provider status" | **PASS** |
| API-064 | Admin | Admin routes require admin (customer token) | GET /api/admin/dashboard as customer | 401/403 (admin auth is present in this branch) | HTTP 403 "Forbidden" | **PASS** |
| API-065 | Admin | Admin routes without token | GET /api/admin/dashboard no auth | 401 | HTTP 401 "Unauthorized" | **PASS** |
| API-066 | Admin | Mechanic self-submits verification (AWS) | POST /api/mechanic-verification as pending mechanic | 201 in production / 503 in QA (no AWS bucket) | HTTP 503 "Verification photo storage is temporarily unavailable. Please try again shortly." – real submission needs AWS S3/Rekognition, seeded in DB instead | **PASS** |
| API-067 | Admin | Approve provider without a submission | PATCH /api/admin/providers/:id/verification {status:verified} before any submission | 409 | HTTP 409 "A mechanic submission is required before approval or rejection." | **PASS** |
| API-068 | Admin | Verification detail | GET /api/admin/providers/:id/verification | 200 with submissionId + reviewState | HTTP 200, reviewState=awaiting_review | **PASS** |
| API-069 | Admin | Verification with invalid status value | PATCH .../verification {status:approved} | 400 | HTTP 400 "status must be pending, verified, or rejected." | **PASS** |
| API-070 | Admin | Verification with stale submissionId | PATCH .../verification {status:verified, submissionId:wrong} | 409 | HTTP 409 "Use the current verification submission ID." | **PASS** |
| API-071 | Admin | Reject without reason | PATCH .../verification {status:rejected} no note | 400 | HTTP 400 "Rejection reason is required." | **PASS** |
| API-072 | Admin | Verification on invalid provider id | PATCH /api/admin/providers/abc/verification | 400 | HTTP 400 "Invalid provider ID." | **PASS** |
| API-073 | Admin | Verification on a customer id | PATCH /api/admin/providers/<customerId>/verification | 404 | HTTP 404 "Mechanic not found." | **PASS** |
| API-074 | Admin | Approve provider (mechanic) | PATCH .../verification {status:verified, submissionId} | 200 verificationStatus=verified, isCertified=true | HTTP 200, status=verified | **PASS** |
| API-075 | Admin | Approve provider (fuel_delivery) | PATCH .../verification {status:verified, submissionId} | 200 verificationStatus=verified, isCertified=true | HTTP 200, status=verified | **PASS** |
| API-076 | Admin | Approve provider (towing) | PATCH .../verification {status:verified, submissionId} | 200 verificationStatus=verified, isCertified=true | HTTP 200, status=verified | **PASS** |
| API-077 | Admin | Approve provider (mechanic B) | PATCH .../verification {status:verified, submissionId} | 200 verificationStatus=verified, isCertified=true | HTTP 200, status=verified | **PASS** |
| API-078 | Admin | Reject provider with reason | PATCH .../verification {status:rejected, note} | 200 verificationStatus=rejected | HTTP 200, status=rejected | **PASS** |
| API-079 | Admin | Approval visible to provider | GET /api/auth/me as approved mechanic | verificationStatus=verified | verificationStatus=verified | **PASS** |
| API-080 | Admin | Provider directory / active jobs / heatmap / payments / customers endpoints | GET provider-directory, active-jobs, heatmap, payments, customers, requests, finance/earnings, activity | 200 for each | /provider-directory=200, /active-jobs=200, /heatmap=200, /payments=200, /customers=200, /requests=200, /finance/earnings=200, /activity=200 | **PASS** |
| API-081 | Realtime | Socket connect without token is rejected | io(BASE) with no auth | connect_error Unauthorized | connect_error: Unauthorized | **PASS** |
| API-082 | Realtime | Customer + provider sockets connect with JWT | io(BASE,{auth:{token}}) for 2 customers and 4 providers | all connected | 6/6 connected | **PASS** |
| API-083 | Provider | Pending/rejected mechanic cannot go online | PATCH /requests/provider/availability {isOnline:true} as rejected mechanic | 403 | HTTP 403 "Complete provider verification before going online." | **PASS** |
| API-084 | Provider | Go online without a location | PATCH availability {isOnline:true} without location | 400 | HTTP 400 "A fresh GPS location is required to go online." | **PASS** |
| API-085 | Provider | Go online outside service area | PATCH availability {isOnline:true, location: Lahore} | 400 | HTTP 400 "RapidAssist currently serves Islamabad & Rawalpindi only. Go online from inside Islamabad or Rawalpindi." | **PASS** |
| API-086 | Provider | Share location while offline | PATCH /requests/provider/location while offline | 403 | HTTP 403 "Go online before sharing provider location" | **PASS** |
| API-087 | Provider | Verified mechanic provider goes online | PATCH availability {isOnline:true, fresh GPS in Islamabad} | 200 isOnline=true | HTTP 200, isOnline=true | **PASS** |
| API-088 | Provider | Verified fuel provider goes online | PATCH availability {isOnline:true, fresh GPS in Islamabad} | 200 isOnline=true | HTTP 200, isOnline=true | **PASS** |
| API-089 | Provider | Verified towing provider goes online | PATCH availability {isOnline:true, fresh GPS in Islamabad} | 200 isOnline=true | HTTP 200, isOnline=true | **PASS** |
| API-090 | Provider | Update location while online | PATCH /requests/provider/location | 200 | HTTP 200 | **PASS** |
| API-091 | Provider | Out-of-order (older) location fix | PATCH provider/location with capturedAt 10 min older than stored | 409, stored location not overwritten | HTTP 409 "Older location update ignored" | **PASS** |
| API-092 | Provider | Location with invalid coordinates | PATCH provider/location lat=999 | 400 | HTTP 400 "Valid location lat/lng required" | **PASS** |
| API-093 | Security | Customer cannot use provider availability | PATCH provider/availability as customer | 403 | HTTP 403 "Provider account required" | **PASS** |
| API-094 | Requests | Nearby providers (mechanic) | GET /requests/nearby-providers?category=mechanic&lat&lng | 200, lists the online provider of that category only, approximate location | HTTP 200, count=1, found=true, band=under 2 km, exact coords exposed=false | **PASS** |
| API-095 | Requests | Nearby providers (fuel_delivery) | GET /requests/nearby-providers?category=fuel_delivery&lat&lng | 200, lists the online provider of that category only, approximate location | HTTP 200, count=1, found=true, band=under 2 km, exact coords exposed=false | **PASS** |
| API-096 | Requests | Nearby providers (car_towing) | GET /requests/nearby-providers?category=car_towing&lat&lng | 200, lists the online provider of that category only, approximate location | HTTP 200, count=1, found=true, band=under 2 km, exact coords exposed=false | **PASS** |
| API-097 | Requests | Nearby providers with invalid category | GET nearby-providers?category=plumbing | 400 | HTTP 400 "category must be one of: car_towing, fuel_delivery, mechanic" | **PASS** |
| API-098 | Requests | Nearby providers without coordinates | GET nearby-providers?category=mechanic | 400 | HTTP 400 "Valid lat and lng are required" | **PASS** |
| API-099 | Security | Provider cannot call nearby-providers | GET nearby-providers as mechanic | 403 | HTTP 403 "Customer account required" | **PASS** |
| API-100 | Requests | Rejected provider never appears in nearby list | GET nearby-providers?category=mechanic | QA Unverified Mechanic absent | present=false | **PASS** |
| API-101 | Requests | Create request rejected: Invalid category | POST /api/requests | 400 | HTTP 400 "category must be one of: car_towing, fuel_delivery, mechanic" | **PASS** |
| API-102 | Requests | Create request rejected: Pickup outside service area (Lahore) | POST /api/requests | 400 | HTTP 400 "RapidAssist currently serves Islamabad & Rawalpindi only" | **PASS** |
| API-103 | Requests | Create request rejected: Missing pickup location | POST /api/requests | 400 | HTTP 400 "Pickup location valid lat/lng required" | **PASS** |
| API-104 | Requests | Create request rejected: Fuel type not petrol/diesel | POST /api/requests | 400 | HTTP 400 "fuelDetails.fuelType must be petrol or diesel" | **PASS** |
| API-105 | Requests | Create request rejected: Fuel liters 0 | POST /api/requests | 400 | HTTP 400 "fuelDetails.liters must be between 1 and 50" | **PASS** |
| API-106 | Requests | Create request rejected: Fuel liters 51 | POST /api/requests | 400 | HTTP 400 "fuelDetails.liters must be between 1 and 50" | **PASS** |
| API-107 | Requests | Create request rejected: Mechanic issue not in list | POST /api/requests | 400 | HTTP 400 "mechanicDetails.issueCategory must be one of: battery, engine, tyre, brake, overheating, general_inspection" | **PASS** |
| API-108 | Requests | Create request rejected: Towing without destination | POST /api/requests | 400 | HTTP 400 "Destination location valid lat/lng required" | **PASS** |
| API-109 | Requests | Create request rejected: Invalid priority | POST /api/requests | 400 | HTTP 400 "priority must be one of: normal, high, urgent" | **PASS** |
| API-110 | Requests | Create request rejected: Invalid vehicleId | POST /api/requests | 400 | HTTP 400 "Invalid vehicleId" | **PASS** |
| API-111 | Security | IDOR: create request with another customer's vehicle | POST /api/requests vehicleId=<user1 vehicle> as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-112 | Security | Provider cannot create a customer request | POST /api/requests as mechanic | 403 | HTTP 403 "Customer account required" | **PASS** |
| API-113 | Security | Create request without JWT | POST /api/requests no auth | 401 | HTTP 401 "Unauthorized" | **PASS** |
| API-114 | Requests | Create fuel (petrol 10 L) request | POST /api/requests {"category":"fuel_delivery","fuelType":"petrol","liters":10} | 201 status=searching_provider with estimate | HTTP 201, status=searching_provider, estimate=3350 PKR | **PASS** |
| API-115 | Realtime | fuel (petrol 10 L): customer socket receives request:changed after create | listen request:changed on customer socket | event for this request | kind=dispatch | **PASS** |
| API-116 | Dispatch | fuel (petrol 10 L): offer sent to the matching-category provider | poll GET /requests/open as the provider | request appears with dispatch.offerId within 30 s | offerId=e96443ad… | **PASS** |
| API-117 | Realtime | fuel (petrol 10 L): provider socket receives the new-offer event | listen request:changed on provider socket | kind=offer | kind=offer | **PASS** |
| API-118 | Dispatch | fuel (petrol 10 L): wrong-category provider (tow) does not see the request | GET /requests/open as other-category provider | request absent | visible=false | **PASS** |
| API-119 | Dispatch | fuel (petrol 10 L): wrong-category provider (tow) cannot accept | PATCH /requests/:id/accept {offerId} as other provider | 409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-120 | Dispatch | fuel (petrol 10 L): wrong-category provider (mech) does not see the request | GET /requests/open as other-category provider | request absent | visible=false | **PASS** |
| API-121 | Dispatch | fuel (petrol 10 L): wrong-category provider (mech) cannot accept | PATCH /requests/:id/accept {offerId} as other provider | 409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-122 | Dispatch | fuel (petrol 10 L): customer cannot accept | PATCH /requests/:id/accept as customer | 403 | HTTP 403 "Provider account required" | **PASS** |
| API-123 | Dispatch | fuel (petrol 10 L): rejected mechanic cannot accept | PATCH /requests/:id/accept {offerId} as rejected mechanic | 403/409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-124 | Requests | fuel (petrol 10 L): offered provider can view request details | GET /requests/:id as offered provider | 200 | HTTP 200 | **PASS** |
| API-125 | Security | fuel (petrol 10 L): non-offered provider cannot view request details | GET /requests/:id as unrelated provider | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-126 | Chat | fuel (petrol 10 L): chat before assignment | POST /requests/:id/messages before accept | 400 Chat is available after provider assignment | HTTP 400 "Chat is available after provider assignment" | **PASS** |
| API-127 | Dispatch | fuel (petrol 10 L): provider accepts offer | PATCH /requests/:id/accept {offerId} | 200 status=provider_assigned, providerId set | HTTP 200, status=provider_assigned | **PASS** |
| API-128 | Realtime | fuel (petrol 10 L): customer receives accept event | listen request:changed kind=assigned | event received | kind=assigned status=provider_assigned | **PASS** |
| API-129 | Requests | fuel (petrol 10 L): provider sees customer contact after assignment | GET /requests/:id as assigned provider | 200 with customer name | HTTP 200, customer=QA Customer | **PASS** |
| API-130 | Provider | fuel (petrol 10 L): provider/active returns the job | GET /requests/provider/active | 200 request.id = this job | HTTP 200, active=true | **PASS** |
| API-131 | Requests | fuel: estimate correct (petrol 10 L) | check estimate | 275*10 + 450 + 150 = 3350 | total=3350 | **PASS** |
| API-132 | Lifecycle | fuel: skip transition (assigned -> arrived) | PATCH status=provider_arrived from provider_assigned | 400 | HTTP 400 "Invalid job status transition." | **PASS** |
| API-133 | Lifecycle | fuel: customer cannot advance status | PATCH status=provider_on_way as customer | 403 | HTTP 403 "Only the assigned provider can advance this job" | **PASS** |
| API-134 | Lifecycle | fuel: other provider cannot advance status | PATCH status=provider_on_way as towing provider | 403 | HTTP 403 "Only the customer or assigned provider can update this job" | **PASS** |
| API-135 | Lifecycle | fuel: unknown status value | PATCH status=teleported | 400 | HTTP 400 "Invalid job status transition." | **PASS** |
| API-136 | Lifecycle | fuel: missing status | PATCH status={} (no status) | 400 | HTTP 400 "Invalid job status transition." | **PASS** |
| API-137 | ExtraWork | fuel: extra work not allowed for fuel | PATCH /requests/:id/extra-work as fuel provider | 400 | HTTP 400 "Extra work is only available for mechanic requests" | **PASS** |
| API-138 | Chat | Customer sends chat message | POST /requests/:id/messages as customer | 201 | HTTP 201 "[object Object]" | **PASS** |
| API-139 | Realtime | Provider receives chat:message socket event | listen chat:message on provider socket | event with message body | body="Hi, I'm near the blue car" | **PASS** |
| API-140 | Chat | Provider sends chat message | POST /requests/:id/messages as provider | 201 | HTTP 201 "[object Object]" | **PASS** |
| API-141 | Realtime | Customer receives chat:message socket event | listen chat:message on customer socket | event | senderRole=mechanic | **PASS** |
| API-142 | Chat | Both sides read the conversation | GET /requests/:id/messages as customer and provider | 200, 2 messages in order | customer 200/2, provider 200/2 | **PASS** |
| API-143 | Chat | Duplicate clientMessageId is idempotent | POST same clientMessageId again | 200 same message id, no duplicate | HTTP 200, sameId=true, count=2 | **PASS** |
| API-144 | Security | Outsider customer cannot read chat | GET /requests/:id/messages as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-145 | Security | Outsider customer cannot post chat | POST /requests/:id/messages as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-146 | Security | Unassigned provider cannot read chat | GET /requests/:id/messages as mechanic | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-147 | Chat | Empty message rejected | POST messages body='' | 400 | HTTP 400 "Message is required" | **PASS** |
| API-148 | Chat | Message over 1000 chars rejected | POST messages body=1001 chars | 400 | HTTP 400 "Message must be 1000 characters or less" | **PASS** |
| API-149 | Realtime | Outsider socket gets no events for this request | inspect user2 socket events | none for this request | 0 events | **PASS** |
| API-150 | Security | IDOR: other customer reads my request | GET /requests/:id as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-151 | Security | IDOR: other customer cancels my request | PATCH /requests/:id/status {cancelled} as user2 | 403 | HTTP 403 "Only the customer or assigned provider can update this job" | **PASS** |
| API-152 | Lifecycle | fuel: provider_on_way | PATCH /requests/:id/status {status:provider_on_way} as provider | 200 status=provider_on_way | HTTP 200, status=provider_on_way | **PASS** |
| API-153 | Realtime | fuel: customer receives status event | listen request:changed kind=status | status=provider_on_way | kind=status | **PASS** |
| API-154 | Realtime | fuel: provider location update reaches customer | PATCH provider/location during job; listen kind=location; GET request providerLocation | event + providerLocation present | update HTTP 200, event=true, providerLocation=true | **PASS** |
| API-155 | Lifecycle | fuel: provider_arrived | PATCH /requests/:id/status {status:provider_arrived} as provider | 200 status=provider_arrived | HTTP 200, status=provider_arrived | **PASS** |
| API-156 | Lifecycle | fuel: fuel_delivered | PATCH /requests/:id/status {status:fuel_delivered} as provider | 200 status=fuel_delivered | HTTP 200, status=fuel_delivered | **PASS** |
| API-157 | Lifecycle | fuel: service_finished | PATCH /requests/:id/status {status:service_finished} as provider | 200 status=service_finished | HTTP 200, status=service_finished | **PASS** |
| API-158 | Review | fuel: review before completion | PATCH /requests/:id/review before completed | 400 | HTTP 400 "Only completed requests can be reviewed" | **PASS** |
| API-159 | Lifecycle | fuel: provider cannot mark completed | PATCH status=completed as provider | 403 – customer confirmation required | HTTP 403 "Customer confirmation is required after service finishes" | **PASS** |
| API-160 | Lifecycle | fuel: customer confirms completion | PATCH status=completed as customer | 200 status=completed | HTTP 200, status=completed | **PASS** |
| API-161 | Lifecycle | fuel: status change after completion | PATCH status=provider_on_way after completed | 400 already closed | HTTP 400 "This job is already closed." | **PASS** |
| API-162 | Payments | fuel: cash payment selected and collected | POST /payments/request/:id {method:cash}; provider PATCH cash-collected | 200 pending -> paid | select HTTP 200 (pending), collect HTTP 200 (paid), invoice total=3350 | **PASS** |
| API-163 | Provider | fuel: provider freed after completion | GET provider/active after completion | request=null | active=null | **PASS** |
| API-164 | Review | Rating 0 rejected | PATCH /requests/:id/review {rating:0} | 400 | HTTP 400 "rating must be an integer between 1 and 5" | **PASS** |
| API-165 | Review | Rating 6 rejected | PATCH /requests/:id/review {rating:6} | 400 | HTTP 400 "rating must be an integer between 1 and 5" | **PASS** |
| API-166 | Review | Rating 3.5 rejected | PATCH /requests/:id/review {rating:3.5} | 400 | HTTP 400 "rating must be an integer between 1 and 5" | **PASS** |
| API-167 | Review | Rating 'five' rejected | PATCH /requests/:id/review {rating:'five'} | 400 | HTTP 400 "rating must be an integer between 1 and 5" | **PASS** |
| API-168 | Review | Provider cannot review | PATCH review as provider | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-169 | Review | Other customer cannot review | PATCH review as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-170 | Review | Comment over 400 chars rejected | PATCH review comment=401 chars | 400 | HTTP 400 "comment must be 400 characters or less" | **PASS** |
| API-171 | Review | Customer reviews completed job | PATCH review {rating:5} | 200, review saved | HTTP 200, rating=5 | **PASS** |
| API-172 | Review | Provider rating/completedJobs updated | GET /auth/me as fuel provider | ratingAvg=5, ratingCount=1, completedJobs=1 | ratingAvg=5, ratingCount=1, completedJobs=1 | **PASS** |
| API-173 | Review | Review can only be submitted once | PATCH review a second time {rating:1} | 409; first review unchanged; provider ratingAvg/ratingCount unchanged | HTTP 409, stored review=5/"Fast delivery", provider ratingAvg=5, ratingCount=1 | **PASS** |
| API-174 | Requests | fuel: diesel estimate (20 L) | POST /api/requests fuel diesel 20 L then cancel | 201, 290*20+450+150 = 6400 | HTTP 201, total=6400 | **PASS** |
| API-175 | Requests | Create towing request | POST /api/requests {"category":"car_towing"} | 201 status=searching_provider with estimate | HTTP 201, status=searching_provider, estimate=2062 PKR | **PASS** |
| API-176 | Realtime | towing: customer socket receives request:changed after create | listen request:changed on customer socket | event for this request | kind=dispatch | **PASS** |
| API-177 | Dispatch | towing: offer sent to the matching-category provider | poll GET /requests/open as the provider | request appears with dispatch.offerId within 30 s | offerId=3f5d78ca… | **PASS** |
| API-178 | Realtime | towing: provider socket receives the new-offer event | listen request:changed on provider socket | kind=offer | kind=offer | **PASS** |
| API-179 | Dispatch | towing: wrong-category provider (fuel) does not see the request | GET /requests/open as other-category provider | request absent | visible=false | **PASS** |
| API-180 | Dispatch | towing: wrong-category provider (fuel) cannot accept | PATCH /requests/:id/accept {offerId} as other provider | 409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-181 | Dispatch | towing: customer cannot accept | PATCH /requests/:id/accept as customer | 403 | HTTP 403 "Provider account required" | **PASS** |
| API-182 | Dispatch | towing: rejected mechanic cannot accept | PATCH /requests/:id/accept {offerId} as rejected mechanic | 403/409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-183 | Requests | towing: offered provider can view request details | GET /requests/:id as offered provider | 200 | HTTP 200 | **PASS** |
| API-184 | Security | towing: non-offered provider cannot view request details | GET /requests/:id as unrelated provider | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-185 | Chat | towing: chat before assignment | POST /requests/:id/messages before accept | 400 Chat is available after provider assignment | HTTP 400 "Chat is available after provider assignment" | **PASS** |
| API-186 | Dispatch | towing: provider accepts offer | PATCH /requests/:id/accept {offerId} | 200 status=provider_assigned, providerId set | HTTP 200, status=provider_assigned | **PASS** |
| API-187 | Realtime | towing: customer receives accept event | listen request:changed kind=assigned | event received | kind=assigned status=provider_assigned | **PASS** |
| API-188 | Requests | towing: provider sees customer contact after assignment | GET /requests/:id as assigned provider | 200 with customer name | HTTP 200, customer=QA Customer | **PASS** |
| API-189 | Provider | towing: provider/active returns the job | GET /requests/provider/active | 200 request.id = this job | HTTP 200, active=true | **PASS** |
| API-190 | Requests | towing: estimate uses road distance | check estimate lines | Base 1200 + distance*180 + 250 | lines=Base towing fee:1200 \| Distance charge (3.4 km):612 \| Service fee:250, total=2062 | **PASS** |
| API-191 | Lifecycle | towing: wrong-category status (fuel_delivered) | PATCH status=fuel_delivered at provider_arrived on a towing job | 400 | HTTP 400 "Invalid job status transition." | **PASS** |
| API-192 | Lifecycle | towing: reached_destination -> completed directly (spec flow) | vehicle_loaded -> reached_destination -> PATCH completed as customer | Spec: allowed. Code: requires service_finished first | HTTP 403 – server requires provider 'service_finished' before customer 'completed' (documented flow differs from spec, behaviour is consistent) | **PASS** |
| API-193 | Lifecycle | towing: service_finished after reached_destination | PATCH status=service_finished | 200 | HTTP 200 | **PASS** |
| API-194 | Realtime | towing: customer saw arrived + loaded + reached events | inspect customer socket | statuses provider_arrived, vehicle_loaded, reached_destination | seen=searching_provider,provider_assigned,provider_on_way,provider_arrived,vehicle_loaded,reached_destination,service_finished | **PASS** |
| API-195 | Review | towing: review before completion | PATCH /requests/:id/review before completed | 400 | HTTP 400 "Only completed requests can be reviewed" | **PASS** |
| API-196 | Lifecycle | towing: provider cannot mark completed | PATCH status=completed as provider | 403 – customer confirmation required | HTTP 403 "Customer confirmation is required after service finishes" | **PASS** |
| API-197 | Lifecycle | towing: customer confirms completion | PATCH status=completed as customer | 200 status=completed | HTTP 200, status=completed | **PASS** |
| API-198 | Lifecycle | towing: status change after completion | PATCH status=provider_on_way after completed | 400 already closed | HTTP 400 "This job is already closed." | **PASS** |
| API-199 | Payments | towing: cash payment selected and collected | POST /payments/request/:id {method:cash}; provider PATCH cash-collected | 200 pending -> paid | select HTTP 200 (pending), collect HTTP 200 (paid), invoice total=2062 | **PASS** |
| API-200 | Review | Two simultaneous reviews: only one is stored | Promise.all two PATCH /review on the towing job | one 200 and one 409; provider ratingCount=1 | statuses=200,409, ratingCount=1, ratingAvg=4 | **PASS** |
| API-201 | Requests | mechanic: create 'tyre' request | POST /api/requests category=mechanic issueCategory=tyre | 201 estimate 1250 (inspection 900 + visit 350) | HTTP 201, total=1250, cancel-before-assignment HTTP 200 -> cancelled | **PASS** |
| API-202 | Requests | mechanic: create 'brake' request | POST /api/requests category=mechanic issueCategory=brake | 201 estimate 1250 (inspection 900 + visit 350) | HTTP 201, total=1250, cancel-before-assignment HTTP 200 -> cancelled | **PASS** |
| API-203 | Requests | mechanic: create 'overheating' request | POST /api/requests category=mechanic issueCategory=overheating | 201 estimate 1250 (inspection 900 + visit 350) | HTTP 201, total=1250, cancel-before-assignment HTTP 200 -> cancelled | **PASS** |
| API-204 | Requests | mechanic: create 'general_inspection' request | POST /api/requests category=mechanic issueCategory=general_inspection | 201 estimate 1250 (inspection 900 + visit 350) | HTTP 201, total=1250, cancel-before-assignment HTTP 200 -> cancelled | **PASS** |
| API-205 | Requests | Second open request is refused with 409 + existing id | user2 creates a mechanic request, then a fuel request while the first is open | 201 then 409 {code:ACTIVE_REQUEST_EXISTS, requestId:<first id>}; only one open request stored | first HTTP 201, second HTTP 409 code=ACTIVE_REQUEST_EXISTS, requestId matches=true, open requests=1 | **PASS** |
| API-206 | Requests | Invalid booking still returns 400 while a request is open | user2 (with an open request) posts an invalid fuel request | 400 (validation runs before the open-request check) | HTTP 400 "fuelDetails.fuelType must be petrol or diesel" | **PASS** |
| API-207 | Requests | Booking allowed again after the open request is cancelled | cancel the open request, create a new one | 201 | new clientRequestId while open HTTP 409; after cancel HTTP 201 | **PASS** |
| API-208 | Lifecycle | Cancel an already-cancelled request | PATCH status=cancelled twice | No error and no change (idempotent no-op) or 400 | HTTP 200, status=cancelled, cancelled entries in timeline=1 (repeat of same status is a no-op) | **PASS** |
| API-209 | Lifecycle | Customer cannot re-open a cancelled request | PATCH status=searching_provider on cancelled request | 400/403 | HTTP 400 "This job is already closed." | **PASS** |
| API-210 | Dispatch | Cancelled request cannot be accepted | PATCH /accept on cancelled request | 409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-211 | Chat | Message on a cancelled, never-assigned request | POST messages on cancelled request | 400 | HTTP 400 "Chat is available after provider assignment" | **PASS** |
| API-212 | Requests | List my requests | GET /api/requests | 200, only my requests, newest first | HTTP 200, count=8, all mine=true, sorted=true | **PASS** |
| API-213 | Requests | Create mechanic (battery) request | POST /api/requests {"category":"mechanic","issueCategory":"battery"} | 201 status=searching_provider with estimate | HTTP 201, status=searching_provider, estimate=1250 PKR | **PASS** |
| API-214 | Realtime | mechanic (battery): customer socket receives request:changed after create | listen request:changed on customer socket | event for this request | kind=dispatch | **PASS** |
| API-215 | Dispatch | mechanic (battery): offer sent to the matching-category provider | poll GET /requests/open as the provider | request appears with dispatch.offerId within 30 s | offerId=9ec875ee… | **PASS** |
| API-216 | Realtime | mechanic (battery): provider socket receives the new-offer event | listen request:changed on provider socket | kind=offer | kind=offer | **PASS** |
| API-217 | Dispatch | mechanic (battery): wrong-category provider (fuel) does not see the request | GET /requests/open as other-category provider | request absent | visible=false | **PASS** |
| API-218 | Dispatch | mechanic (battery): wrong-category provider (fuel) cannot accept | PATCH /requests/:id/accept {offerId} as other provider | 409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-219 | Dispatch | mechanic (battery): wrong-category provider (tow) does not see the request | GET /requests/open as other-category provider | request absent | visible=false | **PASS** |
| API-220 | Dispatch | mechanic (battery): wrong-category provider (tow) cannot accept | PATCH /requests/:id/accept {offerId} as other provider | 409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-221 | Dispatch | mechanic (battery): customer cannot accept | PATCH /requests/:id/accept as customer | 403 | HTTP 403 "Provider account required" | **PASS** |
| API-222 | Dispatch | mechanic (battery): rejected mechanic cannot accept | PATCH /requests/:id/accept {offerId} as rejected mechanic | 403/409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-223 | Requests | mechanic (battery): offered provider can view request details | GET /requests/:id as offered provider | 200 | HTTP 200 | **PASS** |
| API-224 | Security | mechanic (battery): non-offered provider cannot view request details | GET /requests/:id as unrelated provider | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-225 | Chat | mechanic (battery): chat before assignment | POST /requests/:id/messages before accept | 400 Chat is available after provider assignment | HTTP 400 "Chat is available after provider assignment" | **PASS** |
| API-226 | Dispatch | mechanic (battery): provider accepts offer | PATCH /requests/:id/accept {offerId} | 200 status=provider_assigned, providerId set | HTTP 200, status=provider_assigned | **PASS** |
| API-227 | Realtime | mechanic (battery): customer receives accept event | listen request:changed kind=assigned | event received | kind=assigned status=provider_assigned | **PASS** |
| API-228 | Requests | mechanic (battery): provider sees customer contact after assignment | GET /requests/:id as assigned provider | 200 with customer name | HTTP 200, customer=QA Customer | **PASS** |
| API-229 | Provider | mechanic (battery): provider/active returns the job | GET /requests/provider/active | 200 request.id = this job | HTTP 200, active=true | **PASS** |
| API-230 | ExtraWork | Extra work before inspection_started | PATCH /requests/:id/extra-work at provider_assigned | 400 | HTTP 400 "Start the inspection before requesting extra work" | **PASS** |
| API-231 | ExtraWork | Customer cannot request extra work | PATCH extra-work as customer | 403 | HTTP 403 "Provider account required" | **PASS** |
| API-232 | ExtraWork | Extra work without description/part | PATCH extra-work {partPrice:100} | 400 | HTTP 400 "Extra work description or partName is required" | **PASS** |
| API-233 | ExtraWork | Mechanic requests extra work | PATCH /requests/:id/extra-work {partPrice:15000, laborCharge:500} | 200 status=extra_work_requested | HTTP 200, status=extra_work_requested | **PASS** |
| API-234 | Realtime | Customer receives extra-work event | listen request:changed kind=extra-work | event | received | **PASS** |
| API-235 | ExtraWork | Provider cannot approve own extra work | PATCH extra-work/approve as mechanic | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-236 | Lifecycle | Provider cannot skip pending extra-work approval | PATCH status=work_started while extra_work_requested | 400 | HTTP 400 "Invalid job status transition." | **PASS** |
| API-237 | ExtraWork | Customer approves extra work; price updated | PATCH extra-work/approve {approved:true} | 200 status=work_started, estimate.total 1250 -> 16750 | HTTP 200, status=work_started, total=16750 | **PASS** |
| API-238 | ExtraWork | Approve twice | PATCH extra-work/approve again | 400 already decided | HTTP 400 "This extra-work request was already decided or is unavailable" | **PASS** |
| API-239 | Review | mechanic A: review before completion | PATCH /requests/:id/review before completed | 400 | HTTP 400 "Only completed requests can be reviewed" | **PASS** |
| API-240 | Lifecycle | mechanic A: provider cannot mark completed | PATCH status=completed as provider | 403 – customer confirmation required | HTTP 403 "Customer confirmation is required after service finishes" | **PASS** |
| API-241 | Lifecycle | mechanic A: customer confirms completion | PATCH status=completed as customer | 200 status=completed | HTTP 200, status=completed | **PASS** |
| API-242 | Lifecycle | mechanic A: status change after completion | PATCH status=provider_on_way after completed | 400 already closed | HTTP 400 "This job is already closed." | **PASS** |
| API-243 | Payments | mechanic A: cash payment selected and collected | POST /payments/request/:id {method:cash}; provider PATCH cash-collected | 200 pending -> paid | select HTTP 200 (pending), collect HTTP 200 (paid), invoice total=16750 | **PASS** |
| API-244 | Payments | Invoice includes approved extra work | invoice total for mechanic A | 16750 | invoice total=16750 | **PASS** |
| API-245 | Requests | Create mechanic (engine) request | POST /api/requests {"category":"mechanic","issueCategory":"engine"} | 201 status=searching_provider with estimate | HTTP 201, status=searching_provider, estimate=1250 PKR | **PASS** |
| API-246 | Realtime | mechanic (engine): customer socket receives request:changed after create | listen request:changed on customer socket | event for this request | kind=dispatch | **PASS** |
| API-247 | Dispatch | mechanic (engine): offer sent to the matching-category provider | poll GET /requests/open as the provider | request appears with dispatch.offerId within 30 s | offerId=ae254641… | **PASS** |
| API-248 | Realtime | mechanic (engine): provider socket receives the new-offer event | listen request:changed on provider socket | kind=offer | kind=offer | **PASS** |
| API-249 | Dispatch | mechanic (engine): customer cannot accept | PATCH /requests/:id/accept as customer | 403 | HTTP 403 "Provider account required" | **PASS** |
| API-250 | Dispatch | mechanic (engine): rejected mechanic cannot accept | PATCH /requests/:id/accept {offerId} as rejected mechanic | 403/409 | HTTP 409 "This offer is no longer available to you." | **PASS** |
| API-251 | Requests | mechanic (engine): offered provider can view request details | GET /requests/:id as offered provider | 200 | HTTP 200 | **PASS** |
| API-252 | Security | mechanic (engine): non-offered provider cannot view request details | GET /requests/:id as unrelated provider | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-253 | Chat | mechanic (engine): chat before assignment | POST /requests/:id/messages before accept | 400 Chat is available after provider assignment | HTTP 400 "Chat is available after provider assignment" | **PASS** |
| API-254 | Dispatch | mechanic (engine): provider accepts offer | PATCH /requests/:id/accept {offerId} | 200 status=provider_assigned, providerId set | HTTP 200, status=provider_assigned | **PASS** |
| API-255 | Realtime | mechanic (engine): customer receives accept event | listen request:changed kind=assigned | event received | kind=assigned status=provider_assigned | **PASS** |
| API-256 | Requests | mechanic (engine): provider sees customer contact after assignment | GET /requests/:id as assigned provider | 200 with customer name | HTTP 200, customer=QA Customer | **PASS** |
| API-257 | Provider | mechanic (engine): provider/active returns the job | GET /requests/provider/active | 200 request.id = this job | HTTP 200, active=true | **PASS** |
| API-258 | ExtraWork | Customer rejects extra work; price unchanged | PATCH extra-work/approve {approved:false} | 200 status=inspection_started, total stays 1250 | HTTP 200, status=inspection_started, total=1250 | **PASS** |
| API-259 | ExtraWork | Extra-work decision rejected: approved:"false" (string) | PATCH extra-work/approve {"approved":"false"} | 400; extra work still pending, price unchanged | HTTP 400, status=extra_work_requested, extraWork=pending, total=1250 | **PASS** |
| API-260 | ExtraWork | Extra-work decision rejected: approved:"true" (string) | PATCH extra-work/approve {"approved":"true"} | 400; extra work still pending, price unchanged | HTTP 400, status=extra_work_requested, extraWork=pending, total=1250 | **PASS** |
| API-261 | ExtraWork | Extra-work decision rejected: approved missing | PATCH extra-work/approve {} | 400; extra work still pending, price unchanged | HTTP 400, status=extra_work_requested, extraWork=pending, total=1250 | **PASS** |
| API-262 | ExtraWork | Extra-work decision rejected: approved:1 | PATCH extra-work/approve {"approved":1} | 400; extra work still pending, price unchanged | HTTP 400, status=extra_work_requested, extraWork=pending, total=1250 | **PASS** |
| API-263 | ExtraWork | Extra-work decision rejected: approved:null | PATCH extra-work/approve {"approved":null} | 400; extra work still pending, price unchanged | HTTP 400, status=extra_work_requested, extraWork=pending, total=1250 | **PASS** |
| API-264 | ExtraWork | Boolean true approves the second extra-work request | PATCH extra-work/approve {approved:true} | 200 work_started, total 1250 + 2000 = 3250 | HTTP 200, status=work_started, total=3250 | **PASS** |
| API-265 | Lifecycle | mechanic: work_started -> service_finished | PATCH status=service_finished | 200 | HTTP 200 | **PASS** |
| API-266 | Review | mechanic B: review before completion | PATCH /requests/:id/review before completed | 400 | HTTP 400 "Only completed requests can be reviewed" | **PASS** |
| API-267 | Lifecycle | mechanic B: provider cannot mark completed | PATCH status=completed as provider | 403 – customer confirmation required | HTTP 403 "Customer confirmation is required after service finishes" | **PASS** |
| API-268 | Lifecycle | mechanic B: customer confirms completion | PATCH status=completed as customer | 200 status=completed | HTTP 200, status=completed | **PASS** |
| API-269 | Lifecycle | mechanic B: status change after completion | PATCH status=provider_on_way after completed | 400 already closed | HTTP 400 "This job is already closed." | **PASS** |
| API-270 | Payments | mechanic B: cash payment selected and collected | POST /payments/request/:id {method:cash}; provider PATCH cash-collected | 200 pending -> paid | select HTTP 200 (pending), collect HTTP 200 (paid), invoice total=3250 | **PASS** |
| API-271 | Dispatch | Race: only one provider holds an offer at a time | Two online mechanics; poll both /open | exactly one sees the request | offered to mechB; also visible to mech=false | **PASS** |
| API-272 | Dispatch | Race: two mechanics accept the same request concurrently | Promise.all accept from both mechanics (loser re-uses the leaked offerId) + duplicate accept by winner | winner 200, loser 409, request has exactly one provider | winner 200, loser 409, winner-duplicate 200, providerId=winner | **PASS** |
| API-273 | Lifecycle | Cancel after assignment (customer) | PATCH status=cancelled while provider_on_way | 200 cancelled, provider freed | HTTP 200, status=cancelled, provider active=null | **PASS** |
| API-274 | Realtime | Provider receives cancellation event | listen request:changed status=cancelled on winner socket | event | received | **PASS** |
| API-275 | Dispatch | Provider declines an offer | PATCH /requests/:id/decline {offerId} | 200, request back to searching | HTTP 200, status=searching_provider, dispatch.state=searching | **PASS** |
| API-276 | Provider | Mechanic history lists completed + cancelled jobs | GET /requests/provider/history as mechanic A | 2 completed (+ cancelled race job if mechanic A won) | HTTP 200, completed=2 (expected 2), cancelled=0 | **PASS** |
| API-277 | Provider | Earnings correct (fuel) | GET /requests/provider/earnings | total = sum(invoice total - service fee) of cash-collected jobs; completedJobs matches | total=3200 (expected 3200), today=3200, week=3200, completedJobs=1, paidJobs=1 | **PASS** |
| API-278 | Provider | Earnings correct (tow) | GET /requests/provider/earnings | total = sum(invoice total - service fee) of cash-collected jobs; completedJobs matches | total=1812 (expected 1812), today=1812, week=1812, completedJobs=1, paidJobs=1 | **PASS** |
| API-279 | Provider | Earnings correct (mech) | GET /requests/provider/earnings | total = sum(invoice total - service fee) of cash-collected jobs; completedJobs matches | total=20000 (expected 20000), today=20000, week=20000, completedJobs=2, paidJobs=2 | **PASS** |
| API-280 | Security | Customer cannot read provider earnings/history/active | GET provider/earnings, provider/history, provider/active as customer | 403 each | 403,403,403 | **PASS** |
| API-281 | Admin | Dashboard reflects completed work | GET /api/admin/dashboard | completedRequests >= 4, averageRating > 0, providerEarnings > 0 | completed=4, cancelled=10, avgRating=4.5, revenue=25412, providerEarnings=25012 | **PASS** |
| API-282 | Security | Every protected endpoint returns 401 without JWT | 23 endpoints, no Authorization / cookie | 401 each | all 23 -> 401 | **PASS** |
| API-283 | Security | Invalid ObjectId returns 400 (not 500) | 13 endpoints with id=not-an-id (customer / provider tokens) | 400 each, never 500 | all 400 | **PASS** |
| API-284 | Security | Unknown request id returns 404 | GET /api/requests/<random ObjectId> | 404 | HTTP 404 "Request not found" | **PASS** |
| API-285 | Security | Accept on a non-existent request | PATCH /api/requests/<random ObjectId>/accept as mechanic | 404/409 | HTTP 409 "Request is no longer available." | **PASS** |
| API-286 | Security | Wrong role: customer calls provider-only and admin-only endpoints | GET /requests/open, /mechanic-verification, /admin/providers as customer | 403 each | /api/requests/open=403, /api/mechanic-verification=403, /api/admin/providers=403 | **PASS** |
| API-287 | Security | IDOR: other customer reads payment/invoice of my job | GET /api/payments/request/:id as user2 | 403 | HTTP 403 "Forbidden" | **PASS** |
| API-288 | Security | Body larger than 12 MB | POST /api/auth/login with 13 MB JSON | 413 | HTTP 413 "Request is too large. Reduce image sizes and try again." | **PASS** |
| API-289 | Security | passwordHash / secrets never returned | Scanned every API response in this run for passwordHash, bcrypt hashes, googleId, faceDescriptor, providerEnrollment | 0 leaks | 0 leaks | **PASS** |

### Admin panel UI (Playwright)

| ID | Area | Use case | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| ADMIN-UI-001 | Admin UI | Login page renders | open http://localhost:5173/login | Email + password form | form visible=true, screenshot=screenshots/admin-01-login.png | **PASS** |
| ADMIN-UI-002 | Admin UI | Login with wrong password shows an error | submit wrong password | error message, stays on /login | error shown=true, url=http://localhost:5173/login, screenshot=screenshots/admin-02-login-error.png | **PASS** |
| ADMIN-UI-003 | Admin UI | Login with valid credentials | submit correct admin email/password | redirect to /dashboard | url=http://localhost:5173/dashboard | **PASS** |
| ADMIN-UI-004 | Admin UI | Dashboard loads stats from the API | wait for 'Operations overview' and compare pending-provider count with GET /api/admin/dashboard | stats rendered, numbers match API | banner shows "2 provider reviews pending"=true, completed=0, screenshot=screenshots/admin-03-dashboard.png | **PASS** |
| ADMIN-UI-005 | Admin UI | Provider verification page lists the pending provider | navigate Provider verification, filter=pending | new provider in list | listed, screenshot=screenshots/admin-04-providers-pending.png | **PASS** |
| ADMIN-UI-006 | Admin UI | Approve a pending provider from the UI | select provider -> click Approve | UI shows verified; GET /api/admin/providers?id= shows verified | API status=verified, screenshot=screenshots/admin-05-provider-approved.png | **PASS** |
| ADMIN-UI-007 | Admin UI | Reject a provider with a reason from the UI | select provider -> Reject -> enter reason in prompt | API shows rejected with reviewNote | status=rejected, note=Licence photo is unreadable | **PASS** |
| ADMIN-UI-008 | Admin UI | Verified filter shows the approved provider | click 'verified' filter | approved provider listed | listed, screenshot=screenshots/admin-06-providers-verified.png | **PASS** |
| ADMIN-UI-009 | Admin UI | Live jobs map page loads | navigate Live jobs map | page renders without API 5xx | rendered, api 5xx=0, screenshot=screenshots/admin-07-live-jobs.png | **PASS** |
| ADMIN-UI-010 | Admin UI | Request heatmap page loads | navigate Request heatmap | page renders without API 5xx | rendered, api 5xx=0, screenshot=screenshots/admin-08-heatmap.png | **PASS** |
| ADMIN-UI-011 | Admin UI | Logout returns to login and protects routes | click Sign out / Logout, then open /dashboard | redirect to /login | url after visiting /dashboard=http://localhost:5173/login | **PASS** |
| ADMIN-UI-012 | Admin UI | No uncaught JS errors on admin pages | collect pageerror events | 0 | 0 page errors; console errors=8 (Failed to load resource: the server responded with a status of 401 (Unauthorized) \| Failed to load resource: the server responded with a status of 401 (Unauthorized) \| Failed to load resource: the server responded with a status of 401 (Unauthorized)) | **PASS** |

### Mobile app – Expo Web (Playwright)

| ID | Area | Use case | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| MOBILE-WEB-001 | Customer | Welcome screen | open http://localhost:8081/ | Welcome screen with Get Started | welcome shown; url=/welcome; screenshot=screenshots/mobile-01-welcome-screen.png | **PASS** |
| MOBILE-WEB-002 | Customer | Sign up as customer | Get Started -> I need roadside help -> Next -> name/phone/password -> Create account | account created, lands on home | on home; url=/home; screenshot=screenshots/mobile-02-sign-up-as-customer.png | **PASS** |
| MOBILE-WEB-003 | Security | Web build keeps the JWT in localStorage | inspect localStorage after sign-up | Token only in the httpOnly cookie (not readable by scripts) | JWT readable from localStorage (XSS can steal the session) – src/auth/auth.storage.ts | **FAIL** |
| MOBILE-WEB-004 | Customer | Log out and log in again | clear session -> /login -> phone + password -> Sign in | home screen | wrong password showed an error; correct password reached home; url=/home; screenshot=screenshots/mobile-03-log-out-and-log-in-again.png | **PASS** |
| MOBILE-WEB-005 | Customer | Home screen | wait for services sheet | Tow Truck / Fuel / Mechanic tiles visible; nearby providers loaded | tiles visible; url=/home; screenshot=screenshots/mobile-04-home-screen.png | **PASS** |
| MOBILE-WEB-006 | Customer | Add vehicle | open vehicles -> Add vehicle form -> Car, Toyota Corolla 2018 -> Save vehicle | vehicle saved and listed; GET /api/vehicles has it | API vehicles=1; url=/vehicles; screenshot=screenshots/mobile-05-add-vehicle.png | **PASS** |
| MOBILE-WEB-007 | Customer | Create fuel delivery request (diesel 10 L) | Home -> Fuel -> Blue Area -> Confirm location -> Diesel, 10 Ltr -> Find providers | request created; tracking screen opens | request searching_provider, diesel 10 L, UI fare Rs 3,500, API total 3500; url=/request/6b069d34fb3d102d5e7a172a; screenshot=screenshots/mobile-06-create-fuel-delivery-request-diesel-10-l.png | **PASS** |
| MOBILE-WEB-008 | Customer | Tracking: provider accepts and is shown | fuel provider accepts via API; tracking screen updates in real time | provider name visible on tracking | accept HTTP 200; provider shown; url=/request/6b069d34fb3d102d5e7a172a; screenshot=screenshots/mobile-07-tracking-provider-accepts-and-is-shown.png | **PASS** |
| MOBILE-WEB-009 | Customer | Second booking while one is active shows a message | with the fuel job active: open Mechanic booking -> Blue Area -> Confirm -> Find providers | banner 'You already have an active request' + Open active request button that opens the fuel job; no new request stored | banner shown, button opened the fuel job; open requests=1; url=/request/6b069d34fb3d102d5e7a172a; screenshot=screenshots/mobile-08-second-booking-while-one-is-active-shows.png | **PASS** |
| MOBILE-WEB-010 | Customer | Chat with provider | Tracking -> Chat -> type message -> Send; provider replies via API | message stored on server; reply appears in UI | server messages: Hello from QA customer / Reply from QA provider; url=/request/6b069d34fb3d102d5e7a172a/chat; screenshot=screenshots/mobile-09-chat-with-provider.png | **PASS** |
| MOBILE-WEB-011 | Customer | Tracking shows live status changes | provider: arrived -> fuel_delivered -> service_finished (API); open tracking | UI reflects 'finished' state and offers confirmation |  Confirm Completion  Confirm fuel delivered Please check the delivered fuel before confirming.  Delivered quantity 10 Ltr Bill summary Diesel (10L) Rs. 2,900; url=/request/6b069d34fb3d102d5e7a172a; screenshot=screenshots/mobile-10-tracking-shows-live-status-changes.png | **PASS** |
| MOBILE-WEB-012 | Customer | Confirm completion, pay cash, review | tap the confirm/complete button; choose Cash; rate 5 stars | request completed; payment pending cash; review saved | status=completed; screen:  Completed  Thank you! Your service has been completed successfully. QW QA Web Fuel Rider Your service provider Diesel (10L) Rs. 2,900 Del; url=/request/6b069d34fb3d102d5e7a172a; screenshot=screenshots/mobile-11-confirm-completion-pay-cash-review.png | **PASS** |
| MOBILE-WEB-013 | Customer | Payment screen (cash) | open /request/<id>/pay -> Cash | cash selected; payment pending until provider confirms | payment=cash/pending, invoice total=3500; url=/request/6b069d34fb3d102d5e7a172a/pay; screenshot=screenshots/mobile-12-payment-screen-cash-.png | **PASS** |
| MOBILE-WEB-014 | Customer | Review screen | open /request/<id>/review -> 5 stars -> comment -> Submit | review saved via API | review={"rating":5,"comment":"Quick diesel delivery"}; url=/request/6b069d34fb3d102d5e7a172a/review; screenshot=screenshots/mobile-13-review-screen.png | **PASS** |
| MOBILE-WEB-015 | Customer | Create towing request | Home -> Tow Truck -> Blue Area -> Confirm pickup -> G-9 Markaz -> Confirm drop-off -> Find providers | request created with destination; tracking opens | UI fare Rs 1,630 vs server total 1630 (same route distance fed to both), destination=Islamabad Model School G-7/3, Street 4, G-7; url=/request/6b069d53fb3d102d5e7a1858; screenshot=screenshots/mobile-14-create-towing-request.png | **PASS** |
| MOBILE-WEB-016 | Customer | Cancel towing request before assignment | Tracking -> Cancel request -> confirm | status=cancelled | status=cancelled; url=/request/6b069d53fb3d102d5e7a1858; screenshot=screenshots/mobile-15-cancel-towing-request-before-assignment.png | **PASS** |
| MOBILE-WEB-017 | Customer | Create mechanic request (battery) | Home -> Mechanic -> Blue Area -> Confirm -> Battery -> Find providers | request created with issueCategory=battery | issue=battery, total=1250; url=/request/6b069d5afb3d102d5e7a1894; screenshot=screenshots/mobile-16-create-mechanic-request-battery-.png | **PASS** |
| MOBILE-WEB-018 | Customer | Reject extra work from the app | mechanic accepts + starts inspection + requests extra work (API) -> customer taps Reject | server: extraWork rejected, back to inspection_started, total unchanged | status=inspection_started, extraWork=rejected, total=1250; url=/request/6b069d5afb3d102d5e7a1894; screenshot=screenshots/mobile-17-reject-extra-work-from-the-app.png | **PASS** |
| MOBILE-WEB-019 | Customer | Approve extra work from the app | mechanic requests extra work again (API) -> customer taps Approve & Continue | server: extraWork approved, work_started, total 1250 + 5000 | status=work_started, extraWork=approved, total=6250; url=/request/6b069d5afb3d102d5e7a1894; screenshot=screenshots/mobile-18-approve-extra-work-from-the-app.png | **PASS** |
| MOBILE-WEB-020 | Customer | History / Requests tab | open Requests tab -> History | lists the fuel (completed), towing and mechanic (cancelled) requests | My Requests Active History Payments  Mechanic Service Blue Area, Islamabad Cancelled Nov 25, 1:33 PM Rs. 6,250  Car Towing Blue Area, Islamabad Cancelled Nov 25, 1:33 PM Rs. 1,630  Fuel Delivery Bl; url=/requests; screenshot=screenshots/mobile-19-history-requests-tab.png | **PASS** |
| MOBILE-WEB-021 | Customer | Payments tab | Requests -> Payments | fuel payment (cash) listed | My Requests Active History Payments PKR 3,500 Cash • Nov 25, 1:33 PM Pending   Home   Requests   Support   Profile; url=/requests; screenshot=screenshots/mobile-20-payments-tab.png | **PASS** |
| MOBILE-WEB-022 | Customer | Profile / Account | open Profile tab | name and phone shown | Profile QW QA Web Customer 033355391701 Customer  Language English اردو Labels without a translation stay in English. Messages from the server are in English f; url=/account; screenshot=screenshots/mobile-21-profile-account.png | **PASS** |
| MOBILE-WEB-023 | Customer | Log out | Profile -> Log out / Sign out | back to welcome/login; protected page redirects | after visiting /home: /login; url=/login; screenshot=screenshots/mobile-22-log-out.png | **PASS** |
| MOBILE-WEB-024 | Provider | Sign up as provider (mechanic) | Welcome -> Register as a Service Provider -> Continue with Phone -> Car Mechanic -> details -> upload workshop photo + certificate -> Fetch location -> Continue to identity verification | account created with verificationStatus=pending | status=pending, docs stored=true, location captured=true; url=/verification; screenshot=screenshots/mobile-23-sign-up-as-provider-mechanic-.png | **PASS** |
| MOBILE-WEB-025 | Provider | Verification screen | identity verification screen (selfies + CNIC) | camera/CNIC capture form with consent; submission needs AWS |  Identity verification  Service  Account  Documents Identity Review Biometric consent RapidAssist compares your selfie with the portrait on your CNIC, checks that your three se; url=/verification; screenshot=screenshots/mobile-24-verification-screen.png | **PASS** |
| MOBILE-WEB-026 | Provider | Unverified provider cannot go online | Dashboard -> Online status toggle while pending | toggle disabled or server refuses | toggle disabled=true, server isOnline=false; url=/dashboard; screenshot=screenshots/mobile-25-unverified-provider-cannot-go-online.png | **PASS** |
| MOBILE-WEB-027 | Provider | Admin approval reaches the app | admin approves via API (seeded submission) -> reload dashboard | dashboard no longer asks for verification | admin approve HTTP 200; screen: Hello, QA 👋 Offline  Go online to share your area  Completed jobs 0 All time  Earnings Rs. 0 Today  Rating New 0 reviews  This week Rs; url=/dashboard; screenshot=screenshots/mobile-26-admin-approval-reaches-the-app.png | **PASS** |
| MOBILE-WEB-028 | Provider | Go online from dashboard | tap Online status toggle | server isOnline=true with fresh location | online at 33.7128,73.0630; url=/dashboard; screenshot=screenshots/mobile-27-go-online-from-dashboard.png | **PASS** |
| MOBILE-WEB-029 | Provider | Incoming job offer and accept | customer creates mechanic request (API) -> offer appears in app -> Accept | request assigned to this provider | status=provider_assigned; url=/job/6b069d85fb3d102d5e7a19df; screenshot=screenshots/mobile-28-incoming-job-offer-and-accept.png | **PASS** |
| MOBILE-WEB-030 | Provider | Job detail: Start Navigation | tap "Start Navigation" | status=provider_on_way | status=provider_on_way; url=/job/6b069d85fb3d102d5e7a19df; screenshot=screenshots/mobile-29-job-detail-start-navigation.png | **PASS** |
| MOBILE-WEB-031 | Provider | Job detail: I've Arrived | tap "I've Arrived" | status=provider_arrived | status=provider_arrived; url=/job/6b069d85fb3d102d5e7a19df; screenshot=screenshots/mobile-30-job-detail-i-ve-arrived.png | **PASS** |
| MOBILE-WEB-032 | Provider | Job detail: Start Inspection | tap "Start Inspection" | status=inspection_started | status=inspection_started; url=/job/6b069d85fb3d102d5e7a19df; screenshot=screenshots/mobile-31-job-detail-start-inspection.png | **PASS** |
| MOBILE-WEB-033 | Provider | Request extra work | Request Extra Work -> findings, part, price 4000, labour 500 -> Send for Approval; customer approves (API) | extra_work_requested, then work_started with total 1250+4500 | after send status=extra_work_requested; after approval status=work_started, total=5750; url=/job/6b069d85fb3d102d5e7a19df; screenshot=screenshots/mobile-32-request-extra-work.png | **PASS** |
| MOBILE-WEB-034 | Provider | Chat with customer | open /job/<id>/chat -> send; customer replies (API) | messages delivered both ways | On site now / Thanks, see you; url=/job/6b069d85fb3d102d5e7a19df/chat; screenshot=screenshots/mobile-33-chat-with-customer.png | **PASS** |
| MOBILE-WEB-035 | Provider | Finish job and confirm cash | job screen -> Mark as Completed (service_finished); customer confirms + selects cash (API); provider taps Confirm cash collected | completed and cash paid | after Mark as Completed=service_finished, payment=paid; url=/job/6b069d85fb3d102d5e7a19df; screenshot=screenshots/mobile-34-finish-job-and-confirm-cash.png | **PASS** |
| MOBILE-WEB-036 | Provider | Jobs tab | open Jobs tab | completed job listed | My Jobs Job history  Mechanic Service Blue Area, Islamabad Completed Nov 25, 1:34 PM Rs. 5,750   Dashboard   Jobs   Earnings   5 Inbox   Profile; url=/jobs; screenshot=screenshots/mobile-35-jobs-tab.png | **PASS** |
| MOBILE-WEB-037 | Provider | Earnings tab | open Earnings | shows Rs 5,750 (1250 + 4500, no service fee on mechanic jobs) matching /provider/earnings | API total=5750; UI shows 5,750=true; url=/earnings; screenshot=screenshots/mobile-36-earnings-tab.png | **PASS** |
| MOBILE-WEB-038 | Provider | Profile tab | open Profile | provider name + service shown | Profile QW QA Web Provider 034555391702 Mechanic service provider  Verification: Approved Your verification is complete. You can go on duty and accept service ; url=/profile; screenshot=screenshots/mobile-37-profile-tab.png | **PASS** |
| MOBILE-WEB-039 | Provider | Provider log out | Profile -> Log out | back to login | /welcome; url=/welcome; screenshot=screenshots/mobile-38-provider-log-out.png | **PASS** |

## 2. Bugs (sorted by severity)

Status after the fix round: B1–B3 fixed (see above); B4–B7 open. No **Critical** bugs were found: authentication, role checks, IDOR protection, dispatch races, status transitions and
payments all behaved correctly.

| # | Severity | Bug | Where | Evidence | Suggested fix |
|---|---|---|---|---|---|
| B1 | ~~High~~ **Fixed** | A customer can review the same job any number of times; each call overwrites the rating, so a provider's `ratingAvg` can be changed after the fact (5 → 1 in the test). | `server/src/controllers/requests.controller.js:713` (`submitRequestReview`) | API-167 | Reject when `request.review?.rating` exists (409), or write atomically with `findOneAndUpdate({ _id, userId, status: "completed", "review.rating": null }, …)`. |
| B2 | ~~Medium~~ **Fixed** | Extra-work decision is parsed with `Boolean(req.body?.approved ?? true)`: the string `"false"` **approves** (and charges) the extra work, and a missing field also approves. The mobile app sends a real boolean, so this affects other API clients. | `server/src/controllers/requests.controller.js:966` | API-250 (`approved:"false"` → status approved, total +2000) | Require `typeof approved === "boolean"`, else 400. Never default to approval. |
| B3 | ~~Medium~~ **Fixed** | A customer can have unlimited simultaneous open requests (3 created back-to-back in the test). Each one goes through dispatch, so a single account can tie up nearby providers with offers. | `server/src/controllers/requests.controller.js:375` (`createRequest`) | API-198 | Before creating, refuse with 409 if the customer already has a request whose status is not completed/cancelled (the `clientRequestId` retry path already returns the existing request). |
| B4 | **Low** | Passwords only need 6 characters; `123456` is accepted. | `server/src/routes/auth.routes.js:240` | API-014 | Minimum 8 characters, at least one letter and one digit, and reject a short list of common passwords. Mirror the rule in `mobile-app/src/auth/signup/DetailsStep.tsx`. |
| B5 | **Low** | Phone numbers are only length-checked, so `abcdefghijk` registers. Providers and customers call each other on this number. | `server/src/routes/auth.routes.js:239` (also `:297`) | API-015 | Normalise and validate a Pakistani mobile, e.g. `/^(\+92|0)3\d{9}$/`, and store it in one canonical form. |
| B6 | **Low** | Provider accounts can create, list and delete vehicles; there is no role check (providers have no vehicle screen). | `server/src/controllers/vehicles.controller.js:32` (all handlers) | API-050 | `if (req.authRole !== "user") throw forbidden("Customer account required")` in each handler, or `requireRole("user")` on the router. |
| B7 | **Low (dev setup)** | `mobile-app/.env` hard-codes `EXPO_PUBLIC_API_URL=http://192.168.0.116:4001` (a LAN IP that is no longer this machine), and `admin-panel/.env.development.local` points at port 4001. The Expo **dev web bundle reads this value from `.env` even when the shell variable is set or `EXPO_NO_DOTENV=1`**, so Expo Web cannot reach a local API without editing the file. | `mobile-app/.env`, `admin-panel/.env.development.local` | QA harness had to reroute the browser's API calls | Leave `EXPO_PUBLIC_API_URL` empty in `.env` for development (`src/config/api.ts` then derives `http://<host>:EXPO_PUBLIC_DEV_API_PORT`), and keep machine-specific values in `.env.local`. |

### Behaviour that differs from the test specification (not bugs)

- **Towing lifecycle**: the spec lists `reached_destination → completed`. The server requires the provider to send
  `service_finished` first, then the **customer** confirms `completed` (same for fuel and mechanic jobs). This is consistent and deliberate (API-186).
- **Mechanic lifecycle**: `extra_work_requested` is reached through `PATCH /:id/extra-work`, not `PATCH /:id/status`;
  `inspection_started → work_started` is also allowed directly when no extra work is needed.
- **Admin routes are authenticated** in this branch (`router.use(...requireAdmin)` in `server/src/routes/admin.routes.js:22`),
  so the tests log in through `POST /api/auth/admin/login`. This is *not* reported as a problem.
- **Repeating the current status** (e.g. cancelling an already-cancelled request) returns 200 as a no-op without adding a
  timeline entry. That's idempotent and fine.
- **Approving a provider requires a submitted verification** (`409 A mechanic submission is required…`). Submissions go
  through AWS, so the tests seeded the "awaiting review" state in the database and then used the real admin API/UI to approve or reject.

## 3. Security findings

| # | Severity | Finding | Where | Suggested fix |
|---|---|---|---|---|
| S1 | ~~Medium~~ **Fixed** | **JWT still valid after logout.** Logout only clears the cookie; a copied bearer token keeps working for up to `JWT_EXPIRES_IN` (7 days). | `server/src/routes/auth.routes.js:485`, `server/src/utils/jwt.js:5` | Add a `tokenVersion` (or `sessionsRevokedAt`) on the user, put it in the JWT, check it in `readSession`, bump it on logout/password change. Shorter expiry (e.g. 1 day). |
| S2 | **Medium (open)** | **Web build stores the JWT in `localStorage`** as well as the httpOnly cookie, so any XSS on the web app can steal the session. | `mobile-app/src/auth/auth.storage.ts:19` | On `Platform.OS === "web"` rely on the httpOnly cookie (`withCredentials` is already on) and don't persist the token in JS-readable storage. |
| S3 | Low | Review overwrite (B1) and string-boolean approval (B2) are also integrity issues: ratings can be manipulated and a crafted request can approve a charge. | see B1, B2 | see B1, B2 |
| S4 | Low | No limit on concurrent requests per customer (B3) enables dispatch spam. | see B3 | see B3 |

**Security checks that passed** (details in the API table): 401 on all 23 protected endpoints without a JWT; tampered and
`alg=none` tokens rejected; wrong role → 403 (customer → provider/admin endpoints, provider → customer endpoints); IDOR blocked
for requests, vehicles, chat, payments and reviews; 13 endpoints return 400 (never 500) for an invalid ObjectId; NoSQL
injection (`{"$ne":null}`) rejected in login, admin login and register; mass-assignment on register ignored;
**no `passwordHash`, bcrypt hash, `googleId` or `faceDescriptor` in any response**; CORS rejects untrusted origins;
13 MB body → 413; Socket.io rejects connections without a token, and an outsider socket received no events for other
customers' requests; nearby-provider search returns only approximate (~500 m grid) locations.

## 4. What could not be tested and why

| Area | Why | What was done instead |
|---|---|---|
| Provider identity verification submit (selfies + CNIC → `POST /api/mechanic-verification`) | Uses AWS S3 + Rekognition and a live camera; the QA run must not upload to the real bucket. The endpoint correctly returns 503 when storage is unavailable. | Seeded `mechanicVerification.reviewState = awaiting_review` in MongoDB, then approved/rejected through the real admin API and admin UI. The verification screen was opened and screenshotted. |
| Native-only features: Android maps (react-native-maps / Google Maps), background location, push notifications, the native camera | Need an Android device or emulator | The Web map (OSM/CARTO canvas) rendered on home, booking, tracking and admin live-jobs/heatmap pages. |
| Stripe card payments | Need Stripe test keys + webhook listener (`STRIPE_*` deliberately blank) | Cash payment and cash-collection were tested end to end; Stripe's own unit tests run in `server npm test`. |
| Google sign-in | Needs a real Google ID token and an allowed OAuth origin | Phone/password sign-in tested; the Google button renders. |
| AI features (Groq diagnostic assist, CLIP photo suggestion, face models) | External key / large models (`AI_PRELOAD=false`) | Not exercised in the UI; the server's unit tests cover them. |
| Public OSRM / Photon routing and geocoding | External services | Server routing used a local OSRM stub; the browser's OSRM calls were answered by an identical stub, so the UI towing fare and server total were compared like for like (they match). Photon reverse geocoding ran live. |
| Login rate limiting (30 attempts / 15 min per IP) | Triggering it would lock out the rest of the run | Not tested. |

## 5. Dummy / hard-coded data check

- `mobile-app/src/services/dummyApi.ts` **no longer exists**. It was removed in commit `44dfa2f` ("phase 0 cleanup for redesign") and nothing imports it.
- A search for `mock|fake|dummy|sample` in `mobile-app/app`, `mobile-app/src` and `admin-panel/src` only finds comments mentioning design mockups
  (`src/requests/customer/shared.tsx:53`, `src/design/components/*.tsx`). Every screen tested reads live API data
  (fares, provider names, chat, history, payments and earnings all matched the API).
- `app/(dev)/kit.tsx` and `app/(dev)/map-foundation.tsx` are developer screens; `app/(dev)/_layout.tsx` redirects them away when `!__DEV__`.
- Seeded demo providers (`providerState.isDemo`, `npm run demo:up`) are shown on the map but never offered jobs, which is by design.
