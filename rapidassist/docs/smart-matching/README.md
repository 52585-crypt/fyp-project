# Smart Provider Matching: Documentation

RapidAssist's batch dispatcher can match waiting requests to providers with a multi-objective cost and the Hungarian algorithm. It is enabled with `SMART_MATCHING_ENABLED=true` and **off by default**. With the flag off, dispatch behaves exactly as before; this is checked byte for byte against a snapshot recorded from the pre-change code. The engine is a branch inside the existing dispatcher (`server/src/services/dispatch.js`). It reuses its eligibility rules (8 km radius for every category), 20 s targeted offers, 180 s search timeout, reservations, accept/decline endpoints and Socket.IO events, so the Android and Web clients need no changes.

| # | Document | Contents |
|---|---|---|
| 1 | [01-audit.md](01-audit.md) | Phase 1 audit of the code as found: lifecycle, eligibility, races, metrics, transport, mismatches with the brief |
| 2 | [02-architecture.md](02-architecture.md) | Batch flow diagram, modules, offer lifecycle, what the flag changes, flag-independent changes and how they were verified |
| 3 | [03-cost-function.md](03-cost-function.md) | `C = Σ w·term` (E, Q, A, S, F, T): formulas, cold start, why `completedJobs` was dropped, why T lowers the cost of urgent and long-waiting requests |
| 4 | [04-hungarian.md](04-hungarian.md) | Reduction, O(R²(P+R)) ⊆ O(n³) plus O(R·P) matrix build, priority via `U_batch × multiplier` and its proof, objective order, numeric safety, cross-checks |
| 5 | [05-schema-api-events.md](05-schema-api-events.md) | Additive schema fields, the one-pending-offer index and cleanup script, flag-independent changes, API and events (unchanged) |
| 6 | [06-test-results.md](06-test-results.md) | 179 → 273 tests (272 pass, 1 skipped by design), per-file coverage, regression tests proven against the old code |
| 7 | [07-benchmark.md](07-benchmark.md) | Four approaches on seeded data: single batch, runtime, multi-round simulation, honest findings ([raw results](benchmark-results/)) |
| 8 | [08-limitations.md](08-limitations.md) | ETA, cold start, myopic batches, strict priority, single worker, no transactions, … |
| 9 | [09-enable-locally.md](09-enable-locally.md) | Enable, configure, verify, roll back; what stays after rollback |

## Results in one paragraph

On 22 seeded single-batch scenarios (3,280 requests; Node 22, i5-13420H; straight-line ETAs), the smart Hungarian reached the **maximum possible number of matches in 22 of 22 cases**. It served **100 % of urgent requests (331/331)** and the most high-priority ones (85.1 %). Nearest-first managed 12 of 22 and 50.2 % urgent; greedy managed 12 of 22 and 91.2 % urgent. It was about **5.5 × faster than the existing min-cost-flow solver** at 300 × 300 (median 67 ms vs 368 ms). It is **not better everywhere**:
- **Strict priority:** it leaves the fewest normal-priority requests served when providers are scarce.
- **ETA:** it trades ETA for rating, reliability and workload, with a mean of 211 s against 188 s for greedy and 206 s for the existing solver. The gap is largest when providers are abundant: 151 s against 105 s.
- **Throughput under overload:** in a 1-hour overloaded simulation, a greedy policy served about 4.7 % more requests (913 vs 872).
- **Fairness:** the fairness term produced no measurable improvement in workload fairness.

Both exact solvers agree on identical cost matrices, so the differences come from the cost function and the priority policy, not from the algorithm.

## Summary for the report

All figures are from the seeded synthetic benchmark (`07-benchmark.md`; Node 22, i5-13420H, straight-line ETAs). They are not production measurements.

- **Large gains over nearest-provider-first.** Across 22 single-batch scenarios the smart engine served every urgent request (331/331 against 166/331, 50.2 %) and 85.1 % of high-priority requests against 59.4 %. It always reached the maximum possible number of matches (22/22 cases against 12/22), with a 13 % shorter mean ETA (211 s vs 243 s). In loaded simulations, mean waiting time to assignment fell from 66–111 s to 46–48 s.
- **Quality on par with the existing optimal solver, and much faster at scale.** Both are exact optimisers, and they produce identical totals on identical cost matrices. Against the existing min-cost-flow solver, the smart engine has the same urgent coverage (100 %), the same or one more match (2122 vs 2121 of 2122), and a similar mean ETA (211 s vs 206 s). It is not better on ETA, and it is worse on urgent ETA (219 s vs 170 s). It is **5.5 × faster at 300 × 300** (median 67 ms vs 368 ms).
- **Guarantees, with proof and tests.** Every batch makes the maximum possible number of matches, and a higher-priority request always wins a contested provider (`04-hungarian.md` §4: per-batch U floor, transversal-matroid argument). Exactness is verified against brute force and the existing solver, and integer arithmetic stays far inside `MAX_SAFE_INTEGER`.
- **Explainable and configurable cost.** Every offer stores its six cost terms (ETA, rating, acceptance, response time, workload, urgency) and the weights used. The admin API explains each decision. Weights, priors, the priority multipliers and the batch cap are environment settings, and the engine is off by default with a one-variable rollback.
- **Known limitations.**
  - When providers are plentiful, mean ETA is longer than the existing solver's (159 s vs 105 s at default weights; E 0.70 narrows it to 112 s).
  - At default weights there is no measurable fairness gain. A higher fairness weight lowers workload Gini by about 30 % at normal load, at an ETA cost, and has no effect under peak load.
  - Under overload a greedy policy serves about 4.7 % more requests (913 vs 872), because batch-optimal priority-first matching is myopic.
  - Strict priority can leave normal requests unserved when providers are scarce.
  - Production ETA depends on a public OSRM server (`08-limitations.md`).
