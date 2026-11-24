# Weight sensitivity of (d) (generated)

Same seeds, cases and simulations as the main benchmark. Rows marked (reference) are the other approaches, unchanged.

## Weights

| variant | E | Q | A | S | F | T |
|---|---|---|---|---|---|---|
| (d) default | 0.300 | 0.200 | 0.150 | 0.100 | 0.100 | 0.150 |
| (d) eta-heavy (E 0.50) | 0.500 | 0.143 | 0.107 | 0.071 | 0.071 | 0.107 |
| (d) eta-dominant (E 0.70) | 0.700 | 0.086 | 0.064 | 0.043 | 0.043 | 0.064 |
| (d) fairness-heavy (F 0.30) | 0.233 | 0.156 | 0.117 | 0.078 | 0.300 | 0.117 |
| (d) quality-heavy (Q 0.35) | 0.244 | 0.350 | 0.122 | 0.081 | 0.081 | 0.122 |
| (d) eta+fairness (E 0.45, F 0.25) | 0.450 | 0.100 | 0.075 | 0.050 | 0.250 | 0.075 |

## Single batch (22 cases)

| variant | cases at max | matched / possible | urgent | high | normal | mean ETA (s) | urgent ETA (s) | high ETA (s) | abundant: mean ETA (s) | mixed-priority: urgent ETA (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| (d) default | 22/22 | 2122/2122 | 100.0% | 85.1% | 55.1% | 211 | 219 | 232 | 159 | 195 |
| (d) eta-heavy (E 0.50) | 22/22 | 2122/2122 | 100.0% | 85.1% | 55.1% | 208 | 215 | 230 | 132 | 194 |
| (d) eta-dominant (E 0.70) | 22/22 | 2122/2122 | 100.0% | 85.1% | 55.1% | 206 | 211 | 230 | 112 | 190 |
| (d) fairness-heavy (F 0.30) | 22/22 | 2122/2122 | 100.0% | 85.1% | 55.1% | 216 | 222 | 232 | 205 | 196 |
| (d) quality-heavy (Q 0.35) | 22/22 | 2122/2122 | 100.0% | 85.1% | 55.1% | 212 | 220 | 232 | 168 | 196 |
| (d) eta+fairness (E 0.45, F 0.25) | 22/22 | 2122/2122 | 100.0% | 85.1% | 55.1% | 212 | 215 | 233 | 165 | 190 |
| (c) existing min-cost flow (reference) | 21/22 | 2121/2122 | 100.0% | 84.5% | 55.2% | 206 | 170 | 209 | 105 | 172 |
| (b) greedy new-cost (reference) | 12/22 | 2066/2122 | 91.2% | 65.5% | 58.5% | 188 | 179 | 162 | 165 | 163 |

## Simulation: workload Gini (jobs per provider; lower = more even)

| variant | sim/uniform/normal-load | sim/uniform/peak-load | sim/clustered/normal-load | sim/clustered/peak-load | sim/uniform/large-overload |
|---|---|---|---|---|---|
| (d) default | 0.164 | 0.105 | 0.166 | 0.102 | 0.088 |
| (d) eta-heavy (E 0.50) | 0.164 | 0.106 | 0.170 | 0.079 | 0.093 |
| (d) eta-dominant (E 0.70) | 0.150 | 0.105 | 0.179 | 0.084 | 0.087 |
| (d) fairness-heavy (F 0.30) | 0.112 | 0.105 | 0.117 | 0.102 | 0.085 |
| (d) quality-heavy (Q 0.35) | 0.137 | 0.105 | 0.148 | 0.077 | 0.088 |
| (d) eta+fairness (E 0.45, F 0.25) | 0.118 | 0.106 | 0.141 | 0.068 | 0.081 |
| (c) existing min-cost flow (reference) | 0.160 | 0.103 | 0.159 | 0.111 | 0.083 |
| (b) greedy new-cost (reference) | 0.164 | 0.099 | 0.166 | 0.103 | 0.082 |

## Simulation: served / mean ETA (s) / urgent served

| variant | sim/uniform/normal-load | sim/uniform/peak-load | sim/clustered/normal-load | sim/clustered/peak-load | sim/uniform/large-overload |
|---|---|---|---|---|---|
| (d) default | 116 / 444 / 7/7 | 152 / 541 / 13/17 | 119 / 314 / 4/4 | 162 / 431 / 12/14 | 872 / 361 / 82/84 |
| (d) eta-heavy (E 0.50) | 116 / 428 / 7/7 | 151 / 555 / 14/17 | 119 / 300 / 4/4 | 167 / 405 / 11/14 | 869 / 369 / 83/84 |
| (d) eta-dominant (E 0.70) | 113 / 415 / 6/7 | 152 / 542 / 14/17 | 119 / 284 / 4/4 | 168 / 409 / 10/14 | 877 / 369 / 82/84 |
| (d) fairness-heavy (F 0.30) | 115 / 489 / 6/7 | 152 / 541 / 13/17 | 118 / 321 / 4/4 | 162 / 431 / 12/14 | 874 / 360 / 82/84 |
| (d) quality-heavy (Q 0.35) | 115 / 450 / 6/7 | 152 / 546 / 14/17 | 119 / 343 / 4/4 | 170 / 413 / 13/14 | 862 / 382 / 84/84 |
| (d) eta+fairness (E 0.45, F 0.25) | 116 / 433 / 7/7 | 151 / 544 / 14/17 | 118 / 296 / 4/4 | 170 / 404 / 10/14 | 872 / 358 / 82/84 |
| (c) existing min-cost flow (reference) | 115 / 435 / 6/7 | 154 / 548 / 13/17 | 119 / 283 / 4/4 | 169 / 405 / 11/14 | 880 / 370 / 83/84 |
| (b) greedy new-cost (reference) | 116 / 444 / 7/7 | 151 / 501 / 11/17 | 119 / 314 / 4/4 | 167 / 387 / 10/14 | 913 / 257 / 72/84 |

