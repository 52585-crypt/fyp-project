# Smart Matching — Known Limitations

## ETA and geography
- **Benchmarks use straight-line ETA** (25 km/h, 60 s floor) for reproducibility. Real roads, one-way streets and traffic would change both the ETA term and which pairs look close. No benchmark result has been checked against road ETAs.
- **Production ETA depends on the public OSRM demo server** (`router.project-osrm.org`, `services/travelTimeMatrix.js`): no key, rate-limited, no SLA, not intended for production load. If it fails, the dispatcher silently uses straight-line ETAs for that batch (`routeSource: "haversine_fallback"` on the offer). Matrices are cached for 20 s. A self-hosted OSRM (`OSRM_TABLE_URL`) or a paid routing API would be needed for real traffic.
- **The 8 km radius is straight-line**, while E uses road time when available. A provider 7.9 km away in a straight line may need a much longer drive. E then clamps at 100 but the pair stays eligible.
- **ETA starts from the last reported GPS fix.** It can be up to 180 s old (the freshness limit), and providers report about every 10 s.

## Data and cold start
- **No real historical data exists.** Weights (E .30, Q .20, A .15, S .10, F .10, T .15), the rating prior (4.0, weight 5) and the neutral value (50) are reasoned defaults, not fitted.
- **Cold start:** A and S stay neutral (50) until a provider has 5 offer outcomes. New providers sit at the rating prior. Until the platform has offer history, the cost is mostly E, Q and T.
- **`expiredOffers`** is recorded from Phase 4 onwards. The first stats refresh after deployment also counts expired offers that were already in the database, which can lower a provider's A term once.
- **F (fairness)** counts assignments in the last 8 h by `acceptedAt`, including jobs later cancelled. In the benchmark it **did not measurably improve fairness** (Gini within ±0.02 of the other approaches). At weight 0.10 it rarely outweighs ETA.

## Optimisation behaviour
- **Myopic batches.** Each 2 s batch is optimal for that moment only: no forecasting and no holding a provider back for a likely urgent request. Under heavy overload the benchmark shows a greedy lowest-cost policy serving about 4.7 % more requests over an hour (913 vs 872), because shorter trips free providers sooner.
- **Strict priority** (Option B, lexicographic): an urgent request always wins a contested provider over any number of cost points. When providers are scarce, normal requests can be starved within a batch (scarce scenario: 7 of 247 normal requests matched). The 180 s timeout still ends their search, and they can retry. Multipliers are configurable, but any strictly increasing integers behave the same, so softer priority would need a different design.
- **Urgent ETA is longer than with the existing solver**: 216 ± 14 s vs 168 ± 8 s over 10 seeds (`07-benchmark.md` §9.1). The cost balances rating, reliability and workload rather than pure travel time, and priority only decides *who* is served, not *how close* their provider is. No weight setting closes this gap; see Future work.
- **Batch cap** of 300 requests and 300 providers per category per batch (`MATCHING_MAX_BATCH_SIZE`). Above it, the highest-priority/oldest requests are admitted and the rest wait for the next batch. Providers are pre-filtered by best ETA, which is a heuristic, so the result is then optimal only within the admitted set.
- **Quantisation:** pair costs are rounded to 0.001 before solving (for exact integer arithmetic). Ties closer than that are broken by the deterministic order.

## Runtime and deployment
- **Single-process worker.** The batch lock is in-process. Several server instances would each run batches. Correctness is still protected by conditional updates and unique indexes (one pending offer per provider, one active job per provider), and the two-instance race test confirms this, but work is duplicated and some offers fail and are re-planned. Production should run exactly one dispatch worker.
- **No debounce / event trigger** (deliberately skipped): a new request, decline or location update waits for the next 2 s worker tick.
- **Transactions are not used.** Multi-document steps rely on conditional updates, rollback and the recovery sweep (about every 30 s). An orphaned pending offer can block its provider until the sweep withdraws it: at most about 20 s past its expiry plus one sweep interval.
- **If the pending-offer index cannot be built** at startup (existing duplicates), only the application-level reservation guard remains until the cleanup script is run (`05-schema-api-events.md` §3).
- Integration tests use a standalone in-memory MongoDB. Replica-set-specific behaviour (for example, failover during a batch) is not tested.

## Product surface
- The admin panel UI shows neither the `costBreakdown` nor the API's `explanation` string. Inspection is via the API or the database.
- On a 409 from extra-work request or approval, the mobile app shows the conflict message, but it refreshes through the socket event or the 5 s polling rather than an immediate refetch (up to 5 s stale when the socket is down).
- Opt-in `MATCHING_MAX_ATTEMPTS` ends a search *earlier* than the 180 s timeout. That is why it is off by default.
- The benchmark is synthetic (generated cities, propensities and service times). It compares approaches under identical assumptions. It does not predict production KPIs.

## Future work

**Per-priority ETA multiplier (addresses the urgent-ETA gap; not implemented).**

*Idea.* Add an optional multiplier `m_p` per priority (for example normal 1, high 1.5, urgent 3; default 1 for all, which reproduces today's behaviour exactly) that scales only the ETA term of a pair:

```
C(i,j) = m_p(i) · wE · E + wQ · Q + wA · A + wS · S + wF · F + wT · T
```

Inside an urgent request's row, ETA differences between candidate providers then weigh `m_p` times more, so the urgent request is steered towards the nearest suitable provider. This is the effect the existing solver gets from multiplying urgent travel time by 4.

*Why it is safe with the current guarantees.* Priority still acts only through the unmatched cost `U_batch × multiplier`, so the objective order (maximum matches → highest matched priority → lowest real cost) is unchanged. `m_p` changes *which* provider an urgent request gets, never *whether* it is served.

*What would have to change.*
- **Maximum pair cost:** it becomes `100 · (1 + wE · (max m_p − 1))`. The U floor (`MAX_PAIR_COST · min(R,P) + 1`) and the numeric-safety bound must use this value instead of 100.
- **Config:** `MATCHING_ETA_MULTIPLIER_{NORMAL,HIGH,URGENT}`, validated (≥ 1, normal ≤ high ≤ urgent) and included in `numericBound`.
- **Stored breakdown:** keep reporting `E` unscaled and store `m_p` separately, so explanations and benchmark costs stay comparable.

*Expected trade-off.* Shorter urgent ETAs at the price of longer ETAs for the normal- and high-priority requests that lose those providers. It needs to be measured with the multi-seed benchmark (urgent ETA, overall ETA, fairness) before choosing defaults.
