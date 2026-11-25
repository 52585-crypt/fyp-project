# Atlas rollout checklist (maps, nearby providers, live tracking)

How to move the twin-cities map work (Phases 1–5) onto the production MongoDB Atlas database.
Nothing in this file has been run against Atlas. Every command below is for you to run, in order, after reading
its dry-run output.

All maintenance scripts share one guard (`server/scripts/lib/scriptDatabase.js`). They use the local dev database
unless told otherwise, and they refuse any non-local host without `--allow-remote`. Two ways to point them at Atlas:

- `--production-env` reads `MONGODB_URI` from `server/.env` (the production settings), or
- `--uri="mongodb+srv://…"` gives the connection string directly (quote it in the shell).

The examples use `--production-env`. Run them from `rapidassist/server`.

## 0. Before you start

- [ ] Take an Atlas backup or snapshot (Atlas UI → Cluster → Backup), so a bad step can be undone.
- [ ] Check that the Atlas network access list allows the machine you run the scripts from.
- [ ] Deploy the server build that contains these phases. Scripts and server must be the same version.
- [ ] `git log` shows the Phase 3–5 commits on the branch you deploy.

## 1. Server environment variables

Set these on the production server (hosting dashboard or `server/.env`). Never commit them.

| Variable | Needed for | Notes |
|---|---|---|
| `MONGODB_URI` | everything | `mongodb+srv://<user>:<password>@<cluster>/<db>`; the database user needs readWrite on that database |
| `NODE_ENV` | everything | `production` |
| `JWT_SECRET` | auth | long random string, different from dev |
| `CORS_ORIGIN` | app/admin on the web | exact origins, comma-separated (production refuses wildcards) |
| `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE` | admin cookie login | `true` and `none` when the admin panel is on a different site than the API over HTTPS |
| `STRIPE_SECRET_KEY` | card payments | `sk_test_…` for the FYP demo; `sk_live_…` only once live payments are approved |
| `STRIPE_WEBHOOK_SECRET` | payment confirmation | `whsec_…` from the webhook endpoint in step 6 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_IDS` | Google sign-in | as in dev, with the production OAuth clients |
| `NEARBY_PROVIDERS_RATE_LIMIT_PER_MINUTE` | optional | default 60 per user per minute |
| `PROVIDER_LOCATION_RATE_LIMIT_PER_MINUTE` | optional | default 30 per user per minute |
| `OSRM_ROUTE_URL`, `OSRM_TABLE_URL` | optional | defaults to the public OSRM demo server; set these if you host your own |
| `DISABLE_PUSH` | optional | leave unset in production (`true` turns off Expo push) |

Do not set `DISPATCH_TEST_BYPASS_RADIUS` or `DISPATCH_DEBUG` in production.

## 2. Check indexes (dry run)

```bash
node scripts/checkIndexes.js --production-env --allow-remote
```

This prints the target (credentials hidden), then any missing indexes, indexes whose options differ, and indexes
the code does not declare. It changes nothing. Expect at least:

- `users: {"providerState.locationPoint":"2dsphere"}`, if the 2dsphere index was never built on Atlas;
- `users: … (online_providers_by_fix_time)`, the partial index for online providers (new in Phase 5).

"Differing options" and "not declared in code" lines are reported only. The script never drops or rebuilds an
index; look into those by hand if any appear.

## 3. Backfill provider location points (dry run, then apply)

Nearby search uses `providerState.locationPoint` (GeoJSON). Providers saved before Phase 2 have only
`currentLocation`.

```bash
node scripts/migrateProviderLocationPoints.js --production-env --allow-remote          # dry run: how many users would change
node scripts/migrateProviderLocationPoints.js --production-env --allow-remote --apply  # write
```

It is idempotent: running it again skips users whose point already matches. `--apply` also makes sure the
2dsphere index exists.

## 4. Create missing indexes

```bash
node scripts/checkIndexes.js --production-env --allow-remote --apply
node scripts/checkIndexes.js --production-env --allow-remote          # should now report "Missing indexes: 0"
```

The server also builds declared indexes when it starts, and builds the one-pending-offer index explicitly
(`services/pendingOfferIndex.js`). Running the script first means a failure shows up here, not silently at startup.

## 5. Demo providers: do NOT seed them in production

`scripts/seedDemoProviders.js` creates 18 fake providers ("Demo Mechanic · Blue Area", …). They are never offered
real jobs, but customers would see them on the map and in the provider list. Use them only on the local dev
database, for demos.

If they ever reached Atlas, remove them (dry run first is not available for this script, so double-check the
target line it prints):

```bash
node scripts/seedDemoProviders.js --production-env --allow-remote --remove
```

## 6. Stripe

1. Stripe Dashboard → Developers → Webhooks → add endpoint
   `https://<your-api-host>/api/payments/stripe/webhook` with the payment events the server handles
   (see `server/src/routes/stripeWebhook.js`).
2. Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Keep test keys (`sk_test_…` / `pk_test_…`) for the FYP demo; test card `4242 4242 4242 4242`, any future date,
   any CVC.

## 7. App and admin build settings

| Variable | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | mobile app | must be an `https://` origin for release builds (the app refuses anything else) |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | mobile app | `pk_test_…` matching the server's secret key |
| `EXPO_PUBLIC_CARTO_BASEMAP_API_KEY` | mobile app | base map tiles (OSM tile canvas) |
| `GOOGLE_MAPS_ANDROID_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` | mobile app | optional; without them the OSM tile canvas is used |
| `VITE_API_BASE_URL` | admin panel | the production API origin |
| `VITE_CARTO_BASEMAP_API_KEY` | admin panel | base map for the heatmap and live jobs map |

## 8. Smoke test after deploy

- [ ] `GET /api/requests/nearby-providers?category=mechanic&lat=33.7104&lng=73.0563` as a customer → 200, and every
      provider has `approxLocation` and `distanceBand` but no exact coordinates or `distanceKm`.
- [ ] A provider goes online and shares a location → they appear on a customer's home map within 20 s.
- [ ] Book a request in Blue Area → dispatch offers it → accept → live tracking, ETA and the "provider is nearby"
      notification work.
- [ ] Card payment with `4242 4242 4242 4242` completes and the webhook marks it paid.
- [ ] Admin → Request heatmap loads.

## Rollback

- Code: redeploy the previous server build. The new fields (`providerNearbyNotifiedAt`, `locationPoint`) and
  indexes are additive and ignored by older code.
- Data: restore the snapshot from step 0 only if data was damaged. The scripts above only add fields and indexes.
