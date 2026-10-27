# Error handling audit

Scope: the active `server/`, `mobile-app/`, and `admin-panel/` applications. As documented in `part2-implementation.md`, `RA/server/` is an older implementation outside the active app flow.

## Server

- Central JSON responses for unknown endpoints, malformed JSON, oversized uploads, invalid database values, duplicate keys, stale document versions, and database connectivity failures.
- Internal server errors are logged on the server, with a generic message returned to clients. Errors after headers are sent are delegated to Express.
- Invalid or expired credentials return 401. Database failures during authentication retain their server-error classification instead of incorrectly invalidating the session.
- Startup catches HTTP port binding failures; push delivery has a bounded timeout.
- Simulated payment retries recover when an attempt was saved but its payment status update failed. Reused submission IDs with different payment details return 409. Paid payments cannot be downgraded, and cash collection confirmation can be safely retried.
- Invoice/payment duplicate-key recovery propagates the original error if the expected concurrent record does not exist.

## Mobile

- One shared Axios client preserves error instances and supplies readable connection, timeout, rate-limit, and server-outage messages. Regular requests time out after 15 seconds; registration retains 60 seconds for document photos.
- Only GET network failures receive one automatic retry. Canceled requests, timeouts, and writes are not automatically retried.
- Session restoration retains credentials during outages and offers a retry screen. Token storage failures are reported, and session-cleanup failures cannot leave an unhandled promise.
- Logout failures, photo-library failures, notification read actions, and PDF export failures have visible feedback. Invoice and notification screens distinguish failed loading from empty data.
- Cached job reads/writes/removals cannot reject live job operations. Invalid cached jobs are ignored, and a late cache read cannot overwrite an already received live response.
- Background location errors are caught; location search has a timeout and validates the upstream collection shape.
- Payment and chat retries reuse their submission IDs for the same pending action while the screen remains mounted. Payment records also enforce one payment per request on the server.
- A root React error boundary offers recovery from render failures. The offline banner no longer promises that failed writes will automatically replay.

## Admin

API calls have a timeout and readable network messages. Session-check outages offer retry; failed logout keeps the current session visible and displays the error.

## Verification

- `cd server && npm test`: 35 tests, including real isolated MongoDB dispatch/payment flows and new API failure regressions.
- `cd mobile-app && npm test`: 11 focused cases using the actual TypeScript modules with simulated network/native dependencies. Covers cancellation, bounded retries, storage/cache failures, session recovery and location-search errors.
- `cd mobile-app && npm run typecheck`.
- Expo web production export.
- `cd admin-panel && npm run lint` and `npm run build`.

Native camera/library permission prompts, SecureStore behavior on actual hardware, background GPS, push delivery and the OS PDF share sheet still require device testing. Automated native-dependency simulations and a web build do not verify those OS integrations. Chat retry IDs are held in memory, so retries after leaving the screen or restarting the app are not guaranteed to deduplicate the same message.
