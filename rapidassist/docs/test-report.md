# Test report

Run on 2026-11-25 on branch `feature/twin-cities-live-map` (Linux, Node v22.22.1). Every number below is from that
run; each test file was also run on its own to get its count.

## Summary

| Area | Command | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Server (API, dispatch, payments) | `cd server && npm test` | 314 | 313 | 0 | 1 |
| Mobile app – node source tests | `cd mobile-app && npm run test:node` | 135 | 135 | 0 | 0 |
| Mobile app – Jest (11 suites) | `cd mobile-app && npx jest` | 102 | 102 | 0 | 0 |
| **Total** | | **551** | **550** | **0** | **1** |

Other checks in the same run: `npx tsc --noEmit` in mobile-app (no errors), `npm run lint` and `npm run build` in
admin-panel (pass; the admin panel has no unit tests), and the Android JavaScript bundle builds
(`npx expo export --dev --platform android`).

The one skipped test is "Stripe sandbox test cards with Stripe CLI forwarding". It is opt-in
(`RUN_STRIPE_CLI_TEST=1`) because it needs a Stripe sandbox key and a running `stripe listen`. The same flow was
checked by hand on the web (see "Manual verification").

## Server suites (`server/test`)

Most suites start a disposable in-memory MongoDB (mongodb-memory-server). None touch a real database.

| Suite | Tests | What it covers |
|---|---|---|
| dispatch | 71 | batch dispatch end to end: eligibility, 8 km radius, offers, expiry, accept/decline, location updates |
| matchingCost | 26 | smart-matching cost function terms and weights |
| hungarian | 21 | Hungarian assignment algorithm |
| smartMatching | 13 | smart matching behind the feature flag |
| googleAuth | 12 | Google sign-in for customers and providers |
| mechanicVerification | 11 | provider verification submissions, face checks, admin decisions |
| adminActivity | 10 | admin activity log |
| authSecurity | 10 | login, sessions, cookie and role security |
| pendingOffers | 10 | one pending offer per provider (unique index) and cleanup |
| smartBatch | 10 | smart batch rounds |
| nearbyProviders | 9 | nearby search; **privacy: no exact coordinates or distance**, grid snapping, distance bands |
| requestLifecycleRaces | 8 | concurrent status changes and races |
| errorHandling | 7 | error responses and messages |
| googleLocationPolicy | 7 | rules for Google-derived locations |
| adminFinance | 6 | payments, invoices, commission reports |
| adminHeatmap | 6 | heatmap: admin-only, ~1 km cell counts, filters, **no raw customer coordinates** |
| adminProviders | 6 | provider directory |
| aiApi | 6 | AI service suggestion endpoints |
| requestCustomerPrivacy | 6 | what customers and providers may see of each other |
| serviceSuggestion | 6 | service suggestion logic |
| adminCustomers | 5 | customer directory |
| adminRequests | 5 | request history for admins |
| assignmentSolver | 4 | min-cost assignment solver |
| locationInput | 4 | shared coordinate validation, and the routes rejecting bad coordinates |
| providerNearby | 4 | "provider is nearby" notification: 500 m rule, **exactly once**, even with racing updates |
| serviceArea | 4 | Islamabad/Rawalpindi bounds, same copy as the app, 400 outside the area |
| awsCheck | 3 | AWS configuration check script |
| benchmarkMatching | 3 | matching benchmark script |
| checkIndexes | 3 | index check script: dry run, apply only missing, never drop, remote guard |
| demoUp | 3 | demo setup: accounts sign in, idempotent, refuses remote databases |
| matchingExplanation | 3 | admin explanation of a match |
| requestRateLimits | 3 | 429 with message and Retry-After per user and per route |
| roadRouting | 3 | server-side road routing |
| stripePayments | 3 (1 skipped) | Stripe intents, signed webhooks, payment history |
| serviceSuggestionEvaluation | 2 | evaluation script |
| dispatchPriorityOrder | 1 | priority ordering in a batch |

## Mobile node suites (`mobile-app/test`)

These load TypeScript source files directly, with small mocks, and check pure logic.

| Suite | Tests | What it covers |
|---|---|---|
| errorHandling | 24 | user-facing error messages |
| googleSignIn | 11 | Google sign-in flow |
| networkReconnection | 11 | reconnect handling |
| mapLibreFoundation | 10 | map foundation helpers |
| customerSecurity | 9 | customer-side security checks |
| customerReliability | 8 | tracking reliability, including the live ETA retry after a straight-line fallback |
| mapPickerLegacy | 8 | legacy map picker |
| routing | 7 | OSRM route parsing and caching, **one OSRM table call for list ETAs** |
| locationAutocomplete | 6 | place search |
| mechanicVerification | 6 | verification screens' logic |
| serviceSuggestion | 6 | suggestion logic |
| coordinates | 5 | coordinate helpers |
| currentLocation | 5 | GPS permission, accuracy, the "approximate" rule |
| normalizedLocation | 5 | location normalisation |
| mapLibreAndroid | 4 | Android map setup |
| navigation | 3 | **Google Maps deep link and web fallback** |
| vehicleIssue | 3 | vehicle issue helpers |
| googleMaps | 2 | Google Maps availability |
| serviceArea | 2 | service-area check in the app |

## Mobile Jest suites (`mobile-app/src`)

| Suite | Tests | What it covers |
|---|---|---|
| requests/stages | 62 | request status → screen stage mapping |
| components/maps/mapHtmlSafety | 10 | map documents treat names as text (script injection attempts), marker taps, glide, camera rule, accuracy circle, planned route |
| components/maps/MapCanvas | 5 | marker tap parsing, accuracy radius, camera fitting |
| i18n/translate | 5 | **English and Urdu have the same keys and placeholders**, language switching, right-to-left detection, stored preference |
| components/maps/useGlidingMarkers | 4 | marker glide maths and bookkeeping |
| requests/liveEta | 4 | **live ETA from OSRM, straight-line fallback**, the 30 s throttle |
| requests/nearbyProviderMarkers | 4 | provider markers per service, list sorting |
| services/rateLimit | 3 | reading 429 Retry-After |
| requests/customer/liveMapContent | 2 | what the live map shows (towing trip, "Last known") |
| requests/nearbyPolling | 2 | offline backoff and message |
| requests/useProviderPreview | 1 | "about N min" label |

## Manual verification

Done during development with throwaway in-memory test servers (never a real database), headless Chrome on the Expo
web build, and the Android emulator (Pixel 10 Pro image, dev build).

| Feature | Web | Android emulator |
|---|---|---|
| Nearby provider markers, marker tap card, Request button | verified | verified (OSM tile canvas) |
| Map / List toggle | verified | verified |
| Blue dot and approximate accuracy circle | verified | blue dot only; a coarse GPS fix could not be simulated |
| Live ETA throttle (3 OSRM calls in 70 s) | verified | not verified |
| Marker glide, camera holding still | verified | not verified |
| "Provider is nearby" notification (exactly one) | verified | not verified |
| Navigate to pickup / drop-off | verified (web URL) | not verified (needs Google Maps on the device) |
| Towing view after loading | verified | verified |
| Zoom buttons below the top bar | n/a | verified |
| Rate-limit message and pause | verified | not verified |
| Offline banner and recovery | verified (Chrome offline mode) | not verified |
| Language switch, persistence, Urdu text right to left | verified | not verified |
| Stripe test card 4242… with webhook | verified (`payment_intent.succeeded`, webhook 200) | not verified |
| Admin heatmap | verified | n/a |

## Known limitations

- **Android is only partly verified.** See the table above. The react-native-maps and Google Maps JS renderers were
  not run at all, because no Google Maps keys are configured here; only the OSM tile canvas was exercised.
- **Server-sent text stays in English.** Messages that come from the server (rate-limit and validation errors,
  notification titles and bodies such as "Your provider is nearby") are not translated; only text produced in the
  app goes through English/Urdu. The Urdu dictionary covers the Phase 3–5 map features and the existing i18n
  entries, so most older screens are still English in Urdu mode.
- **Urdu layout is not mirrored.** Urdu text runs right to left and is right-aligned, but screens keep their
  left-to-right layout. Mirroring needs a native restart (a new dependency) and would also flip the map controls.
- **OSRM is the free public demo server.** ETAs depend on it; when it fails, a straight-line estimate at 30 km/h is
  shown instead (marked "About" / "~").
- **Rate limits are in memory per server process.** Several API instances would each count separately; a shared
  store (e.g. Redis) would be needed for that.
- **Push notifications were not tested on a device**; they were checked through the in-app inbox and socket only.
- **The admin map tiles need a CARTO key** (`VITE_CARTO_BASEMAP_API_KEY`); without it the base map shows "API key
  required" tiles, though the data overlays still draw.
- **Parallel server tests can time out on a busy machine.** `npm test` starts about 30 in-memory MongoDB servers at
  once. On a heavily loaded laptop some can fail to start within 10 s, or fill `/tmp`. The fix is to free memory or
  delete stale `/tmp/mongo-mem-*` folders and run again; `node --test --test-concurrency=1 test/*.test.js` is a slower
  alternative. These were environment failures, not code failures.
- **The Stripe CLI sandbox test is opt-in** (skipped unless `RUN_STRIPE_CLI_TEST=1`).
