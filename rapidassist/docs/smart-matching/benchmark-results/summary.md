# Benchmark summary (generated)

Node v22.22.1 · 13th Gen Intel(R) Core(TM) i5-13420H (12 logical cores) · linux 7.0.0-43-generic · ETA: straight line at 25 km/h, 60 s floor (services/travelTimeMatrix.js fallbackBlock); OSRM excluded

## Single batch: all cases

| approach | cases at max matches | matched / possible | urgent matched | high matched | normal matched | mean ETA (s) | mean pair cost per match |
|---|---|---|---|---|---|---|---|
| (a) nearest-first | 12/22 | 2084/2122 | 166/331 (50.2%) | 330/556 (59.4%) | 1588/2393 (66.4%) | 243 | 36.11 |
| (b) greedy new-cost | 12/22 | 2066/2122 | 302/331 (91.2%) | 364/556 (65.5%) | 1400/2393 (58.5%) | 188 | 33.71 |
| (c) existing min-cost flow | 21/22 | 2121/2122 | 331/331 (100.0%) | 470/556 (84.5%) | 1320/2393 (55.2%) | 206 | 34.63 |
| (d) smart Hungarian | 22/22 | 2122/2122 | 331/331 (100.0%) | 473/556 (85.1%) | 1318/2393 (55.1%) | 211 | 34.29 |

Requests in all cases combined: 3280.

## Single batch: per case (largest size per scenario)

| case | approach | matched / max | total pair cost | cost / match | mean ETA (s) | p90 ETA (s) | urgent | high | normal | solve (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| balanced/uniform/300x300 | (a) nearest-first | 284/300 | 10013 | 35.26 | 197 | 381 | 12/12 | 42/45 | 230/243 | 10.2 |
| balanced/uniform/300x300 | (b) greedy new-cost | 281/300 | 9579 | 34.09 | 165 | 302 | 12/12 | 45/45 | 224/243 | 40.1 |
| balanced/uniform/300x300 | (c) existing min-cost flow | 300/300 | 10689 | 35.63 | 210 | 429 | 12/12 | 45/45 | 243/243 | 297.5 |
| balanced/uniform/300x300 | (d) smart Hungarian | 300/300 | 10653 | 35.51 | 206 | 416 | 12/12 | 45/45 | 243/243 | 83.7 |
| balanced/clustered/300x300 | (a) nearest-first | 297/300 | 10266 | 34.57 | 161 | 317 | 13/14 | 45/45 | 239/241 | 8.1 |
| balanced/clustered/300x300 | (b) greedy new-cost | 292/300 | 9922 | 33.98 | 149 | 302 | 14/14 | 45/45 | 233/241 | 70.1 |
| balanced/clustered/300x300 | (c) existing min-cost flow | 300/300 | 10174 | 33.91 | 137 | 255 | 14/14 | 45/45 | 241/241 | 1099.9 |
| balanced/clustered/300x300 | (d) smart Hungarian | 300/300 | 10151 | 33.84 | 134 | 226 | 14/14 | 45/45 | 241/241 | 107.2 |
| scarce/uniform/300x60 | (a) nearest-first | 60/60 | 2453 | 40.88 | 423 | 883 | 4/12 | 6/41 | 50/247 | 0.6 |
| scarce/uniform/300x60 | (b) greedy new-cost | 60/60 | 1974 | 32.90 | 140 | 245 | 11/12 | 12/41 | 37/247 | 4.8 |
| scarce/uniform/300x60 | (c) existing min-cost flow | 60/60 | 2173 | 36.22 | 320 | 643 | 12/12 | 41/41 | 7/247 | 35.5 |
| scarce/uniform/300x60 | (d) smart Hungarian | 60/60 | 2170 | 36.16 | 317 | 623 | 12/12 | 41/41 | 7/247 | 81.7 |
| scarce/clustered/300x60 | (a) nearest-first | 60/60 | 2217 | 36.95 | 278 | 504 | 2/22 | 6/40 | 52/238 | 0.7 |
| scarce/clustered/300x60 | (b) greedy new-cost | 60/60 | 1886 | 31.43 | 152 | 294 | 19/22 | 17/40 | 24/238 | 8.0 |
| scarce/clustered/300x60 | (c) existing min-cost flow | 60/60 | 2034 | 33.90 | 286 | 519 | 22/22 | 37/40 | 1/238 | 45.2 |
| scarce/clustered/300x60 | (d) smart Hungarian | 60/60 | 2060 | 34.33 | 304 | 602 | 22/22 | 38/40 | 0/238 | 80.8 |
| abundant/uniform/60x300 | (a) nearest-first | 60/60 | 1913 | 31.89 | 111 | 168 | 5/5 | 8/8 | 47/47 | 1.3 |
| abundant/uniform/60x300 | (b) greedy new-cost | 60/60 | 1739 | 28.99 | 158 | 268 | 5/5 | 8/8 | 47/47 | 4.1 |
| abundant/uniform/60x300 | (c) existing min-cost flow | 60/60 | 1909 | 31.82 | 105 | 164 | 5/5 | 8/8 | 47/47 | 11.4 |
| abundant/uniform/60x300 | (d) smart Hungarian | 60/60 | 1729 | 28.82 | 151 | 278 | 5/5 | 8/8 | 47/47 | 6.0 |
| abundant/clustered/60x300 | (a) nearest-first | 60/60 | 1988 | 33.13 | 85 | 125 | 2/2 | 5/5 | 53/53 | 3.0 |
| abundant/clustered/60x300 | (b) greedy new-cost | 60/60 | 1732 | 28.87 | 141 | 250 | 2/2 | 5/5 | 53/53 | 9.8 |
| abundant/clustered/60x300 | (c) existing min-cost flow | 60/60 | 1990 | 33.17 | 83 | 125 | 2/2 | 5/5 | 53/53 | 24.1 |
| abundant/clustered/60x300 | (d) smart Hungarian | 60/60 | 1720 | 28.66 | 141 | 239 | 2/2 | 5/5 | 53/53 | 12.2 |
| mixed-priority/uniform/300x120 | (a) nearest-first | 120/120 | 4141 | 34.51 | 279 | 564 | 34/82 | 19/70 | 67/148 | 1.6 |
| mixed-priority/uniform/300x120 | (b) greedy new-cost | 120/120 | 3451 | 28.76 | 140 | 247 | 76/82 | 24/70 | 20/148 | 11.8 |
| mixed-priority/uniform/300x120 | (c) existing min-cost flow | 120/120 | 3494 | 29.12 | 174 | 356 | 82/82 | 38/70 | 0/148 | 89.0 |
| mixed-priority/uniform/300x120 | (d) smart Hungarian | 120/120 | 3483 | 29.02 | 171 | 304 | 82/82 | 38/70 | 0/148 | 105.1 |
| mixed-priority/clustered/300x120 | (a) nearest-first | 120/120 | 3991 | 33.25 | 223 | 581 | 25/74 | 32/70 | 63/156 | 2.2 |
| mixed-priority/clustered/300x120 | (b) greedy new-cost | 120/120 | 3424 | 28.53 | 124 | 213 | 68/74 | 32/70 | 20/156 | 33.7 |
| mixed-priority/clustered/300x120 | (c) existing min-cost flow | 120/120 | 3414 | 28.45 | 145 | 287 | 74/74 | 46/70 | 0/156 | 206.4 |
| mixed-priority/clustered/300x120 | (d) smart Hungarian | 120/120 | 3399 | 28.33 | 141 | 266 | 74/74 | 46/70 | 0/156 | 136.0 |
| mixed-categories/uniform/300x300 | (a) nearest-first | 281/282 | 10604 | 37.74 | 283 | 638 | 15/17 | 37/40 | 229/243 | 4.7 |
| mixed-categories/uniform/300x300 | (b) greedy new-cost | 276/282 | 9975 | 36.14 | 234 | 449 | 17/17 | 40/40 | 219/243 | 12.9 |
| mixed-categories/uniform/300x300 | (c) existing min-cost flow | 282/282 | 10179 | 36.10 | 220 | 426 | 17/17 | 40/40 | 225/243 | 102.2 |
| mixed-categories/uniform/300x300 | (d) smart Hungarian | 282/282 | 10102 | 35.82 | 220 | 421 | 17/17 | 40/40 | 225/243 | 29.4 |
| mixed-categories/clustered/300x300 | (a) nearest-first | 282/283 | 10311 | 36.56 | 235 | 510 | 20/22 | 57/60 | 205/218 | 5.7 |
| mixed-categories/clustered/300x300 | (b) greedy new-cost | 282/283 | 10093 | 35.79 | 220 | 479 | 22/22 | 57/60 | 203/218 | 22.1 |
| mixed-categories/clustered/300x300 | (c) existing min-cost flow | 283/283 | 9946 | 35.15 | 181 | 369 | 22/22 | 60/60 | 201/218 | 211.7 |
| mixed-categories/clustered/300x300 | (d) smart Hungarian | 283/283 | 9834 | 34.75 | 182 | 374 | 22/22 | 60/60 | 201/218 | 35.3 |

## Single batch: per-priority match rate and mean ETA (mixed-priority scenario, 25 % urgent)

| case | approach | urgent | urgent ETA (s) | high | high ETA (s) | normal | normal ETA (s) |
|---|---|---|---|---|---|---|---|
| mixed-priority/uniform/100x40 | (a) nearest-first | 48.3% | 491 | 23.1% | 331 | 44.4% | 346 |
| mixed-priority/uniform/100x40 | (b) greedy new-cost | 75.9% | 300 | 30.8% | 189 | 22.2% | 107 |
| mixed-priority/uniform/100x40 | (c) existing min-cost flow | 100.0% | 368 | 42.3% | 253 | 0.0% | – |
| mixed-priority/uniform/100x40 | (d) smart Hungarian | 100.0% | 368 | 42.3% | 253 | 0.0% | – |
| mixed-priority/uniform/300x120 | (a) nearest-first | 41.5% | 255 | 27.1% | 305 | 45.3% | 284 |
| mixed-priority/uniform/300x120 | (b) greedy new-cost | 92.7% | 146 | 34.3% | 144 | 13.5% | 113 |
| mixed-priority/uniform/300x120 | (c) existing min-cost flow | 100.0% | 143 | 54.3% | 240 | 0.0% | – |
| mixed-priority/uniform/300x120 | (d) smart Hungarian | 100.0% | 167 | 54.3% | 179 | 0.0% | – |
| mixed-priority/clustered/100x40 | (a) nearest-first | 22.7% | 376 | 44.4% | 296 | 45.1% | 457 |
| mixed-priority/clustered/100x40 | (b) greedy new-cost | 86.4% | 196 | 51.9% | 177 | 13.7% | 119 |
| mixed-priority/clustered/100x40 | (c) existing min-cost flow | 100.0% | 201 | 66.7% | 249 | 0.0% | – |
| mixed-priority/clustered/100x40 | (d) smart Hungarian | 100.0% | 243 | 66.7% | 187 | 0.0% | – |
| mixed-priority/clustered/300x120 | (a) nearest-first | 33.8% | 186 | 45.7% | 258 | 40.4% | 219 |
| mixed-priority/clustered/300x120 | (b) greedy new-cost | 91.9% | 130 | 45.7% | 127 | 12.8% | 100 |
| mixed-priority/clustered/300x120 | (c) existing min-cost flow | 100.0% | 119 | 65.7% | 188 | 0.0% | – |
| mixed-priority/clustered/300x120 | (d) smart Hungarian | 100.0% | 144 | 65.7% | 135 | 0.0% | – |

## Runtime per batch (balanced, uniform; 30 timed runs after 2 warm-ups)

| R = P | eligible pairs | (a) nearest-first median / p95 (ms) | (b) greedy new-cost median / p95 (ms) | (c) existing min-cost flow median / p95 (ms) | (d) smart Hungarian median / p95 (ms) |
|---|---|---|---|---|---|
| 10 | 35 | 0.01 / 0.01 | 0.02 / 0.03 | 0.03 / 0.06 | 0.04 / 0.06 |
| 50 | 864 | 0.13 / 0.14 | 0.53 / 1.09 | 1.11 / 1.53 | 1.02 / 2.75 |
| 100 | 3589 | 0.51 / 0.53 | 2.37 / 3.05 | 8.22 / 9.29 | 5.57 / 7.88 |
| 200 | 13950 | 2.17 / 3.27 | 14.20 / 18.98 | 78.48 / 92.74 | 27.14 / 28.71 |
| 300 | 30865 | 5.92 / 6.75 | 37.73 / 47.53 | 368.39 / 474.27 | 66.81 / 73.45 |

## Multi-round simulation (10 s batches)

| scenario | approach | arrivals | served | lost (timeout) | urgent served | mean wait (s) | mean ETA (s) | utilization | jobs/provider Gini | std-dev | idle providers | declines / expiries | solve median / p95 (ms) | re-opt after decline median / p95 (ms) | mean batch (req × free prov) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sim/uniform/normal-load | (a) nearest-first | 118 | 115 (97.5%) | 3 | 6/7 | 18 | 435 | 60.2% | 0.160 | 0.61 | 0 | 16 / 15 | 0.003 / 0.009 | 0.004 / 0.009 | 1.4 × 20.5 |
| sim/uniform/normal-load | (b) greedy new-cost | 118 | 116 (98.3%) | 2 | 7/7 | 15 | 444 | 60.4% | 0.164 | 0.63 | 0 | 24 / 14 | 0.009 / 0.042 | 0.008 / 0.042 | 1.2 × 21.1 |
| sim/uniform/normal-load | (c) existing min-cost flow | 118 | 115 (97.5%) | 3 | 6/7 | 18 | 435 | 60.2% | 0.160 | 0.61 | 0 | 16 / 15 | 0.011 / 0.035 | 0.014 / 0.033 | 1.4 × 20.5 |
| sim/uniform/normal-load | (d) smart Hungarian | 118 | 116 (98.3%) | 2 | 7/7 | 15 | 444 | 60.4% | 0.164 | 0.63 | 0 | 24 / 14 | 0.015 / 0.048 | 0.015 / 0.056 | 1.2 × 21.1 |
| sim/uniform/peak-load | (a) nearest-first | 235 | 150 (63.8%) | 83 | 11/17 | 66 | 599 | 83.9% | 0.106 | 0.53 | 0 | 33 / 14 | 0.003 / 0.010 | 0.004 / 0.021 | 6.0 × 10.4 |
| sim/uniform/peak-load | (b) greedy new-cost | 235 | 151 (64.3%) | 81 | 11/17 | 52 | 501 | 83.8% | 0.099 | 0.50 | 0 | 33 / 18 | 0.003 / 0.023 | 0.004 / 0.029 | 6.4 × 8.8 |
| sim/uniform/peak-load | (c) existing min-cost flow | 235 | 154 (65.5%) | 80 | 13/17 | 55 | 548 | 84.0% | 0.103 | 0.53 | 0 | 28 / 18 | 0.018 / 0.049 | 0.022 / 0.056 | 5.8 × 10.5 |
| sim/uniform/peak-load | (d) smart Hungarian | 235 | 152 (64.7%) | 80 | 13/17 | 46 | 541 | 84.0% | 0.105 | 0.53 | 0 | 33 / 19 | 0.030 / 0.100 | 0.039 / 0.104 | 6.4 × 9.4 |
| sim/clustered/normal-load | (a) nearest-first | 119 | 119 (100.0%) | 0 | 4/4 | 15 | 283 | 55.7% | 0.159 | 0.65 | 1 | 24 / 15 | 0.002 / 0.006 | 0.002 / 0.006 | 1.2 × 26.9 |
| sim/clustered/normal-load | (b) greedy new-cost | 119 | 119 (100.0%) | 0 | 4/4 | 15 | 314 | 56.7% | 0.166 | 0.65 | 0 | 32 / 13 | 0.012 / 0.043 | 0.011 / 0.033 | 1.2 × 26.3 |
| sim/clustered/normal-load | (c) existing min-cost flow | 119 | 119 (100.0%) | 0 | 4/4 | 15 | 283 | 55.7% | 0.159 | 0.65 | 1 | 24 / 15 | 0.010 / 0.030 | 0.011 / 0.030 | 1.2 × 26.9 |
| sim/clustered/normal-load | (d) smart Hungarian | 119 | 119 (100.0%) | 0 | 4/4 | 15 | 314 | 56.7% | 0.166 | 0.65 | 0 | 34 / 14 | 0.021 / 0.063 | 0.019 / 0.047 | 1.2 × 26.1 |
| sim/clustered/peak-load | (a) nearest-first | 245 | 168 (68.6%) | 67 | 8/14 | 78 | 473 | 87.5% | 0.084 | 0.51 | 0 | 35 / 19 | 0.002 / 0.006 | 0.002 / 0.009 | 6.4 × 8.5 |
| sim/clustered/peak-load | (b) greedy new-cost | 245 | 167 (68.2%) | 69 | 10/14 | 52 | 387 | 86.9% | 0.103 | 0.58 | 0 | 40 / 33 | 0.004 / 0.034 | 0.006 / 0.039 | 5.1 × 8.4 |
| sim/clustered/peak-load | (c) existing min-cost flow | 245 | 169 (69.0%) | 70 | 11/14 | 45 | 405 | 87.1% | 0.111 | 0.62 | 0 | 38 / 23 | 0.008 / 0.035 | 0.014 / 0.044 | 5.3 × 7.7 |
| sim/clustered/peak-load | (d) smart Hungarian | 245 | 162 (66.1%) | 74 | 12/14 | 46 | 431 | 87.0% | 0.102 | 0.56 | 0 | 30 / 34 | 0.012 / 0.048 | 0.014 / 0.061 | 4.9 × 8.5 |
| sim/uniform/large-overload | (a) nearest-first | 1504 | 819 (54.5%) | 608 | 49/84 | 111 | 525 | 89.0% | 0.086 | 0.50 | 0 | 169 / 112 | 0.011 / 0.151 | 0.012 / 0.181 | 56.5 × 35.9 |
| sim/uniform/large-overload | (b) greedy new-cost | 1504 | 913 (60.7%) | 528 | 72/84 | 60 | 257 | 89.0% | 0.082 | 0.54 | 0 | 178 / 116 | 0.035 / 0.320 | 0.044 / 0.420 | 42.3 × 35.0 |
| sim/uniform/large-overload | (c) existing min-cost flow | 1504 | 880 (58.5%) | 557 | 83/84 | 51 | 370 | 89.0% | 0.083 | 0.53 | 0 | 182 / 112 | 0.171 / 0.356 | 0.178 / 0.351 | 40.9 × 35.6 |
| sim/uniform/large-overload | (d) smart Hungarian | 1504 | 872 (58.0%) | 575 | 82/84 | 48 | 361 | 89.0% | 0.088 | 0.55 | 0 | 173 / 106 | 0.407 / 0.858 | 0.424 / 0.892 | 41.2 × 34.8 |

