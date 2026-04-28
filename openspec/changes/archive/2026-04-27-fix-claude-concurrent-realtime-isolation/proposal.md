## Why

用户在同一 workspace 下并行启动两个 `Claude Code` 会话时，realtime 阶段会出现明显串会话：当前 tab 会短暂承接另一个进行中会话的 live 状态或 session rebind，等任务执行完成、再通过历史会话重新打开时，最终结果又会自动修正回各自正确的会话。

这说明问题不在最终持久化 history，而在 `pending thread -> finalized session` 的 realtime 对账链路。当前实现默认同一 workspace、同一 engine 只有一个可用于 session 对账的 pending thread；一旦出现两个并行 `Claude` pending，会话 rebind 就会退化成按 `activeThreadId` 或单一 pending 候选去猜，导致 live surface 临时串线。

## 目标与边界

- 目标：修复同一 workspace 下多个 `Claude` 会话并行时的 realtime session isolation，避免 live surface 串会话。
- 目标：保持最终 history / canonical reconcile 行为不变，只把 realtime 阶段的路由与 rebind 变成可精确配对。
- 目标：优先采用兼容性写法，不改现有持久化 schema，不破坏单会话或非 `Claude` 行为。
- 边界：本 change 只处理 `Claude` 并行 realtime 隔离，不顺手改 generic history loading、approval UI 或 sidebar 样式。
- 边界：本 change 不重做整个 thread store，只增强事件锚点与 pending lane 解析。

## 非目标

- 不通过“隐藏所有 duplicate 线程”掩盖 live rebind 错误。
- 不通过“强行切换到最新 session”做高风险误绑。
- 不修改 `Codex`、`Gemini`、`OpenCode` 的既有 session 语义。
- 不把问题重新定义为 history 数据损坏。

## What Changes

- 新增 `claude-concurrent-realtime-session-isolation` capability，定义并行 `Claude` pending turns 在 realtime 阶段的隔离与 rebind 合同。
- 修改 `conversation-lifecycle-contract`，要求 `Claude` 的 session-id update 在存在 `turnId` 锚时 MUST 先按 turn-bound lineage 配对 pending thread，而不是依赖单一 active pending 猜测。
- 修改 `claude-session-sidebar-state-parity`，要求并行 realtime 场景中的 temporary duplicate / crossed surface 不得污染最终 selected conversation truth。
- 允许 Claude runtime 把 `SessionStarted` 对应的 `turnId` 一并透传到前端，作为并行 pending 的精确配对锚点。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 继续沿用单 pending 解析器，只在前端 UI 层隐藏串出的 live surface | 改动小 | 根因不变，后台 thread rebind 仍会串 | 不采用 |
| B | 完全依赖 `activeThreadId` 作为并行会话归属 | 逻辑简单 | 一旦用户切 tab，background Claude 会话就会被误绑 | 不采用 |
| C | 为 `SessionStarted` 透传 `turnId`，前端按 `turnId -> pending thread` 精确配对，再保留现有 canonical reconcile 作为兜底 | 根因准确、兼容性强、单会话无回退 | 需要轻量跨层改动与测试补充 | 采用 |

## 验收标准

- 当同一 workspace 下存在两个并行 `Claude` pending 会话时，任一会话的 realtime `sessionId update` MUST 优先绑定到拥有相同 `turnId` 的 pending thread。
- 当用户切换到另一条 `Claude` 会话时，background 会话的 live rebind MUST NOT 借由 `activeThreadId` 污染当前会话 surface。
- 当 `turnId` 不存在或无法安全配对时，系统 MAY 保持现有兜底行为，但 MUST NOT 比当前实现更激进地误绑到其他 pending thread。
- 单个 `Claude` 会话、以及 `Codex` / `Gemini` / `OpenCode` 的现有行为 MUST 保持不变。

## Capabilities

### New Capabilities
- `claude-concurrent-realtime-session-isolation`

### Modified Capabilities
- `conversation-lifecycle-contract`
- `claude-session-sidebar-state-parity`

## Impact

- Affected frontend:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - `src/features/threads/hooks/useThreads.ts`
- Affected backend:
  - `src-tauri/src/engine/events.rs`
  - `src-tauri/src/engine/claude.rs`
  - `src-tauri/src/engine/claude/event_conversion.rs`
- Affected tests:
  - `src/features/threads/hooks/useThreadTurnEvents.test.tsx`
  - `src/features/threads/hooks/useThreads.pendingResolution.test.ts`
  - `src/features/app/hooks/useAppServerEvents.test.tsx`
  - Rust engine event serialization / Claude stream tests
