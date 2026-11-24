# Weight sensitivity of (d): 10 seeds per scenario (generated)

Each cell: mean ± sample std-dev over seeds. † = the mean paired difference to the default (same seed) is larger than its std-dev; Δ shows that difference.

| variant | mean ETA (s) | urgent ETA (s) | abundant-supply ETA (s) | Gini, uniform normal load | Gini, clustered normal load | overloaded: served |
|---|---|---|---|---|---|---|
| (d) default | 209 ± 9 | 216 ± 14 | 157 ± 11 | 0.137 ± 0.025 | 0.153 ± 0.020 | 869.7 ± 9.5 |
| (d) eta-heavy (E 0.50) | 205 ± 9 (Δ -3 †) | 214 ± 14 (Δ -2 †) | 126 ± 7 (Δ -31 †) | 0.150 ± 0.029 (Δ +0.013) | 0.150 ± 0.030 (Δ -0.002) | 872.2 ± 13.1 (Δ +2.5) |
| (d) eta-dominant (E 0.70) | 204 ± 9 (Δ -5 †) | 213 ± 14 (Δ -3 †) | 108 ± 5 (Δ -49 †) | 0.153 ± 0.030 (Δ +0.016) | 0.155 ± 0.021 (Δ +0.002) | 871.2 ± 9.4 (Δ +1.5) |
| (d) fairness-heavy (F 0.30) | 213 ± 9 (Δ +4 †) | 217 ± 15 (Δ +1 †) | 202 ± 10 (Δ +44 †) | 0.113 ± 0.018 (Δ -0.024 †) | 0.112 ± 0.016 (Δ -0.041 †) | 869.8 ± 10.6 (Δ +0.1) |
| (d) quality-heavy (Q 0.35) | 209 ± 9 (Δ +1 †) | 215 ± 15 (Δ -0) | 163 ± 11 (Δ +6 †) | 0.146 ± 0.028 (Δ +0.009) | 0.149 ± 0.026 (Δ -0.004) | 868.6 ± 13.0 (Δ -1.1) |
| (d) eta+fairness (E 0.45, F 0.25) | 209 ± 9 (Δ +0) | 215 ± 14 (Δ -1) | 161 ± 10 (Δ +3) | 0.121 ± 0.020 (Δ -0.016 †) | 0.121 ± 0.023 (Δ -0.032 †) | 871.1 ± 11.2 (Δ +1.4) |
| (c) existing min-cost flow (reference) | 204 ± 9 (Δ -4 †) | 168 ± 8 (Δ -48 †) | 101 ± 5 (Δ -56 †) | 0.152 ± 0.032 (Δ +0.015) | 0.160 ± 0.026 (Δ +0.007) | 873.4 ± 9.3 (Δ +3.7) |
| (b) greedy new-cost (reference) | 188 ± 4 (Δ -21 †) | 180 ± 3 (Δ -36 †) | 161 ± 11 (Δ +3 †) | 0.138 ± 0.024 (Δ +0.001) | 0.152 ± 0.021 (Δ -0.000) | 915.2 ± 9.7 (Δ +45.5 †) |

