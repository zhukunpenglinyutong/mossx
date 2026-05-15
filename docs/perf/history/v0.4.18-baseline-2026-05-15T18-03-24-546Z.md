# v0.4.18 Performance Baseline

Generated at: 2026-05-15T18:03:24.489Z
Schema version: 1.0
Branch: feature/v0.5
Commit: 8a4b83fab357d3afefaaadcb4198b2094c7166f2

## Section A — Fixture-Replay Baseline

| Scenario | Metric | Value | Unit | Notes |
|---|---:|---:|---|---|
| S-LL-200 | commitDurationP50 | 10.15 | ms |  |
| S-LL-200 | commitDurationP95 | 10.15 | ms |  |
| S-LL-200 | firstPaintAfterMount | 37.22 | ms |  |
| S-LL-500 | commitDurationP50 | 14.27 | ms |  |
| S-LL-500 | commitDurationP95 | 14.27 | ms |  |
| S-LL-500 | firstPaintAfterMount | 33.73 | ms |  |
| S-LL-1000 | commitDurationP50 | 17.94 | ms |  |
| S-LL-1000 | commitDurationP95 | 17.94 | ms |  |
| S-LL-1000 | firstPaintAfterMount | 37.45 | ms |  |
| S-LL-1000 | scrollFrameDropPct | 0 | % | jsdom proxy; browser scroll gate is follow-up |
| S-CI-50 | keystrokeToCommitP95 | 0.09 | ms |  |
| S-CI-50 | inputEventLossCount | 0 | count |  |
| S-CI-50 | compositionToCommit | 0 | ms |  |
| S-CI-100-IME | keystrokeToCommitP95 | 0.03 | ms |  |
| S-CI-100-IME | inputEventLossCount | 0 | count |  |
| S-CI-100-IME | compositionToCommit | 0.11 | ms |  |
| S-RS-FT | firstTokenLatency | 5000 | ms | turn start to first assistant delta |
| S-RS-FT | interTokenJitterP95 | 920 | ms |  |
| S-RS-PE | dedupHitRatio | 0.25 | ratio |  |
| S-RS-PE | assemblerLatency | 5.15 | ms | replay reducer-path proxy latency |
| S-CS-COLD | bundleSizeMain | 1858804 | bytes | App-Bs9HXFN_.js |
| S-CS-COLD | bundleSizeVendor | 163596 | bytes | index-B1frhHww.js |
| S-CS-COLD | firstPaintMs | unsupported | ms | Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded. |
| S-CS-COLD | firstInteractiveMs | unsupported | ms | Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded. |

## Section B — Cross-Platform Notes

- darwin: S-CS-COLD/firstPaintMs unsupported - Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded.
- darwin: S-CS-COLD/firstInteractiveMs unsupported - Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded.

## Section C — Residual Risks

- Baseline values are fixture-based and should be used for relative comparison, not absolute UX claims.
