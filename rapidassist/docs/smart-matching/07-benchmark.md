# Smart Matching — Benchmark

Script: `server/scripts/benchmark-matching.js` (`npm run benchmark:matching`). Raw results: `benchmark-results/` (`single-batch.*`, `runtime.*`, `simulation.*` as JSON and CSV, `environment.json`). All tables below are generated into `benchmark-results/summary.md` by the same run.

**Environment (measured run):** Node v22.22.1 · 13th Gen Intel Core i5-13420H (12 logical cores) · 15 GiB · Linux 7.0.0-43 · run at 2026-11-24T11:25Z. Total wall time ≈ 25 s.

## 1. Read this first

- **(d) optimises the new cost**, so beating the others on *total new cost* is expected and proves little. It is reported for completeness. The independent evidence is **match rate, urgent/high match rate, ETA, and (in the simulation) served share, wait and fairness**. Section 6 shows where (d) is **not** better.
- **(c) and (d) are both exactly optimal** for their own objectives. Phase 3 proved their totals equal on identical matrices (`04-hungarian.md` §6). Every quality difference between (c) and (d) below therefore comes from the **cost function and the unmatched/priority policy**, not from the algorithm. The only structural difference is that (c) has a "wait" option that can leave a matchable request unmatched when travel is costlier than waiting. That happened once here: `balanced/uniform/100x100`, 99 of 100.
- **Synthetic data.** The numbers describe these generated cities, not RapidAssist production traffic. No real historical data was used, and none exists yet.

## 2. Method

**Approaches**, all on identical inputs, the same eligible pairs (same category, straight-line distance ≤ 8 km) and the same ETAs:

| | Approach | Code |
|---|---|---|
| (a) | nearest-provider-first: requests in arrival order, each takes the free provider with the shortest ETA | benchmark only |
| (b) | greedy lowest **new** cost: repeatedly take the globally cheapest remaining pair | benchmark only, uses production `pairCost` |
| (c) | existing min-cost flow, own cost (priority × travel seconds, wait = priority × (2700 s + waited)) | production `services/assignmentSolver.js` |
| (d) | smart Hungarian: new cost, unmatched = U_batch × priority, per category | production `matching/smartBatch.js` (same function the dispatcher calls) |

**ETA:** straight line at 25 km/h with a 60 s floor (`services/travelTimeMatrix.js` `fallbackBlock`) for every approach. **OSRM is excluded on purpose.** It is a network service whose answers and latency change between runs, and the benchmark must be reproducible. Production uses OSRM when reachable (see `08-limitations.md`).

**Determinism:** all inputs come from fixed seeds (mulberry32, seeded by case name). Two full runs produced identical results apart from wall-clock timings. This was checked field by field, and `test/benchmarkMatching.test.js` asserts it on every `npm test`.

**Synthetic city:** a 20 × 20 km area. *Uniform*: points uniform. *Clustered*: 5 centres, Gaussian spread σ = 2 km. Providers: 30 % cold-start (no offer history), ratings with 0–150 reviews, acceptance propensity 55–98 %, prior workload 0–6 jobs. Requests waited 0–150 s.
- Default priority mix: 80 % normal, 15 % high, 5 % urgent.
- *Mixed-priority* mix: 50 % normal, 25 % high, 25 % urgent.
- *Mixed-categories*: 40 % mechanic, 35 % fuel, 25 % towing.

**Single-batch scenarios** (each in uniform and clustered geography, 22 cases, 3,280 requests in total). Sizes are requests × providers:
- balanced: 10×10, 50×50, 100×100, 300×300
- scarce: 100×20, 300×60
- abundant: 20×100, 60×300
- mixed-priority: 100×40, 300×120
- mixed-categories: 300×300

**Maximum possible matches** per case comes from an independent maximum bipartite matching (augmenting paths).

**Simulation:** 10 s batches.
- Requests arrive as a Poisson stream, wait at most 180 s, are offered to one provider at a time, and are never re-offered to a provider who declined or let the offer expire.
- Each provider accepts with a personal propensity. The answer is seeded per request–provider pair, so every approach gets the same answer to the same offer. A non-accepted offer is declined after 10 s (60 %) or expires after 20 s.
- After accepting, a provider is busy for travel plus 8–25 min of service, and ends at the pickup point.
- Outcomes feed the live acceptance and response statistics (terms A and S); accepted jobs feed workload (term F).
- Scenarios:
  - 60 providers, normal load (0.35 arrivals per batch) and peak load (0.7), each in uniform and clustered geography, 360 batches (1 h).
  - Large: 300 providers, 4.0 arrivals per batch, 360 batches. This is overloaded: roughly 160 % of capacity.

## 3. Headline: single batch, all 22 cases

| approach | cases at max matches | matched / possible | urgent matched | high matched | normal matched | mean ETA (s) | mean pair cost per match |
|---|---|---|---|---|---|---|---|
| (a) nearest-first | 12/22 | 2084/2122 | 166/331 (50.2%) | 330/556 (59.4%) | 1588/2393 (66.4%) | 243 | 36.11 |
| (b) greedy new-cost | 12/22 | 2066/2122 | 302/331 (91.2%) | 364/556 (65.5%) | 1400/2393 (58.5%) | 188 | 33.71 |
| (c) existing min-cost flow | 21/22 | 2121/2122 | 331/331 (100.0%) | 470/556 (84.5%) | 1320/2393 (55.2%) | 206 | 34.63 |
| (d) smart Hungarian | **22/22** | **2122/2122** | **331/331 (100.0%)** | **473/556 (85.1%)** | 1318/2393 (55.1%) | 211 | 34.29 |

What this shows:
- **Match rate:** (d) always reaches the maximum possible number of matches, as proved in `04-hungarian.md`. (c) misses one match in one case. (a) and (b) leave 38 and 56 matchable requests unmatched.
- **Priority:** (c) and (d) serve every urgent request and the most high-priority requests. (a) serves only half of the urgent ones, (b) 91 %.
- **Normal requests pay for this:** when providers are scarce, (c) and (d) serve the fewest normal requests (55 %) and (a) the most (66 %). This is the intended priority policy, not a defect, but it is a real trade-off.
- **ETA:** (b) has the shortest mean ETA (188 s). (d) is 5 s slower than (c) and 32 s faster than (a).

## 4. Selected cases (largest size per scenario)

Full table with all 44 rows: `benchmark-results/summary.md`. Urgent / high / normal give matched / requests.

| case | approach | matched / max | cost / match | mean ETA (s) | p90 ETA (s) | urgent | high | normal |
|---|---|---|---|---|---|---|---|---|
| balanced/clustered/300x300 | (a) | 297/300 | 34.57 | 161 | 317 | 13/14 | 45/45 | 239/241 |
| | (b) | 292/300 | 33.98 | 149 | 302 | 14/14 | 45/45 | 233/241 |
| | (c) | 300/300 | 33.91 | 137 | 255 | 14/14 | 45/45 | 241/241 |
| | (d) | **300/300** | **33.84** | **134** | **226** | 14/14 | 45/45 | 241/241 |
| scarce/uniform/300x60 | (a) | 60/60 | 40.88 | 423 | 883 | 4/12 | 6/41 | 50/247 |
| | (b) | 60/60 | **32.90** | **140** | **245** | 11/12 | 12/41 | 37/247 |
| | (c) | 60/60 | 36.22 | 320 | 643 | 12/12 | 41/41 | 7/247 |
| | (d) | 60/60 | 36.16 | 317 | 623 | **12/12** | **41/41** | 7/247 |
| abundant/uniform/60x300 | (a) | 60/60 | 31.89 | 111 | 168 | 5/5 | 8/8 | 47/47 |
| | (b) | 60/60 | 28.99 | 158 | 268 | 5/5 | 8/8 | 47/47 |
| | (c) | 60/60 | 31.82 | **105** | **164** | 5/5 | 8/8 | 47/47 |
| | (d) | 60/60 | **28.82** | 151 | 278 | 5/5 | 8/8 | 47/47 |
| mixed-priority/uniform/300x120 | (a) | 120/120 | 34.51 | 279 | 564 | 34/82 | 19/70 | 67/148 |
| | (b) | 120/120 | 28.76 | **140** | **247** | 76/82 | 24/70 | 20/148 |
| | (c) | 120/120 | 29.12 | 174 | 356 | 82/82 | 38/70 | 0/148 |
| | (d) | 120/120 | 29.02 | 171 | 304 | **82/82** | 38/70 | 0/148 |
| mixed-categories/clustered/300x300 | (a) | 282/283 | 36.56 | 235 | 510 | 20/22 | 57/60 | 205/218 |
| | (b) | 282/283 | 35.79 | 220 | 479 | 22/22 | 57/60 | 203/218 |
| | (c) | 283/283 | 35.15 | **181** | **369** | 22/22 | 60/60 | 201/218 |
| | (d) | **283/283** | **34.75** | 182 | 374 | 22/22 | 60/60 | 201/218 |

**Per-priority ETA (mixed-priority, 25 % urgent).** (c) and (d) both serve 100 % of urgent requests. Their urgent ETAs are 143 s vs 167 s (uniform 300×120) and 119 s vs 144 s (clustered 300×120): **(c) gives urgent requests shorter ETAs**, because its cost is purely priority × travel time. For high-priority requests (d) is faster: 179 s vs 240 s and 135 s vs 188 s. Full table in `summary.md`.

## 5. Runtime per batch (balanced, uniform; 30 timed runs after 2 warm-ups)

| R = P | eligible pairs | (a) median / p95 (ms) | (b) median / p95 (ms) | (c) median / p95 (ms) | (d) median / p95 (ms) |
|---|---|---|---|---|---|
| 10 | 35 | 0.01 / 0.01 | 0.02 / 0.03 | 0.03 / 0.06 | 0.04 / 0.06 |
| 50 | 864 | 0.13 / 0.14 | 0.53 / 1.09 | 1.11 / 1.53 | 1.02 / 2.75 |
| 100 | 3589 | 0.51 / 0.53 | 2.37 / 3.05 | 8.22 / 9.29 | 5.57 / 7.88 |
| 200 | 13950 | 2.17 / 3.27 | 14.20 / 18.98 | 78.48 / 92.74 | 27.14 / 28.71 |
| 300 | 30865 | 5.92 / 6.75 | 37.73 / 47.53 | 368.39 / 474.27 | **66.81 / 73.45** |

(d)'s time includes computing all R × P pair costs and the per-category planning. At 300 × 300 it is about 5.5 × faster than the existing solver (median), but about 11 × slower than nearest-first and 1.8 × slower than greedy. All are far below the 2 s worker interval. Single-batch timings in §4 / `summary.md` are single runs and noisier: (c) measured 297–1100 ms at 300 × 300 in individual runs.

## 6. Multi-round simulation

| scenario | approach | served | lost | urgent served | mean wait (s) | mean ETA (s) | utilization | Gini (jobs/provider) | std-dev | re-opt after decline median / p95 (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| uniform, normal load (118 arrivals) | (a) | 115 (97.5%) | 3 | 6/7 | 18 | 435 | 60.2% | 0.160 | 0.61 | 0.004 / 0.009 |
| | (b) | 116 (98.3%) | 2 | 7/7 | 15 | 444 | 60.4% | 0.164 | 0.63 | 0.008 / 0.042 |
| | (c) | 115 (97.5%) | 3 | 6/7 | 18 | 435 | 60.2% | 0.160 | 0.61 | 0.014 / 0.033 |
| | (d) | 116 (98.3%) | 2 | 7/7 | 15 | 444 | 60.4% | 0.164 | 0.63 | 0.015 / 0.056 |
| uniform, peak (235) | (a) | 150 (63.8%) | 83 | 11/17 | 66 | 599 | 83.9% | 0.106 | 0.53 | 0.004 / 0.021 |
| | (b) | 151 (64.3%) | 81 | 11/17 | 52 | 501 | 83.8% | 0.099 | 0.50 | 0.004 / 0.029 |
| | (c) | **154 (65.5%)** | 80 | 13/17 | 55 | 548 | 84.0% | 0.103 | 0.53 | 0.022 / 0.056 |
| | (d) | 152 (64.7%) | 80 | 13/17 | **46** | 541 | 84.0% | 0.105 | 0.53 | 0.039 / 0.104 |
| clustered, normal (119) | (a) | 119 (100%) | 0 | 4/4 | 15 | 283 | 55.7% | 0.159 | 0.65 | 0.002 / 0.006 |
| | (b) | 119 (100%) | 0 | 4/4 | 15 | 314 | 56.7% | 0.166 | 0.65 | 0.011 / 0.033 |
| | (c) | 119 (100%) | 0 | 4/4 | 15 | 283 | 55.7% | 0.159 | 0.65 | 0.011 / 0.030 |
| | (d) | 119 (100%) | 0 | 4/4 | 15 | 314 | 56.7% | 0.166 | 0.65 | 0.019 / 0.047 |
| clustered, peak (245) | (a) | 168 (68.6%) | 67 | 8/14 | 78 | 473 | 87.5% | **0.084** | 0.51 | 0.002 / 0.009 |
| | (b) | 167 (68.2%) | 69 | 10/14 | 52 | **387** | 86.9% | 0.103 | 0.58 | 0.006 / 0.039 |
| | (c) | **169 (69.0%)** | 70 | 11/14 | **45** | 405 | 87.1% | 0.111 | 0.62 | 0.014 / 0.044 |
| | (d) | 162 (66.1%) | 74 | **12/14** | 46 | 431 | 87.0% | 0.102 | 0.56 | 0.014 / 0.061 |
| large, overloaded (1504; batches ≈ 41 req × 35 free prov) | (a) | 819 (54.5%) | 608 | 49/84 | 111 | 525 | 89.0% | 0.086 | 0.50 | 0.012 / 0.181 |
| | (b) | **913 (60.7%)** | 528 | 72/84 | 60 | **257** | 89.0% | **0.082** | 0.54 | 0.044 / 0.420 |
| | (c) | 880 (58.5%) | 557 | **83/84** | 51 | 370 | 89.0% | 0.083 | 0.53 | 0.178 / 0.351 |
| | (d) | 872 (58.0%) | 575 | 82/84 | **48** | 361 | 89.0% | 0.088 | 0.55 | 0.424 / 0.892 |

Arrivals, declines/expiries, idle providers, batch sizes and solve times for every row: `summary.md` and `simulation.json`.

## 7. Where (d) is not better (honest findings)

1. **Throughput under overload.** In the large overloaded city, **greedy (b) served the most requests** (913 against (d)'s 872: (d) served 4.5 % fewer, greedy 4.7 % more) with a much shorter mean ETA (257 s against 361 s). Batch-optimal assignment is myopic: making the most matches *now*, priority first, sends providers on longer trips. That keeps them busy longer, and fewer requests are served over the hour. (c) behaves the same way (880). In the 60-provider peak runs, (d) is not the best either: clustered peak served 66.1 % against 69.0 % for (c).
2. **ETA when providers are abundant.** With many providers to choose from, (d) picks better-rated, less-loaded and more reliable providers over the nearest one. Mean ETA is 151 s against 105 s for (c) (abundant/uniform 60×300) and 141 s against 83 s (clustered), at equal match counts. This follows directly from E being only 30 % of the cost. Raising `MATCHING_WEIGHT_E` would move (d) towards (c).
3. **Urgent ETA.** (c) reaches urgent requests faster (143 s vs 167 s, 119 s vs 144 s); (d) reaches high-priority requests faster.
4. **Fairness did not improve measurably at the default weights** (confirmed over 10 seeds in §9.1; higher F weights do improve it). Gini of jobs per provider is within ±0.02 of the other approaches in every run, and in the overloaded run (d) is slightly *less* even (0.088 against 0.082–0.086). In a 1-hour simulation, F (weight 0.10) rarely outweighs ETA, and load, not the matcher, decides who works. The fairness term is therefore **not demonstrated** by this benchmark.
5. **Normal-priority service when providers are scarce.** Serving every urgent and high request first leaves few providers for normal requests (scarce/uniform 300×60: 7 of 247 normal requests matched by (c) and (d), against 50 by (a)). This is the agreed policy (Option B), shown here with its cost.
6. **Speed.** (d) is slower than (a) and (b) at every size, and the slowest in the simulation (re-optimisation p95 0.89 ms against 0.18–0.42 ms) because it prices every pair. In absolute terms it is negligible: median 0.42 ms and worst single batch 6.3 ms in the overloaded simulation, and 73 ms p95 for a 300 × 300 batch.

## 8. Where (d) is better

- **Always the maximum number of matches** (22/22 cases), and **100 % urgent** in single batches. In the simulations, urgent requests served are within one of the best in every run (82/84 against 83/84 for (c) in the overloaded city), far above (a), which served 49/84.
- **Lowest mean wait** in 2 of the 3 loaded runs: 46 s at uniform peak and 48 s in the overloaded city. In the clustered peak run (c) is 1 s faster (45 s against 46 s). The slowest approach in those runs, (a), waited 66–111 s.
- **Best ETA and p90 ETA in the balanced clustered 300 × 300 batch** (134 s / 226 s), and the best or tied-best cost per match among approaches that reach the maximum matches.
- **5.5 × faster than the existing solver at 300 × 300.**

## 9. Weight sensitivity of (d)

Only (d)'s weights change: one or two weights are raised, and the others are scaled down proportionally so the total stays 1. The main result files above are untouched (SHA-256 checked).
- **10 seeds per scenario (primary results, §9.1):** generated by `node scripts/benchmark-matching.js --only=sensitivity --seeds=10` (≈ 80 s). Seed 0 is the original seed; seeds 1–9 generate different cities, providers, arrivals and offer answers. Raw files: `benchmark-results/sensitivity-multiseed.json` / `.csv` and `sensitivity-multiseed-summary.md`, which contain every per-seed value.
- **Seed 0 alone (detail, §9.2):** generated by `--only=sensitivity` (also part of the full run), with raw files in `sensitivity.json` / `.csv` and `sensitivity-summary.md`.

| variant | E | Q | A | S | F | T |
|---|---|---|---|---|---|---|
| default | 0.300 | 0.200 | 0.150 | 0.100 | 0.100 | 0.150 |
| ETA-heavy | **0.500** | 0.143 | 0.107 | 0.071 | 0.071 | 0.107 |
| ETA-dominant | **0.700** | 0.086 | 0.064 | 0.043 | 0.043 | 0.064 |
| fairness-heavy | 0.233 | 0.156 | 0.117 | 0.078 | **0.300** | 0.117 |
| quality-heavy | 0.244 | **0.350** | 0.122 | 0.081 | 0.081 | 0.122 |
| ETA + fairness | **0.450** | 0.100 | 0.075 | 0.050 | **0.250** | 0.075 |

### 9.1 Ten seeds per scenario (mean ± sample std-dev)

**Δ** = the mean of the per-seed *paired* differences to the default. Each pair uses the same seed, so the same city, requests and offer answers. **†** marks a Δ whose magnitude is larger than the standard deviation of those paired differences (the "exceeds one std dev" test). Some † differences are tiny (0–1 s) and pass only because the paired spread is very small; they are statistically consistent but practically irrelevant.

| variant | mean ETA (s) | urgent ETA (s) | abundant-supply ETA (s) | Gini, uniform normal load | Gini, clustered normal load | overloaded: served |
|---|---|---|---|---|---|---|
| (d) default | 209 ± 9 | 216 ± 14 | 157 ± 11 | 0.137 ± 0.025 | 0.153 ± 0.020 | 869.7 ± 9.5 |
| (d) ETA-heavy (E 0.50) | 205 ± 9 (Δ −3 †) | 214 ± 14 (Δ −2 †) | 126 ± 7 (Δ −31 †) | 0.150 ± 0.029 (Δ +0.013) | 0.150 ± 0.030 (Δ −0.002) | 872.2 ± 13.1 (Δ +2.5) |
| (d) ETA-dominant (E 0.70) | 204 ± 9 (Δ −5 †) | 213 ± 14 (Δ −3 †) | 108 ± 5 (Δ −49 †) | 0.153 ± 0.030 (Δ +0.016) | 0.155 ± 0.021 (Δ +0.002) | 871.2 ± 9.4 (Δ +1.5) |
| (d) fairness-heavy (F 0.30) | 213 ± 9 (Δ +4 †) | 217 ± 15 (Δ +1 †) | 202 ± 10 (Δ +44 †) | **0.113 ± 0.018 (Δ −0.024 †)** | **0.112 ± 0.016 (Δ −0.041 †)** | 869.8 ± 10.6 (Δ +0.1) |
| (d) quality-heavy (Q 0.35) | 209 ± 9 (Δ +1 †) | 215 ± 15 (Δ −0) | 163 ± 11 (Δ +6 †) | 0.146 ± 0.028 (Δ +0.009) | 0.149 ± 0.026 (Δ −0.004) | 868.6 ± 13.0 (Δ −1.1) |
| (d) ETA + fairness (E 0.45, F 0.25) | 209 ± 9 (Δ +0) | 215 ± 14 (Δ −1) | 161 ± 10 (Δ +3) | **0.121 ± 0.020 (Δ −0.016 †)** | **0.121 ± 0.023 (Δ −0.032 †)** | 871.1 ± 11.2 (Δ +1.4) |
| (c) existing (reference) | 204 ± 9 (Δ −4 †) | 168 ± 8 (Δ −48 †) | 101 ± 5 (Δ −56 †) | 0.152 ± 0.032 (Δ +0.015) | 0.160 ± 0.026 (Δ +0.007) | 873.4 ± 9.3 (Δ +3.7) |
| (b) greedy (reference) | 188 ± 4 (Δ −21 †) | 180 ± 3 (Δ −36 †) | 161 ± 11 (Δ +3 †) | 0.138 ± 0.024 (Δ +0.001) | 0.152 ± 0.021 (Δ −0.000) | 915.2 ± 9.7 (Δ +45.5 †) |

Match and per-priority match rates are not shown because they are identical for every weight set of (d) on every seed. Which requests are served is decided by the priority rule, not by the weights.

**Findings (10 seeds).**
- **Abundant-supply ETA gap with (c):** a higher E weight **almost closes it**. At E 0.70 it is 108 ± 5 s against 101 ± 5 s for (c), compared with 157 ± 11 s at default weights. The overall mean ETA then matches (c) (204 s). E 0.50 closes a bit over half of it (126 s).
- **Urgent ETA gap: no weight set closes it.** Every variant of (d) stays at 213–217 s against 168 ± 8 s for (c), a gap of about 45–49 s. Raising E moves it by only 2–3 s. The cause is structural: (c) multiplies urgent travel time by 4 inside its cost, while (d) uses priority only to decide *who* is served. This is why it is listed as future work in `08-limitations.md`.
- **Fairness: a higher F weight improves it significantly at normal load.**
  - F 0.30: Gini 0.137 → 0.113 (−18 %, uniform) and 0.153 → 0.112 (−27 %, clustered). The cost is a significantly longer ETA with abundant supply (+44 s) and +4 s overall.
  - **ETA + fairness (E 0.45, F 0.25):** Gini 0.121 and 0.121 (−12 % and −21 %, both †), with **no significant ETA change** (+0 s mean, +3 s abundant, −1 s urgent).
- **At default weights (d) is not significantly fairer than (c)** (Gini Δ of (c) +0.015 / +0.007, not †). This confirms §7 point 4.
- **Throughput under overload:** no weight set changes it (all Δ within ±2.5, not †). (c) is not significantly different either (+3.7). Only greedy serves significantly more (+45.5 ± 9.7 †, about +5 %).
- **Quality-heavy:** no meaningful change.

### 9.2 Seed 0 detail (the original single-seed run)

These numbers are from one seed only. Use §9.1 for conclusions; the seed-0 default Gini (0.164 / 0.166), for example, is above the 10-seed mean (0.137 / 0.153).

**Single batch (22 cases).** Match and per-priority rates are identical for every weight set of (d): 2122/2122 matched, 100 % / 85.1 % / 55.1 %.

| variant | mean ETA (s) | urgent ETA (s) | high ETA (s) | abundant scenarios: mean ETA (s) | mixed-priority: urgent ETA (s) |
|---|---|---|---|---|---|
| (d) default | 211 | 219 | 232 | 159 | 195 |
| (d) ETA-heavy | 208 | 215 | 230 | 132 | 194 |
| (d) ETA-dominant | **206** | 211 | 230 | **112** | 190 |
| (d) fairness-heavy | 216 | 222 | 232 | 205 | 196 |
| (d) quality-heavy | 212 | 220 | 232 | 168 | 196 |
| (d) ETA + fairness | 212 | 215 | 233 | 165 | 190 |
| (c) existing (reference) | 206 | **170** | **209** | **105** | **172** |
| (b) greedy (reference) | 188 | 179 | 162 | 165 | 163 |

(The abundant-scenario mean here covers all four abundant cases, so the default's 159 s differs from the single 60×300 case quoted in §4.)

**Simulation: workload Gini (lower = more even) and served / mean ETA.**

| variant | uniform normal | uniform peak | clustered normal | clustered peak | large overload | overload served / ETA (s) |
|---|---|---|---|---|---|---|
| (d) default | 0.164 | 0.105 | 0.166 | 0.102 | 0.088 | 872 / 361 |
| (d) ETA-heavy | 0.164 | 0.106 | 0.170 | 0.079 | 0.093 | 869 / 369 |
| (d) ETA-dominant | 0.150 | 0.105 | 0.179 | 0.084 | 0.087 | 877 / 369 |
| (d) fairness-heavy | **0.112** | 0.105 | **0.117** | 0.102 | 0.085 | 874 / 360 |
| (d) quality-heavy | 0.137 | 0.105 | 0.148 | 0.077 | 0.088 | 862 / 382 |
| (d) ETA + fairness | 0.118 | 0.106 | 0.141 | **0.068** | **0.081** | 872 / 358 |
| (c) existing (reference) | 0.160 | 0.103 | 0.159 | 0.111 | 0.083 | 880 / 370 |
| (b) greedy (reference) | 0.164 | **0.099** | 0.166 | 0.103 | 0.082 | **913 / 257** |

Served, ETA and urgent-served counts for every simulation: `sensitivity-summary.md`.

**Recommendation (defaults unchanged pending your approval).**
- **E 0.45 / F 0.25** is the best measured compromise. It gives a significant fairness gain (−12 % / −21 % Gini at normal load) with no significant change in ETA, matches or throughput.
- If parity with the existing solver's ETA under abundant supply matters most, **E ≈ 0.70** almost closes that gap (108 s vs 101 s), but it gives up the small fairness advantage.
- No weight set fixes the urgent-ETA gap or the overload throughput gap with greedy. Those need design changes (`08-limitations.md`), not tuning.
- All of this is on synthetic data. Before changing the default, it should ideally be confirmed on real offer and ETA data.

## 10. Reproduce

```
cd rapidassist/server
npm run benchmark:matching          # ≈ 35 s; rewrites docs/smart-matching/benchmark-results/ (incl. seed-0 sensitivity)
node scripts/benchmark-matching.js --only=sensitivity   # ≈ 9 s; only the seed-0 sensitivity files
node scripts/benchmark-matching.js --only=sensitivity --seeds=10   # ≈ 80 s; the 10-seed sensitivity files
```

Quality metrics are identical on every machine. Timings depend on the CPU.
