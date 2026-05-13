# Realtime CPU Optimization Acceptance Report

Generated at: 2026-05-13T15:51:23.671Z

## Acceptance Gates

- 5-minute gate: average CPU drop >= 30%, peak frame load drop >= 25%.
- 60-minute gate: no integrity regression and no stuck processing.

## Baseline vs Optimized

| Duration | Baseline CPU ms | Optimized CPU ms | Avg CPU Drop | Baseline Peak/frame | Optimized Peak/frame | Peak Drop | Semantic Hash Match | Integrity | Gate |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| 5 min | 294.48 | 177.39 | 39.76% | 52 | 36 | 30.77% | PASS | PASS | PASS |
| 60 min | 21565.82 | 21522.54 | 0.20% | 52 | 36 | 30.77% | PASS | PASS | PASS |

## Per-Duration Detail

### 5-minute replay

- Events: 1620
- Baseline actions: 5040
- Optimized actions: 3600
- Action reduction: 28.57%
- Semantic hash: baseline `630ba171365b85a17c045357a7701196f292c03c2679e6d3fcd1571fa843e2cf`
- Semantic hash: optimized `630ba171365b85a17c045357a7701196f292c03c2679e6d3fcd1571fa843e2cf`

### 60-minute replay

- Events: 19440
- Baseline actions: 60480
- Optimized actions: 43200
- Action reduction: 28.57%
- Semantic hash: baseline `50c26c147817e8ad212543f8bce1a9aa69e5fbbd523a90fe519d96c35b29fd51`
- Semantic hash: optimized `50c26c147817e8ad212543f8bce1a9aa69e5fbbd523a90fe519d96c35b29fd51`

## Verdict

- Overall: PASS