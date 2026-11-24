# Smart Matching — Schema, API and Event Changes

All changes are additive. No route, request body, response field, status value or Socket.IO event was renamed or removed.

## 1. Schema

### `DispatchOffer` (`server/src/models/DispatchOffer.js`)

| Field | Change | Written by |
|---|---|---|
| `costBreakdown` `{E, Q, A, S, F, T, pairCost, weights{E…T}}` | **added**, optional | smart offers only; absent (not `null`) on existing-solver offers |
| `attempt` | **added**, optional | smart offers only: 1-based offer number for the request |
| `algorithmVersion` | new value `smart-hungarian-v1` | smart offers |
| `assignmentCost` | unchanged field. On smart offers it holds the **real 0–100 pair cost** (existing offers: priority × travel seconds) | both |
| `waitingCost` | unchanged field (already nullable). `null` on smart offers: unmatched penalties are never stored | both |
| `outcome` | unchanged enum `offered \| accepted \| declined \| expired \| withdrawn` | both |

### `User` (`server/src/models/User.js`)

| Field | Change |
|---|---|
| `providerPerformance.expiredOffers` | **added**, default 0: offers that expired unanswered. Counted against acceptance by smart matching (term A). `responseSamples` / `averageResponseSeconds` still use answered offers only. |

### `ServiceRequest`

No changes. Smart matching uses the existing `dispatch` sub-document and its existing `state` values.

## 2. Index: one pending offer per provider

```
dispatchoffers: { providerId: 1 }   name "one_pending_offer_per_provider"
                unique, partialFilterExpression { outcome: "offered" }
```

- **Where:** `server/src/services/pendingOfferIndex.js`, built by `ensurePendingOfferIndex()` at server startup (`src/index.js`, after the DB connection). It is deliberately not declared in the Mongoose schema, because Mongoose's automatic build swallows a failure and then silently skips the model's remaining indexes.
- **If the build fails** (for example, existing duplicates): the server logs one warning naming the index and the fix, and keeps running. Dispatch still allows only one pending offer per provider through `User.providerState.reservedOfferId`, but without the database guarantee. Startup never crashes because of this index.
- **In `createOffer`:** the offer record is inserted *before* the request is claimed. A duplicate-key error from this index (identified by `keyPattern {providerId}`, not the unrelated unique `offerId` index) means "provider already has a pending offer". The reservation is released, a warning is logged, the batch result gets `offersFailed: [{requestId, providerId, reason: "duplicate_pending_offer"}]`, there is no error response, and the next batch re-plans. The provider is not added to the request's `attemptedProviderIds`, so it stays eligible for that request.
- **Orphans:** a pending record left by an interrupted flow, and no longer referenced by its request, would block its provider indefinitely. The existing recovery sweep (`recoverReservations`, every ~30 s) marks such records `withdrawn` once they are more than one offer window (20 s) past expiry. It uses `withdrawn` because the provider did not ignore them. Offers still referenced by their request are never touched by the sweep; `reconcileOffers` owns those.

## 3. Manual step when the index cannot be built

1. Dry run (default; writes nothing):
   ```
   cd rapidassist/server
   node scripts/cleanupPendingOffers.js --confirm-local-dev --uri=mongodb://127.0.0.1:27018/rapidassist_dev?directConnection=true
   ```
2. Review the printed duplicate groups. For every pending offer it shows `keep`, `accepted` or `withdrawn` (or `expired`), with the reason.
3. Apply: the same command plus `--apply`. Optionally add `--build-index` to build the index right away, or restart the server, which builds it at startup.
4. Run the dry run again. It must report `Duplicate groups … : 0` (idempotent).

**Rules.** Only `DispatchOffer` records with `outcome: "offered"` that belong to a provider with more than one such record are considered. Within a duplicate group:

| Classification | Action |
|---|---|
| still live for its request (request offered to this provider, offer id matches, not expired) | **keep**. If several are live, keep the one the provider's reservation points at, otherwise the newest. |
| the request was already accepted by this provider with this offer | **accepted**. That is what happened; `respondedAt` = the request's `acceptedAt`. |
| anything else (stale) | `--stale-outcome`, default **withdrawn** (not counted against acceptance); `expired` on request |

Service requests, users, active jobs and offers with any other outcome are never modified. Every write is conditional on `outcome: "offered"`.

**Safety.** The script refuses to run without `--confirm-local-dev`, with `NODE_ENV=production`, without an explicit `--uri` (or `MONGODB_URI` in the environment; `.env` files are never read), and for any non-loopback host or `mongodb+srv` URI unless `--allow-non-localhost` is also given. Credentials are never printed.

## 4. Flag-independent changes

These changes apply whether `SMART_MATCHING_ENABLED` is on or off. None of them changes **which provider is offered which request**.

| Change | What it does | Why it applies with the flag off |
|---|---|---|
| **`createOffer` order** (Phase 5) | reserve provider → **save offer** (`DispatchOffer`, `outcome: "offered"`) → claim request → notify. Rollback: if the reservation fails, nothing was written (`provider_unavailable`). If saving fails on the pending-offer index, the reservation is released, a warning is logged and the batch re-plans (`duplicate_pending_offer`). If the request claim fails, the saved offer is deleted and the reservation released (`request_changed`). Every batch result reports `offersCreated` / `offersFailed` from these actual outcomes. | Both solvers create offers through the same function. Saving the offer before the request becomes visible as offered means a provider can never see or accept an offer that has no record. The batch result previously listed planned assignments as if they were offers. |
| **Orphan sweep** (Phase 5) | The existing recovery sweep (`recoverReservations`, about every 30 s) marks a pending offer **`withdrawn`** once it is more than 20 s (one offer window) past expiry **and** no longer referenced by its request. Offers still referenced by their request are never touched (`reconcileOffers` owns them). | The unique pending-offer index is flag-independent. An orphan left by an interrupted flow (a crash between steps) would otherwise block its provider from every future offer in either mode. It uses `withdrawn`, not `expired`, so the provider's acceptance statistics are not affected. |
| **`expiredOffers` recording** (Phase 4) | Expired offers refresh `providerPerformance` and are counted in the new `expiredOffers` field. `responseSamples` / `averageResponseSeconds` still use answered offers only. | Statistics are recorded regardless of the flag, so they are already meaningful the day smart matching is switched on. The existing solver reads none of these fields, and its explainability score reads only the unchanged response fields. |
| **Startup index build** (Phase 5) | `ensurePendingOfferIndex()` builds `one_pending_offer_per_provider` after the DB connection. It never throws; on failure it logs a warning with the manual fix (05-schema-api-events.md §3). | "One pending offer per provider" is a dispatch invariant in both modes. The index makes the database enforce what the provider reservation already enforced in application code. |
| **Batch priority order** (Phase 6) | Pending requests are ordered urgent → high → normal, then oldest first, instead of MongoDB's alphabetical string order (urgent → normal → high). | It fixes a latent bug in shared code. It affects only the order of per-request steps before solving (Google pickup refresh, travel-matrix input, diagnostics). Both solvers order their input themselves, so pairings and offer write order are unchanged (shown below). |
| **Extra-work request / approval** (Phase 6) | Each is one conditional `findOneAndUpdate` (status, owner, pending extra work) instead of read-modify-`save()`. A change committed in between → 409 "Request changed. Refresh and try again." | It fixes a lost-update bug in the job lifecycle, unrelated to matching: a cancellation could be overwritten. |
| **Offer response time** (Phase 6) | `resolveOffer` writes outcome, `respondedAt` and `responseSeconds` (computed by MongoDB from `offeredAt`) in one atomic update. | Previously two writes. A crash between them left `responseSeconds = 0`, which skews the response-time statistics in both modes. |
| **Admin explanation text** (Phase 6) | `GET /api/admin/active-jobs` → `matchingDecision.explanation` has a branch for `smart-hungarian-v1` offers (pair cost and terms). The other two branches are worded exactly as before. | Server-side text only. Existing offers are described exactly as before. |

**Verification (flag off):**
- **Golden snapshot** (`server/test/fixtures/dispatch-flag-off-golden.json`). It was recorded from the dispatcher *before* any smart-matching change, and the current code reproduces it byte-for-byte.
  - It was unchanged through Phases 4–5 (SHA-256 `9cd84af4…` throughout).
  - In Phase 6, re-recording after the priority-sort fix gave a byte-identical file (no diff).
  - Phase 6 also found that the fixture's `createdAt` back-dating was silently dropped: Mongoose treats `createdAt` as immutable on `updateOne`. After fixing the fixture helper (raw collection write), the golden was re-recorded **from the HEAD (pre-Phase-4) source** extracted with `git archive`, and the current code reproduces that recording byte-for-byte (SHA-256 `599e29fd…`).
  - Compared with the previous golden, only `waitingCost` / `totalCost` differ, because requests now really waited 5–100 s. Every request → provider pairing, the declined request and all other fields are identical.
- **Existing dispatch tests.** The unmodified HEAD `test/dispatch.test.js` (71 tests) passes 71/71 against the final code. The working-tree copy differs only by 3 lines that build the pending-offer index in its setup, and it passes too, so all pre-existing scenarios also hold with the database constraint in place.

The API and event details below are unaffected by these changes, apart from the 409 described for extra work.

## 5. API

No changes. Providers keep using `GET /api/requests/open` (pending offers addressed to them, recoverable after reconnect or restart), `PATCH /api/requests/:id/accept {offerId}` and `PATCH /api/requests/:id/decline {offerId}`. Customers keep using `POST /api/requests/:id/dispatch/retry` after a search ends.

The provider profile JSON (`toSafeJSON`) gains `providerPerformance.expiredOffers`. Neither the mobile app nor the admin panel reads `providerPerformance`.

The admin `GET /api/admin/active-jobs` passes `matchingDecision.assignmentCost` through unchanged. Its `explanation` string has branches only for `batch-mincost-v1` and the older weighted score, so for smart offers it falls back to the weighted-score wording. The admin panel UI reads neither field. This is a known cosmetic gap and has not been changed.

## 6. Events

No new events. Smart offers emit the same `request:changed` kinds as today: `offer` on create, `dispatch` on decline, re-search or an ended search, `offer-expired` / `offer-withdrawn` to the provider, and `assigned` on accept. A search ended by the opt-in max attempts emits exactly what the timeout emits.
