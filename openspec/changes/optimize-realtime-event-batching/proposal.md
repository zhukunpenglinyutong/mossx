## Why

`add-runtime-perf-baseline` 已经把 realtime 扩展场景固化为可对比数据：

- `S-RS-FT`：`firstTokenLatency = 5000ms`
- `S-RS-FT`：`interTokenJitterP95 = 920ms`
- `S-RS-PE`：`dedupHitRatio = 0.25`
- `S-RS-PE`：`assemblerLatency = 3.93ms`

当前瓶颈不是单个 reducer 的绝对耗时，而是 realtime event 到 UI 的传播频率与抖动缺少 batching
边界。下一步应围绕 event batching / coalescing 建立明确 contract，避免修复首包与 dedup 后又被
高频 delta 推送拖回卡顿。

## Scope

### In Scope

- 为 realtime delta / tool output / status update 定义 batching 或 coalescing 策略。
- 保护 first-token 语义：batching 不得延迟首个用户可见 assistant delta。
- 复用 `realtimeReplayHarness` 和 `S-RS-*` extended fixture 作为回归入口。
- 为 dedup path 保持现有 `dedupHitRatio` 语义，避免重复响应重新污染 UI。

### Out of Scope

- 不做长列表 virtualization。
- 不拆分 mega hub。
- 不改冷启动 bundle splitting。

## Acceptance Criteria

- `S-RS-FT` 的 first-token path 不得比 `5000ms` fixture baseline 更差。
- `S-RS-FT` 的 `interTokenJitterP95` 必须有明确改善目标或保持不退化。
- `S-RS-PE` 的 `dedupHitRatio = 0.25` 语义必须保持稳定。
- 必须运行 `npm run perf:realtime:extended-baseline` 与 `npm run perf:realtime:boundary-guard`。
