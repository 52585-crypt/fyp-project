# Smart Matching — Hungarian Solver

Code: `server/src/matching/hungarian.js` (solver), `server/src/matching/cost.js` (`unmatchedCostsFor`, `unmatchedBaseCostFor`) · Tests: `server/test/hungarian.test.js`

## 1. The existing solver, for comparison

`services/assignmentSolver.js` is a **min-cost flow solved by successive shortest paths** (Bellman-Ford/SPFA queue):
`source → request (cap 1) → provider (cap 1, cost = priorityWeight × travelSeconds) → sink`, plus `request → wait → sink` with cost `priorityWeight × (2700 s + waited)`.
Every request sends exactly one unit, either to a provider or to *wait*. Arc costs are non-negative, so successive shortest-path augmentation yields a minimum-cost flow. **The existing solver is therefore optimal for its own objective.** Tests confirm this by matching its total to brute force and to the Hungarian solver (§5).

It does not strictly maximise matches. A request waits whenever its travel cost is higher than its waiting cost. Within the 8 km radius that rarely happens with fallback ETAs, but it can with long road ETAs.

## 2. Reduction

For R requests and P providers the solver builds an **R × (P + R)** matrix:

| column | cell (row *i*) |
|---|---|
| provider *j* (0 … P−1) | `pairCost(i, j)`; `null`/non-finite = ineligible → `+∞` |
| dummy *k* (P … P+R−1) | `unmatchedCost(i)` (same for every dummy column of row *i*) |

Rows ≤ columns always, so every row is assigned. A row that lands on a dummy column is reported as **unmatched**. A forbidden cell is never chosen because a free, finite dummy column is always reachable. The result filter checks this again, so a forbidden or dummy assignment can never appear as a real match. Each provider column is owned by at most one row, which preserves the "one `activeRequestId` per provider" rule.

`solveMatrix(costs, unmatchedCosts)` returns `{ rowToColumn, totalCost, assignedCost, unmatchedCost, unmatchedCount }`.
`assign({ requests, providers, pairCost, unmatchedCosts })` returns `{ assignments: [{requestId, providerId, cost}], unmatchedRequests, totalCost, assignedCost, unmatchedCost, unmatchedCount }`.

**Reporting rule.** `assignedCost` is the sum of **real pair costs only**. `unmatchedCost` is the sum of dummy penalties, and `unmatchedCount` is how many requests stayed unmatched. `totalCost = assignedCost + unmatchedCost` is the solver objective. It is used only for cross-checking against the existing solver's `totalCost`, which has the same structure. It is never reported, logged or stored as an assignment cost. The dispatcher, the batch logs and `DispatchOffer` (`assignmentCost`, `costBreakdown.pairCost`) carry the real 0–100 pair cost. In the smart path, `waitingCost` is `null` on offers. The Phase 7 benchmark's "total weighted assignment cost" is Σ real pair costs, with the unmatched count reported separately.

## 3. Algorithm and complexity

Kuhn–Munkres in its shortest-augmenting-path form with dual potentials `u`, `v` (`minv`/`way` arrays). For each row it grows a Dijkstra-like alternating tree over the reduced costs `c − u − v` until it reaches a free column, then flips the path.

- **Solve:** O(R² · (P + R)) ⊆ **O(n³)**, n = max(R, P). Memory O(P + R) beyond the matrix.
- **Matrix build:** **O(R · P)** calls to `pairCost` (each O(1)), plus the travel-time matrix that the dispatcher already fetches.
- **Per category:** the dispatcher will solve each service category separately in Phase 4, because cross-category pairs are always ineligible. This turns one n³ into Σ nₖ³.
- Typed arrays (`Float64Array`/`Int32Array`) and no dependencies. Timing numbers come only from the Phase 7 benchmark.

**Determinism.** Inputs are ordered by request `createdAt`, then `id`, and providers by `id`, before the matrix is built. The algorithm itself is deterministic, so the same batch always gives the same assignment regardless of query order. A test shuffles inputs 20 times and asserts identical output.

## 4. Priority as unmatched cost (Option B)

```
unmatchedCost(i) = U_batch × multiplier(priority_i)
U_batch          = max(U, 100 · min(R, P) + 1)
```

`U` = `MATCHING_UNMATCHED_BASE_COST` (default **150**, must be > 100). The multipliers come from `MATCHING_PRIORITY_MULTIPLIER_{NORMAL,HIGH,URGENT}` (default **1 / 2 / 4**). These must be positive integers with normal ≤ high ≤ urgent.

### Why U alone (> max pair cost) is not enough

`U > 100` is enough when **one** provider is contested. A batch, however, can force a chain of reassignments: matching one more request can push several already-matched requests onto worse providers, each costing up to 100 more. Counter-example (also a test):

| | P1 | P2 |
|---|---|---|
| R1 | 0 | 100 |
| R2 | 100 | — |

With a fixed U = 150, `{R1→P1, R2 unmatched}` = 150 beats `{R1→P2, R2→P1}` = 200, so the solver serves **one** request instead of two. The same chain effect could let a long reassignment chain outweigh a priority multiplier.

### Objective order

The solver's decisions follow this strict order:

1. **Maximum number of matches.**
2. **Highest matched priority** (Σ multiplier over matched requests).
3. **Lowest real pair cost** (Σ pair cost over matched pairs).

(1) and (2) never conflict. The solver directly optimises (2) and then (3), and (1) follows from (2) by point 3 below. Every matching with the highest matched priority is also a maximum-size matching. There is never a choice between "one more match" and "a higher-priority match".

### Why `U_batch` guarantees this order

The objective is `U_batch · Σ_{unmatched} mult(i) + Σ_{matched} cost(i,j)`, which equals `U_batch · (Σ_all mult − Σ_matched mult) + Σ cost`.

1. Real pair costs are in [0, 100]. A matching has at most min(R, P) pairs, so the real-cost total of **any** matching lies in [0, 100·min(R,P)]. The difference between any two matchings is therefore ≤ 100·min(R,P) < U_batch.
2. Multipliers are integers, so two matchings that differ in matched priority Σ_matched mult differ by ≥ 1, which is ≥ U_batch in the objective. That outweighs any real-cost difference. **The solver therefore maximises Σ_matched mult first, and only then minimises real cost.** This is a lexicographic objective.
3. **Maximum matches.** The sets of requests that can be matched simultaneously form a *transversal matroid*. With positive weights, a maximum-weight independent set of a matroid is a basis, and all bases have the same size: the maximum matching size. So maximising Σ_matched mult also maximises the number of matches.
4. **Priority before ETA cost.** By matroid exchange, replacing one served request by another changes the served set one-for-one. An urgent request (4) therefore always displaces a normal (1) or high (2) one for a contested provider, whatever the ETA or other cost terms say. Only among equal-priority choices does the real cost decide. Any strictly increasing integer multipliers give the same behaviour; 1/2/4 mirrors today's ×4.

The configured `U` is kept whenever it already exceeds the bound. For example, with a single provider U = 150 is used as configured. Raising `U` higher only grows the numbers. It does not change decisions.

### Tests for the policy
- (a) far urgent vs near normal for one provider → **urgent wins**. Also high beats normal, and urgent beats high.
- (b) equal priority → **lower-cost pair wins**.
- (c) request with no eligible provider → **stays unmatched**, never force-assigned.
- The counter-example above: fixed U = 150 drops a match; `U_batch` keeps both.
- On 300 seeded random instances (≤ 6×6, 35 % ineligible) the result has the **brute-force maximum number of matches**, the **maximum matched priority**, and the **brute-force optimal total**.

## 5. Numeric safety

In the dispatcher the solver sees **integers only**:
- Real pair costs (0–100) are quantised to milli-units: `round(cost × 1000)`. The quantisation error is ≤ 0.0005 cost points per pair. It can only change a decision between options whose costs differ by less than that.
- Unmatched cells are `ceil(U_batch × 1000) × multiplier`.

Integer arithmetic below 2⁵³ is exact. Potentials, reduced costs and the objective therefore have no rounding drift, and decisions are bit-for-bit reproducible.

Bound per batch: every potential and objective magnitude is ≤ (R + P + 1) × largest cell. `config/matching.js` (`numericBound`, `assertNumericSafety`) requires this to stay ≤ `MAX_SAFE_INTEGER / 256`. It checks once when the config is loaded, for the largest batch the config allows, and again on every solve.

| Configuration | Largest cell | Bound (R + P + 1) × cell | Headroom vs `MAX_SAFE_INTEGER` |
|---|---|---|---|
| Defaults: U 150, ×1/2/4, max batch 300 | 120 004 000 | 72 122 404 000 (≈ 7.2 × 10¹⁰) | ≈ 1.2 × 10⁵ × |
| Extreme allowed: U 10 000, multipliers up to 100, max batch 1000 | 10 000 100 000 | ≈ 2.0 × 10¹³ | ≈ 450 × (≥ the 256 × required) |

Limits that enforce this: `MATCHING_UNMATCHED_BASE_COST` ≤ 10 000, multipliers ≤ 100, `MATCHING_MAX_BATCH_SIZE` ≤ 1000 (default 300, applied per category and per side).

Over the cap, the highest-priority (then oldest) requests are admitted, and the rest wait for the next batch while still searching. Only providers with at least one eligible pair are considered. Above the cap, those with the shortest best ETA are kept. Tests cover a full 300 × 300 batch at the default maximum (all matched, valid, bound ≤ limit) and the extreme allowed configuration.

## 6. Cross-checks on identical matrices

| Check | Cases | Result |
|---|---|---|
| Hungarian vs brute force, random costs, 25 % forbidden, random unmatched costs | 300 seeded, 1–7 × 1–7 | totals equal (tolerance 1e-6) |
| Hungarian vs **existing `solveAssignment`** vs brute force: matrix `priorityWeight × max(1, round(seconds))`, unmatched = `waitingCostFor` (the existing solver's own wait cost), travel up to 4000 s so that waiting is sometimes chosen | 200 seeded, 1–7 × 1–7 | all three totals **exactly equal** (integers) |
| Hungarian vs existing `solveAssignment` | 40 seeded, up to 40 × 40 | totals exactly equal |
| Square / rectangular (R < P, R > P) known optima, all-infeasible, empty input, malformed input, 200 × 200 with 50 % forbidden (validity) | — | pass |

Under the existing solver's cost, both solvers are optimal and agree. The smart engine's different behaviour therefore comes only from the new cost function and the unmatched-cost policy, not from the choice of solver.

## 7. Status

The solver is wired into `services/dispatch.js` behind `SMART_MATCHING_ENABLED` (Phase 4). See `02-architecture.md`.
