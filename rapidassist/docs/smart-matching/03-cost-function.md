# Smart Matching — Cost Function

Code: `server/src/matching/cost.js` · Config: `server/src/config/matching.js` · Tests: `server/test/matchingCost.test.js`

Deliverable numbering follows the agreed final list (1 audit, 2 architecture, 3 cost function, … 7 benchmark). The benchmark will be `07-benchmark.md`, not `03-benchmark.md` as in the original brief.

## 1. Where the cost sits

The existing dispatcher (`services/dispatch.js`) decides **eligibility** first: role, verified, category (`car_towing → towing`), online, not busy, not reserved, location fresh (≤ 180 s), within **8 km** (all categories, flag on or off), not the customer, not previously offered this request. Only eligible pairs with a usable ETA get a cost. Ineligible pairs never become matrix cells, so they are hard constraints, not just high costs. `pairCost` returns `null` when the ETA is missing, so a caller cannot accidentally turn such a pair into a cell.

With `SMART_MATCHING_ENABLED` unset or anything other than the literal `"true"`, this module is not used. The existing solver and its existing cost run unchanged.

## 2. Formula

For an eligible (request *i*, provider *j*) pair:

```
C(i,j) = wE·E + wQ·Q + wA·A + wS·S + wF·F + wT·T          each term ∈ [0,100], lower is better
```

Default weights: **E 0.30, Q 0.20, A 0.15, S 0.10, F 0.10, T 0.15** (sum = 1, so C ∈ [0,100]). Each weight is overridable via `MATCHING_WEIGHT_E` … `MATCHING_WEIGHT_T`. The config refuses to start if the weights don't sum to 1 (±1e-6) or if any value is malformed. It never silently falls back to a default.

| Term | Definition | Cold start / fallback |
|---|---|---|
| **E** ETA | `100 · min(eta, etaMax) / etaMax`, `etaMax = radiusKm / 25 km/h · 3600` (8 km → 1152 s) | No ETA → pair has no cost (ineligible) |
| **Q** quality | `r̂ = (C·m + n·ratingAvg)/(C + n)`, `Q = 100·(5 − r̂)/4`; `m = 4.0`, `C = 5` | No reviews → r̂ = 4.0 → Q = 25 |
| **A** acceptance | `100 · (1 − accepted / (accepted + declined + expired))` | < `minSamples` (5) outcomes → 50 |
| **S** response speed | `100 · min(avgResponseSeconds, offerTtl) / offerTtl` (TTL = 20 s) | < 5 answered offers or no average → 50 |
| **F** fairness | `100 · min(1, w_j / (2 · max(1, median_w)))` | — |
| **T** deadline/priority | `100 · (1 − u)`, `u = (priorityWeight / 4) · (0.5 + 0.5 · min(1, waited / searchTimeout))` | Unknown priority → normal |

`w_j` is the number of assignments provider *j* received in the trailing `fairnessWindowHours` (default 8 h). `median_w` is the median over the eligible providers in the same category batch. `priorityWeight` is the existing `{normal 1, high 2, urgent 4}` from `services/assignmentSolver.js`. `waited = now − createdAt`, and `searchTimeout = 180 s` (`SEARCH_MS`).

## 3. Justification of each choice

**E — reference speed 25 km/h.** This is the same speed the existing Haversine fallback uses (`services/travelTimeMatrix.js`). A provider exactly at the radius edge scores 100 on the fallback. Road ETAs from OSRM that exceed `etaMax` clamp to 100 rather than exceeding the scale. ETA stays pluggable: E consumes whatever `getTravelTimeMatrix` returns (OSRM road time or the fallback).

**Q — Bayesian smoothing with the existing prior.** `m = 4.0, C = 5` are the values already in `scoreBreakdown`, so the explainability score and the solver agree on what a rating means. A new provider sits at the prior. One 5★ review moves Q from 25 to 20.8, and one 1★ review moves it to 37.5, not 100.

**A — ignored offers count.** A provider who lets offers expire is no more useful to a waiting customer than one who declines. Today's `providerPerformance` aggregate counts only accepted/declined, so the cost reads a new `expiredOffers` field. Until Phase 5 adds that field, it is treated as 0.

**S — answered offers only.** Ignored offers already cost the provider through A. Counting them as "slow" in S too would penalise the same behaviour twice.

**A and S cold start: neutral 50, not weight renormalisation.** Renormalising would put a cold-start provider's cost on a different scale (its remaining weights inflated) from an experienced provider's cost in the **same matrix row**. The solver compares exactly those numbers. A fixed neutral value keeps every cell on one scale and neither rewards nor punishes a lack of history.

**F — relative to the batch median, floored at 1.** Workload relative to peers is what matters for fairness. Absolute counts would treat a busy evening and a quiet morning the same. The floor stops `0/0`, and it means that when most peers are idle, one recent job already costs 50.

### Design point 1 — lifetime `completedJobs` is dropped

The existing explainability score rewards experience (`completedJobs / 100`). If the cost also contained an experience reward, it would push work towards the same high-volume providers that F penalises. The two terms would partly cancel and the outcome would depend on their relative weights rather than on a clear policy. Provider quality is carried by Q (customer ratings), and reliability by A and S. Volume appears only in F, as recent workload. A unit test asserts that 0 vs 5000 completed jobs gives an identical cost.

### Design point 2 — T makes urgent / long-waiting requests *cheaper*

The solver maximises the number of matches first and then minimises total cost (Phase 3). When providers are scarce, it serves the requests whose rows are cheapest. A term that **grew** with waiting time, as the original brief's "penalty grows as waiting time approaches the timeout" suggests, would make old and urgent requests *more* expensive and push them to the back of the queue. That is the opposite of what we want. So T falls as urgency rises:

| priority | fresh (u) | at timeout (u) | T range |
|---|---|---|---|
| normal | 0.125 | 0.25 | 87.5 → 75 |
| high | 0.25 | 0.5 | 75 → 50 |
| urgent | 0.5 | 1.0 | 50 → 0 |

When every request can be matched, T is constant along a row and has no effect on *which* provider a request gets. It only decides *which requests* win scarce providers. Priority used to be expressed as a ×1/×2/×4 multiplier on travel cost and waiting cost in the old solver. It now lives in T.

## 4. Range and behaviour (verified by tests)

- C ∈ [0, 100]. The highest reachable cost is **98.125**: T bottoms out at u = 0.125 for a fresh normal request (85 from E+Q+A+S+F at 100, plus 0.15·87.5). The best reachable cost is about 0.
- Nearer is cheaper when everything else is equal. More reviews at the same average lower Q.
- The config is off unless `SMART_MATCHING_ENABLED === "true"`. `"1"`, `"TRUE"` and `"false"` all keep it off.

## 5. Priority enforcement (resolved: Option B)

T on its own makes priority too weak. A fresh urgent and a fresh normal request differ by only 0.15 · 37.5 = 5.6 cost points, while E alone can differ by 30, so a far-away urgent request could lose a contested provider to a nearby normal one. **Decision (Option B):** priority is enforced through the Hungarian *unmatched* (dummy) cost, `U_batch × multiplier(priority)` with multipliers 1 / 2 / 4. This makes priority lexicographically stronger than any pair cost: urgent requests always win contested providers, and the number of matches stays at the maximum. The proof and the reason a fixed U = 150 is not sufficient are in `04-hungarian.md` §4. T stays in the pair cost. Among requests of **equal** priority it still favours the longer-waiting one when providers are scarce. Phase 7 reports match rate and average ETA per priority level.
