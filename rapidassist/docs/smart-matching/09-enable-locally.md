# Smart Matching — Enable Locally and Roll Back

## 1. Enable

The engine is **off by default**. Only the exact value `true` turns it on (`1`, `TRUE` and `yes` keep it off).

Choose one of these:

```
# a) one-off, from the shell (shell variables win over .env files)
cd rapidassist/server
SMART_MATCHING_ENABLED=true npm run dev

# b) persistent: add this line to server/.env.development.local (loaded first by `npm run dev`) or server/.env
SMART_MATCHING_ENABLED=true
```

Restart the server after editing a `.env` file. Variables are read at startup, and the flag is then checked on every batch.

### Settings (all optional; defaults shown)

| Variable | Default | Meaning |
|---|---|---|
| `SMART_MATCHING_ENABLED` | off | `true` enables the smart branch |
| `MATCHING_WEIGHT_E` / `_Q` / `_A` / `_S` / `_F` / `_T` | 0.30 / 0.20 / 0.15 / 0.10 / 0.10 / 0.15 | ETA, rating, acceptance, response speed, fairness, wait/urgency; must sum to 1 |
| `MATCHING_ETA_REFERENCE_SPEED_KMH` | 25 | ETA at the radius edge = radius / this speed (8 km → 1152 s) |
| `MATCHING_RATING_PRIOR_MEAN` / `_WEIGHT` | 4.0 / 5 | Bayesian rating prior |
| `MATCHING_MIN_SAMPLES` | 5 | offer outcomes needed before A and S use real data |
| `MATCHING_NEUTRAL_PENALTY` | 50 | A and S value below `MIN_SAMPLES` |
| `MATCHING_FAIRNESS_WINDOW_HOURS` | 8 | workload window for F |
| `MATCHING_MAX_ATTEMPTS` | unset (off) | opt-in: end a search after N distinct offers (ends searches earlier than the 180 s timeout) |
| `MATCHING_UNMATCHED_BASE_COST` | 150 | U, a floor; raised per batch to 100·min(R,P)+1; must be > 100, ≤ 10 000 |
| `MATCHING_PRIORITY_MULTIPLIER_NORMAL` / `_HIGH` / `_URGENT` | 1 / 2 / 4 | integers, normal ≤ high ≤ urgent, ≤ 100 |
| `MATCHING_MAX_BATCH_SIZE` | 300 | per category, per side; ≤ 1000 |

Unchanged by the engine, but useful:
- `DISPATCH_DEBUG=true` turns on dispatch logs outside development; they are on by default in development.
- `DISPATCH_ROUTING_MODE=fallback` uses straight-line ETAs instead of OSRM.

The 8 km radius, 20 s offer window and 180 s search timeout are not configurable here and apply to both modes.

**Invalid settings never stop dispatch.** If a value is malformed or the weights don't sum to 1 while the flag is on, the server logs once:

```
Smart matching disabled for this batch, invalid config; using the existing dispatcher: <reason>
```

It then keeps dispatching with the existing solver until the value is fixed.

## 2. Verify that it is running

1. **Logs** (development, or `DISPATCH_DEBUG=true`): one line per category per batch.
   ```
   [matching] batch <id> mechanic: 2 request(s), 3 provider(s), planned 2, offers created 2, failed 0, unmatched 0, real pair cost 61.234 (unmatched penalties excluded, U_batch 201)
   ```
   With the flag off there are no `[matching]` lines.
2. **Offer records:** new offers have `algorithmVersion: "smart-hungarian-v1"` and a `costBreakdown`.
   ```
   mongosh "mongodb://127.0.0.1:27018/rapidassist_dev?directConnection=true" --eval 'db.dispatchoffers.find({}, {algorithmVersion:1, assignmentCost:1, costBreakdown:1}).sort({offeredAt:-1}).limit(3)'
   ```
3. **Admin API:** `GET /api/admin/active-jobs` → `matchingAnalytics.algorithmVersion` is `smart-hungarian-v1`, and each job's `matchingDecision.explanation` starts with "Selected by smart matching (Hungarian assignment per service category; …".
4. **Startup:** if the pending-offer index could not be built, a `WARNING: could not build MongoDB index "one_pending_offer_per_provider"` line appears. Fix it as described in `05-schema-api-events.md` §3. Your local dev database had no duplicates at the Phase 5 dry run.

## 3. Roll back

1. Remove `SMART_MATCHING_ENABLED` or set it to anything other than `true`, then restart (or restart without the shell variable).
2. That's all. The next batch uses the existing min-cost-flow solver.
   - **Smart offers that are still pending** stay valid. The provider can accept or decline them through the same endpoints, and expiry and withdrawal work as before. No data migration is needed.
   - Offers created while the flag was on keep `algorithmVersion: "smart-hungarian-v1"` and their `costBreakdown`. The admin explanation keeps describing them correctly.

### What stays in place after rollback (flag-independent, by design)

| Stays | Why it is safe |
|---|---|
| `one_pending_offer_per_provider` index | enforces an invariant both solvers already rely on |
| `createOffer` order: reserve → save offer → claim → notify, with rollback | shared by both solvers; offers can't be visible without a record |
| Orphan sweep (withdraws unreferenced pending offers 20 s after expiry) | needed by the index in both modes |
| `providerPerformance.expiredOffers` and its recording | statistics only; the existing solver doesn't read them |
| Batch priority order fix, extra-work atomic updates, single-write response time | bug fixes, independent of matching |
| Admin explanation branch for smart offers | text only |
| `offersCreated` / `offersFailed` on batch results | reporting only |

A full code rollback (reverting the smart-matching files) would leave the index in the database. If you also want it gone: `db.dispatchoffers.dropIndex("one_pending_offer_per_provider")`.

## 4. Check the installation

```
cd rapidassist/server
npm test                      # 273 tests, 272 pass, 1 skipped (Stripe CLI) at the time of writing
npm run benchmark:matching    # optional, ~25 s, rewrites docs/smart-matching/benchmark-results/
```
