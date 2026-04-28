## Why

Windows native Claude 长线程仍可能在 backend event 已经到达 frontend 后出现输入迟滞、消息区掉帧或“越聊越卡”。现有 `fix-claude-windows-streaming-latency` 只解除 backend forwarder 在 emit 前被 runtime diagnostics 阻塞的问题；它不处理每个 live text delta 在 frontend 触发整线程归一化、消息推导和 Markdown/render 放大的问题。

当前代码仍有三个放大点：

- `appendAgentDelta` 每个文本增量都会复制完整 thread items，并执行 `prepareThreadItems(...)`。
- `Messages` 在 `VISIBLE_MESSAGE_WINDOW = 30` 尾部裁剪前，已经基于完整 `effectiveItems` 做 visible filtering、reasoning dedupe/collapse、timeline 构建和 live middle-step collapse。
- Claude prompt overflow 进入 automatic `/compact` + retry 时，UI 已有事件链路，但缺少足够回归覆盖确保 compacting/compacted/failed 状态不被误看成“卡死”。

2026-04-27 补充定位：当前 Windows native Claude Code 普通对话已由最新代码验证为正常。该实测结果证明 `fix-claude-windows-streaming-latency` 的 backend hot-path 修复命中了主要 final-only / burst-flush 症状；本 change 继续保留为长线程、prompt overflow compaction 与 frontend O(n) 放大的独立硬化项，不能反向归因为本轮主根因。

## 目标与边界

### 目标

- 降低 Claude 长线程 live assistant text delta 的 reducer 成本：纯文本追加不得每个 delta 都触发整线程 `prepareThreadItems(...)`。
- 将 Claude live conversation 的消息窗口裁剪前移到主要 render 推导之前，让默认 live 视图的大部分推导基于 tail working set。
- 保留现有语义：tool 顺序、reasoning 可见性、thread rename、final completion metadata、`Context compacted.` 去重都不能回退。
- 补强 compacting UX 状态链测试，确保 prompt overflow recovery 时用户看到明确 compacting / failed / completed 状态。

### 边界

- 只优化 frontend 长线程 live conversation 的 state/render 放大，不改 backend Claude CLI parser、不改 Tauri command payload、不改 provider 协议。
- 保留现有 provider/render mitigation，不重复实现 `claude-windows-visible-stream` 或 `claude-qwen-windows-render-safe`。
- 不全局降低所有 engine 的 stream 频率，不把正常 macOS/Linux 或非 Claude 路径一起降级。
- 不重写 thread state 架构，不更换 Markdown renderer，不重做消息 UI 设计。

## 非目标

- 不解决 backend emit 前阻塞；该问题由 `fix-claude-windows-streaming-latency` 负责。
- 不改变 completed history 的全量浏览语义。
- 不新增持久化 schema 或用户配置面板。

## What Changes

- 修改 `conversation-realtime-cpu-stability`：新增 Claude live assistant delta reducer fast path，纯文本追加时跳过每-delta canonical derivation，边界事件再回到 `prepareThreadItems(...)`。
- 修改 `conversation-render-surface-stability`：新增 live tail working set contract，默认 live conversation 在尾部窗口上做主要 render 推导，`showAllHistoryItems` 保持全量。
- 修改 `claude-context-compaction-recovery`：补强 prompt overflow auto compact/retry 的 UI 状态稳定性与测试要求。
- 保持 `conversation-provider-stream-mitigation` 不变：通用 Windows Claude evidence-driven mitigation 已存在，当前 change 不重复扩展。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续调大 Markdown / message throttle | 改动小 | 只能掩盖渲染频率，不能消除 reducer 和 render pipeline 的 O(n) 放大，还会拖慢正常路径 | 不采用 |
| B | 在 reducer 添加纯文本 fast path，并在 completion/结构化事件 canonicalize | 直接移除最热 delta 路径的整线程重算，语义边界清晰 | 需要谨慎处理 legacy id、final metadata、thread rename | 采用 |
| C | `Messages` 只保持最终 DOM 裁剪 | 已有行为，风险低 | 上游 filtering/dedupe/collapse 仍全量执行，长线程成本不降 | 不采用 |
| D | 引入 live tail working set，在主要推导前裁剪 | 直接降低 render derivation 输入规模，保留 full history opt-in | sticky user、collapsed count、reasoning/tool collapse 需要测试保护 | 采用 |

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversation-realtime-cpu-stability`: live assistant text delta MUST support a bounded reducer fast path for unchanged thread structure.
- `conversation-render-surface-stability`: live rendering MUST derive from a bounded tail working set before expensive presentation transforms when history is collapsed.
- `claude-context-compaction-recovery`: compacting lifecycle UI state MUST remain explicit and recoverable during prompt-overflow retry.

## 验收标准

- 连续 Claude text delta 追加到同一个 live assistant message 时，不再每个 delta 都执行完整 `prepareThreadItems(...)`。
- `completeAgentMessage`、新结构化 item、legacy/canonical id 迁移、final metadata 合并仍回到 canonical 结果。
- 默认 live conversation 下，`Messages` 的 visible/timeline 主推导基于 bounded tail working set；`showAllHistoryItems` 时保留全量行为。
- sticky user message、collapsed history count、reasoning visibility、tool ordering 不回退。
- prompt overflow compacting/compacted/failed 状态链有明确测试，失败后不留下永久 processing 假状态。

## Impact

- Affected frontend:
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/utils/threadItems.ts`
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/messagesLiveWindow.ts`
  - `src/features/messages/components/messagesRenderUtils.ts`
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - related tests under `src/features/threads/**` and `src/features/messages/**`
- No backend command/payload changes.
- No new dependencies.
