## Why

Windows 上的 `Claude Code` 实时对话存在秒级卡顿与“最后一次性整体输出”现象：视频证据显示主内容区可长时间停在 processing / 少量前缀，直到 turn 后段才批量落屏；第二轮对话也会先有少量流式片段，再出现长时间停顿与整体补齐。

这次问题不再只是旧 change `fix-claude-windows-streaming-visibility-stall` 覆盖的 frontend visible render stall。代码热点表明 Claude event forwarder 在 emit app event 前同步执行 runtime lease、Windows process diagnostics 与 ledger persist，Windows 下 `Get-CimInstance Win32_Process` 的同步全量进程快照足以把 `TextDelta / ReasoningDelta / ToolOutputDelta` 堵在 backend hot path 上，形成“stdout 已有增量但 UI 批量收到”的体验。

## 目标与边界

### 目标

- 修复 `Claude Code + Windows` realtime stream 的 backend forwarding latency，确保 assistant delta 不被 runtime diagnostics / process snapshot / ledger persist 阻塞到秒级。
- 将 Claude stream hot path 拆成两类动作：
  - **hot path**：接收 engine event 后尽快 emit 给 app/frontend，维护必要的内存 lease / timestamp。
  - **background path**：runtime diagnostics、process tree snapshot、ledger persist、runtime pool console row 刷新等可观测性更新。
- 保留 runtime active-work protection 语义，不能因为移除 per-delta sync 而让活跃 Claude turn 被误判 idle / evictable。
- Windows process diagnostics 必须有边界：TTL cache、singleflight、timeout 或等价机制，避免重复 PowerShell/CIM 快照拖慢 stream。
- 诊断上必须能区分：
  - upstream first-token delay
  - backend forwarder hot-path stall
  - frontend visible-output stall after first delta
  - final-only / burst flush caused by event backlog

### 边界

- 只聚焦 `Claude Code` engine 的 Windows realtime stream hot path，不改 `Codex / Gemini / OpenCode` stream pipeline。
- 不重写 Claude CLI parser，不关闭 streaming，不把 live output 降级成 final-only。
- 不改变 Tauri command payload contract，不新增用户配置面板，不引入新的持久化 schema。
- 不删除既有 frontend `claude-windows-visible-stream` mitigation；它处理 “event 已到 frontend 后 visible render 停住”，本 change 处理 “event emit 前被 backend 同步工作堵住”。
- 不修复长线程 frontend state/render amplification：`appendAgentDelta -> prepareThreadItems(...)` 的整线程重算、`Messages` 在尾部裁剪前做全量推导、以及 compacting UX 回归测试补强，拆到后续 `fix-claude-long-thread-render-amplification` change 处理。

## 非目标

- 不把问题归因到模型、provider 或 Claude CLI 服务端。
- 不通过全局加大 frontend Markdown throttle 来掩盖 backend stall。
- 不做 runtime manager 全面重构，只调整 Claude stream hot path 与 Windows diagnostics 的阻塞边界。
- 不把 runtime pool diagnostics 的新鲜度要求置于用户可见 streaming latency 之上。
- 不把所有 “Windows Claude 卡顿” 都归并为 backend stall；同一用户体感可能同时包含 frontend reducer/render 放大，需要独立证据和独立修复。

## What Changes

- 新增 `claude-code-stream-forwarding-latency` capability：定义 Claude backend event forwarder 的低延迟契约，要求 realtime delta 在 emit 前不得等待昂贵 runtime diagnostics 或持久化。
- 修改 `conversation-stream-latency-diagnostics`：新增 backend hot-path stall / burst flush 分类，要求诊断能区分 backend forwarding backlog 与 frontend visible render stall。
- 修改 `runtime-pool-console`：明确 runtime/process diagnostics 可以短暂 stale，但必须 bounded、可追踪，且不得在 Claude realtime delta 热路径同步阻塞。
- 实现提案将重点落在：
  - `TurnStarted` 只做必要 lease / row touch，不能等待昂贵 diagnostics 后才继续处理首个 delta。
  - Claude forwarder 先 emit app event，再异步/限频 touch runtime。
  - 新增轻量内存 touch / stream activity 更新，不跑 PowerShell，不每个 delta 落 ledger。
  - `sync_claude_runtime()` 限定在 turn start / terminal / heartbeat 或后台刷新。
  - Windows process diagnostics 做 TTL cache + singleflight + timeout，并从 hot path 移出。
  - runtime row 在已有 launch/runtime metadata 可获得时补齐 `resolved_bin / wrapper_kind`，让 `.cmd` wrapper 风险可诊断但不阻塞 stream，也不新增同步探测。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只继续增强 frontend visible-stream mitigation | 改动较小，延续旧 `claude-windows-visible-stream` | 无法解决 emit 前被 backend 堵住的批量落屏；视频 1 的长时间无主内容进展仍会复现 | 不采用 |
| B | 只调大 Claude text delta coalescing window | 只碰 `claude.rs`，blast radius 小 | 32ms coalescing 解释不了 10s 级停顿，调大还可能恶化首包可见性 | 不采用 |
| C | 移除所有 runtime sync / ledger persist | 最快解除阻塞 | 会破坏 active-work protection、runtime pool console 与恢复诊断 | 不采用 |
| D | hot path 先 emit，runtime diagnostics/persist 异步化、限频化、bounded | 根因边界准确；保留诊断；可回滚；对其他 engine 影响小 | 需要补充 Rust 回归测试与 Windows 手测矩阵 | **采用** |

## Capabilities

### New Capabilities

- `claude-code-stream-forwarding-latency`: 覆盖 Claude Code backend event forwarding hot path 的低延迟契约，确保 `TextDelta / ReasoningDelta / ToolOutputDelta` 不被 Windows process diagnostics 或 per-event ledger persist 阻塞。

### Modified Capabilities

- `conversation-stream-latency-diagnostics`: 增加 backend forwarder stall / burst flush 分类，要求 diagnostics 能把 backend event backlog 与 frontend visible render stall 分开。
- `runtime-pool-console`: 调整 process diagnostics 新鲜度契约，允许 bounded stale / async refresh，但禁止 runtime diagnostics 同步阻塞 Claude realtime stream hot path。

## 验收标准

- `Claude Code + Windows` turn 中，backend 收到 `TextDelta / ReasoningDelta / ToolOutputDelta` 后 MUST 优先 emit app event；runtime diagnostics、process snapshot、ledger persist 不得成为每个 delta 的前置 await。
- `TurnStarted` bookkeeping MUST NOT wait for Windows process diagnostics、full process-tree snapshot 或 durable ledger persist before the first realtime delta can be forwarded.
- 在 Windows 上，单个 Claude turn 的多个 text delta MUST 在完成前以增量方式到达 frontend；不能长期停顿后只在 `TurnCompleted` 附近整体落屏。
- runtime active-work protection MUST 继续覆盖活跃 Claude turn / stream，不能因异步化 runtime sync 导致活跃进程被 warm TTL / eviction 误清理。
- Windows process diagnostics MUST bounded：重复请求同一时间窗内的进程树诊断时 MUST 复用缓存或 join singleflight；超时后 MUST 降级而不是卡住 stream。
- diagnostics MUST 能记录 backend hot-path stall / burst flush evidence，且该分类 MUST 与 `visible-output-stall-after-first-delta` 区分。
- `macOS Claude` 与非 Claude engines MUST 保持既有 stream/render 行为。
- 验证必须包含：
  - Rust fake slow runtime sync / diagnostics 测试，断言 app emit 不等待 slow sync。
  - Windows diagnostics TTL / singleflight / timeout 测试。
  - frontend 回归确认 final completion 不覆盖已显示 delta。
  - Windows native Claude Code 手测：首轮、第二轮、tool-heavy prompt、first visible delta latency、delta cadence、final text parity。

## 当前验证记录（2026-04-27）

- 已结合当前代码核对：Claude forwarder 已落到 “realtime delta 先 emit，再 touch/sync runtime” 的顺序，`TextDelta` / `ReasoningDelta` / `ToolOutputDelta` 均由 Rust 回归测试锁住低延迟路径。
- Windows native Claude Code 最新人工对话测试已通过：普通对话已经正常流式推进，未再复现长时间停在少量前缀后最终一次性整体输出的主症状。
- 该结果将本 change 视为 Windows Claude “卡顿 / final-only burst flush” 的主修复记录；frontend 长线程渲染放大仍由 `fix-claude-long-thread-render-amplification` 独立覆盖。

## Impact

- Affected backend:
  - `src-tauri/src/engine/commands.rs`: Claude turn event forwarder 的 emit 与 runtime sync 顺序。
  - `src-tauri/src/runtime/mod.rs`: Claude runtime touch/sync、stream lease、ledger persist 频率。
  - `src-tauri/src/runtime/process_diagnostics.rs`: Windows process snapshot cache / singleflight / timeout。
  - `src-tauri/src/engine/claude.rs`: 仅在证据证明 parser/coalescing 仍影响 flush 时才小幅调整。
  - `src-tauri/src/backend/app_server_cli.rs` / `src-tauri/src/utils.rs`: `.cmd` wrapper / hidden console 风险仅作为 P1 diagnostics，不作为 P0 修复主因。
- Affected frontend:
  - `src/features/threads/utils/streamLatencyDiagnostics.ts`: 增加 backend stall / burst flush 分类消费与展示。
  - `src/features/threads/hooks/useThreadItemEvents.ts`、`src/features/messages/**`: 仅做 final parity / diagnostics 回归，不把 frontend throttle 当主修复。
- Affected specs:
  - new `claude-code-stream-forwarding-latency`
  - modified `conversation-stream-latency-diagnostics`
  - modified `runtime-pool-console`
