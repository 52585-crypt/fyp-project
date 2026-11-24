# Smart Matching — Test Results

Runner: `node:test` (`cd rapidassist/server && npm test`). Integration tests use `mongodb-memory-server` (standalone, in memory; already a devDependency). **No new dependencies were added.**

## 1. Suite counts per phase (measured)

| After | Tests | Pass | Fail | Skipped | Added |
|---|---|---|---|---|---|
| Baseline (HEAD `f080f9f`) | 179 | 178 | 0 | 1 | — |
| Phase 2: cost function | 205 | 204 | 0 | 1 | +26 `matchingCost` |
| Phase 3: Hungarian | 226 | 225 | 0 | 1 | +21 `hungarian` |
| Phase 4: dispatcher branch | 248 | 247 | 0 | 1 | +12 `smartMatching`, +10 `smartBatch` |
| Phase 5: pending-offer index | 259 | 258 | 0 | 1 | +10 `pendingOffers`, +1 `smartMatching` |
| Phase 6: fixes | 271 | 270 | 0 | 1 | +8 `requestLifecycleRaces`, +1 `dispatchPriorityOrder`, +3 `matchingExplanation` |
| **Phase 7: benchmark (final)** | **273** | **272** | **0** | **1** | +2 `benchmarkMatching` |

The one skipped test is the pre-existing Stripe CLI sandbox test (`stripePayments.test.js`), skipped by design without the Stripe CLI. The full run takes about 13 s.

## 2. New test files

| File | Tests | Covers |
|---|---|---|
| `matchingCost.test.js` | 26 | Config: off by default, only `"true"` enables, weights must sum to 1, malformed values rejected, max attempts opt-in. Each term E, Q, A, S, F, T with its cold-start fallback. Lifetime `completedJobs` does not change cost. T lowers cost for urgent and long-waiting requests. Cost range [0, 98.125]. |
| `hungarian.test.js` | 21 | Square and rectangular matrices, all-infeasible, forbidden cells never assigned, empty or malformed input. **Brute force on 300 random matrices up to 7×7.** **Totals equal to the existing `solveAssignment` and brute force on 200 identical matrices up to 7×7, and to `solveAssignment` on 40 up to 40×40.** Deterministic tie-breaking under shuffled input. Priority cases (a) far urgent beats near normal, (b) equal priority → lower cost, (c) no eligible provider → unmatched. The U = 150 counter-example (a fixed U drops a match; the per-batch floor keeps it). On 300 random instances the policy reaches the maximum matches and the maximum matched priority. |
| `smartBatch.test.js` | 10 | Numeric safety: default and most extreme allowed configs stay within `MAX_SAFE_INTEGER / 256`, and a full 300 × 300 batch at the configured maximum is valid with all requests matched. Per-category separation (`car_towing → towing`), batch caps (priority-first admission, best-ETA providers), fairness tie-break, real costs separated from penalties. |
| `smartMatching.test.js` | 13 | In-memory MongoDB, real dispatcher. **Flag off is identical to a golden snapshot recorded from the pre-change dispatcher.** Flag on: per-category offers with real costs, existing reservations and pending offers respected, offline/busy/stale/unverified/wrong-category/out-of-radius providers excluded, decline re-matches without re-offering, 20 s expiry re-matches and counts in `expiredOffers`, by default a search survives 7 declines and ends only at 180 s, opt-in max attempts and the timeout stop re-matching, cancellation landing mid-matching, concurrent accepts (exactly one winner), urgent beats a nearer normal request, invalid config falls back to the existing solver. |
| `pendingOffers.test.js` | 10 | Unique pending-offer index: blocks duplicates, 8 concurrent inserts leave 1, two dispatcher instances racing (10 rounds) create exactly 1 offer, `createOffer` conflict handling with the flag off and on (skip, roll back, warn, re-plan), the orphan sweep (and that it never touches live offers), a startup build with duplicates warns instead of crashing, and the cleanup script (dry run and CLI dry run change nothing, apply, idempotent second run, `--stale-outcome=expired`, refusal of unsafe invocations). |
| `requestLifecycleRaces.test.js` | 8 | Extra-work request and approval racing a cancellation (deterministic interleaving and a 30-round stress test). Single-write response time for decline, expiry and acceptance, with a simulated crash before any second write. The plain extra-work and approval flows still work. |
| `dispatchPriorityOrder.test.js` | 1 | Batch order urgent > high > normal, then oldest, then id. |
| `matchingExplanation.test.js` | 3 | Admin explanation text for smart offers. The other two wordings are unchanged. |
| `benchmarkMatching.test.js` | 2 | `--quick` benchmark run succeeds, is deterministic apart from timings, never makes an invalid assignment, and Hungarian reaches the maximum matches. Gini and percentile helpers. |

The existing `dispatch.test.js` (71 tests) runs with the pending-offer index built in its setup (+3 lines). Nothing else in it was changed.

## 3. Evidence against the pre-change code

| Claim | How it was proved |
|---|---|
| Flag off = old behaviour | The golden snapshot (offers, costs, scores, reservations, versions, two rounds with a decline) was recorded from the dispatcher **before** the smart branch existed. After a fixture fix in Phase 6 it was re-recorded from the **HEAD source** (extracted with `git archive`, no checkout), and the current code reproduces it byte for byte. |
| Existing behaviour intact | The **unmodified HEAD `dispatch.test.js`** passes 71/71 against the final code. |
| The urgent-priority test really tests priority | With all multipliers temporarily set to 1, it **failed** (0/1). The config was then restored. |
| Extra-work lost update existed and is fixed | Run against the unfixed controller, the deterministic tests got **200 instead of 409** after the cancel committed, and the stress test failed with "round 20: cancel overwritten (extra-work 200)". After the fix: 8/8, three runs in a row. |
| Two-write response time existed and is fixed | Run against the unfixed `resolveOffer`, the decline and expiry tests **failed** on the simulated crash before the second write. After the fix: pass, and no resolved offer has `responseSeconds = 0`. |
| Batch results report actual offers | The two-instance race test exposed early-return results without `offersCreated` (`NaN`). Fixed, then 3 consecutive passing runs. |
| Fixed U = 150 is insufficient | A dedicated test: a fixed U drops one of two matches; the per-batch floor keeps both. |

## 4. Fixture bug found and fixed (Phase 6)

Mongoose treats `createdAt` as immutable, so `updateOne({ $set: { createdAt } })` was silently ignored and the smart-matching fixture's "waited N seconds" never took effect. The helper now writes through `Model.collection`. Before re-recording, the golden diff showed only `waitingCost` / `totalCost` changes; pairings were identical. See `02-architecture.md` §5.

## 5. Benchmark test

`npm run benchmark:matching` is not part of `npm test` (about 25 s). Its `--quick` mode is (`benchmarkMatching.test.js`). Results: `07-benchmark.md`.
