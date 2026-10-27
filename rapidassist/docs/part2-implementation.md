# RapidAssist Part 2

The active implementation uses `server/`, `mobile-app/`, and `admin-panel/`. The older `RA/server/` is not part of this flow.

## Required server environment

Copy the variables from `server/.env.example` into `server/.env`. Set a private admin password of at least ten characters:

```env
ADMIN_EMAIL=admin@rapidassist.pk
ADMIN_PASSWORD=choose-a-private-password
ADMIN_PHONE=admin-system
ADMIN_NAME=RapidAssist Admin
```

The server creates or updates this admin account at startup. Admin API routes reject customer and provider sessions.

## Native development build

Background provider tracking and remote push notifications require a native development build. Configure the Expo project once:

```bash
cd mobile-app
npx eas-cli init
npx eas-cli build --profile development --platform android
```

`eas init` adds the Expo project ID used by push-token registration. Android package and iOS bundle identifiers are `com.rapidassist.app`. Change them before initialization if that identifier is not appropriate for the final project.

## Implemented flows

- Batch dispatch jointly optimizes all pending, unexpired searches and available providers with a minimum-cost-flow solver. It uses request priority, accumulated waiting time, and provider-to-customer road travel time while enforcing category, radius, availability, and one-offer-per-provider constraints.
- The worker collects requests on a shared 2-second interval. Creation and retry return `searching`; declines release the provider and leave reassignment to the next round. Provider online/free events are also picked up on that round. Requests arriving before the same tick compete together; a request normally waits up to 2 seconds plus routing/database time. Accepted jobs and valid offers stay frozen. Legacy per-request retry timestamps do not exclude urgent work.
- OSRM Table supplies the road-time matrix. A failed OSRM call uses a marked Haversine fallback; a pair for which OSRM reports no route is excluded. Each offer records its batch, priority, ETA, route source, assignment cost, distance baseline, outcome, and response time.
- Providers are atomically reserved while an offer is live. Acceptance converts that reservation into an active job; decline, expiry, cancellation, offline status, and restart recovery release it safely.
- Reconciliation recognizes an in-flight acceptance when the provider has claimed the same request but its request update has not yet completed. Real expiry and cancellation still invalidate the offer; abandoned claims remain recoverable.
- Foreground GPS runs while a provider is online. Background GPS runs during an active job and stops when no job is active. Older GPS samples are rejected by the API.
- Customers and providers receive Socket.IO updates; persisted notifications and Expo push cover background/offline delivery. Chat messages are persisted and deduplicated with client message IDs.
- Completed jobs generate an immutable invoice. Cash remains pending until the provider confirms collection. Simulated online payment supports explicit success, failure, and safe retry.
- Provider earnings and admin revenue use paid payment records. Estimates and failed payments do not count as collected revenue.
- Active jobs are cached locally, reads retry temporary network failures, and the UI displays an offline banner.

## Demo order

1. Start MongoDB and `server/`.
2. Start the admin panel and sign in with the configured admin account.
3. Open customer and provider accounts on two devices.
4. Verify the provider, go online, and create a customer request.
5. Accept the ranked offer, open the admin live map, and move the provider device.
6. Demonstrate chat, extra-work approval, completion, failed-payment retry, invoice export, and revenue update.

OSRM and CARTO/OpenStreetMap resources require internet access during the demo. Route ETA is an estimate without live traffic data.
