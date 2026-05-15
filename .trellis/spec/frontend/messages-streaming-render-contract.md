# Messages Streaming Render Contract

本文件适用于 `src/features/messages/components/Messages.tsx`、`MessagesTimeline.tsx`、`MessagesRows.tsx`、`Markdown.tsx`、`LiveMarkdown.tsx` 这一条 live conversation render pipeline。

## Scope / Trigger

- Trigger：修改 live assistant streaming、timeline grouping、anchor rail、sticky user bubble、turn boundary、Markdown progressive reveal、visible render diagnostics。
- 目标：保证长文 streaming 时，live row 持续可见增长，同时父层重派生不再被每个 text delta 拖入热路径。

## Why This Exists

- 本 contract 来自一次真实的 `Codex` 长文 streaming P0 卡顿：前段输出丝滑，但中后段开始整客户端按钮失去响应，幕布只能偶尔滚动，最终常常等输出完才一次性刷出。
- 根因不是单个 Markdown parse 慢，而是 parent timeline derivations 与 live text growth 耦合，导致 `grouping / anchors / sticky / final-boundary` 在长文尾段被反复全量驱动。
- 因此这里保护的重点不是某个 throttle 数字，而是数据流分层：`live row` 与 `stable parent snapshot` 必须分轨。
- 2026-05-15 的 Claude Code 流式卡顿修复进一步确认：`Codex` 与 `Claude Code` 的 live streaming 已进入成熟保护期。后续重构应默认保守，优先证明没有把 diagnostics、history reconcile、runtime ledger、process snapshot 或 parent timeline derive 重新塞回 stream hot path。

## Core Invariant

- `liveAssistantItem` / `liveReasoningItem` MAY 直接来自最新 `renderSourceItems`，保持实时可见增长。
- `groupToolItems`、`messageAnchors`、`historyStickyCandidates`、`assistantFinalBoundarySet`、`assistantFinalWithVisibleProcessSet`、`assistantLiveTurnFinalBoundarySuppressedSet` 这类 timeline-heavy derivations MUST 基于稳定的 deferred presentation snapshot。
- parent timeline snapshot 可以附加“新插入的 live item id”，但 MUST NOT 因同一 item 的文本增长或 `isFinal` 翻转而在每个 delta 上全量重算整条时间线。
- streaming 结束后，stable snapshot MUST 自然收敛到 canonical latest presentation items；不得永久停留在旧快照。
- `Claude Code` 与 `Codex` live row 收敛 MUST 先走 realtime path；history replay / reconcile 只能用于校验、补账或最终一致性，不得成为 live assistant text、reasoning、tool output 可见的唯一路径。
- backend diagnostics、runtime ledger persistence、Windows process diagnostics、first-token timing、context ledger 或 runtime pool refresh MAY 提供 observability，但 MUST NOT 成为每个 delta 的前置门槛。

## Required Structure

- `Messages` 负责区分：
  - `renderSourceItems`：latest live source
  - `presentationRenderedItems`：当前真实 presentation surface
  - `timelinePresentationItems`：供 parent-level heavy derivations 消费的 stable snapshot
- `MessagesTimeline` 负责：
  - 吃 `groupedEntries` / anchors / boundary sets 这类稳定派生
  - 用 `liveAssistantItem` / `liveReasoningItem` 对 active tail 做 override
- `messagesLiveWindow` 中的 snapshot helper 必须保持 pure helper 语义，方便单元测试锁定 contract。

## Forbidden Patterns

- 让 `groupToolItems(...)`、anchor/sticky 计算、final boundary 计算直接重新依赖最热的 live text source。
- 为了“看起来实时”，把整条 `presentationRenderedItems` 在每个 delta 上重新驱动到 parent timeline render。
- 依赖 history reconcile 才看到 final Markdown / final boundary 的最终状态。
- 把这条 contract 退化成单纯的 throttle number 调优，而不保护数据流分层。
- 在重构中把 `Codex` / `Claude Code` 的 no-text interval 直接当成 terminal stuck；非文本 runtime activity、heartbeat、tool progress、request-user-input、reasoning delta 都可能是合法 progress evidence。
- 把 first-token diagnostics、process snapshot、runtime ledger write、context ledger persistence、history detail reload 插入 live delta emission 之前。
- 为了统一代码路径，删除 `liveAssistantItem` / `liveReasoningItem` override，或让 final visible state 只能等待 history replay。

## Validation Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| assistant 同 id 文本持续增长 | live assistant row 立即显示最新文本 | parent grouping/anchors/boundaries 每个 delta 全量重算 |
| assistant 同 id 从 non-final -> final | live row 可先拿到最新 final 状态；timeline boundary 允许在 deferred snapshot 上稍后收敛 | final boundary 必须同步卡住整条父层派生 |
| 新增 live tail item | stable snapshot 可立即追加新 id | 因稳定快照导致新 live item 完全不出现 |
| streaming turn 完成 | stable snapshot 收敛到 canonical latest items | 停留在旧 boundary / 旧 grouping |
| Claude Code first token 慢 | diagnostics 标记 startup/first-token 阶段，UI 不伪造文本也不误判 frontend render stall | 把无首 token 归因到 Markdown/render 卡顿或强制 final-only 输出 |
| Claude Code delta 已到 backend forwarder | delta 先发给 frontend，diagnostics/ledger/process snapshot 后台或 checkpoint 执行 | 等 Windows process diagnostics、runtime ledger 或 history reconcile 完成后才发 delta |
| Codex 长时间无 assistant text 但有 runtime/tool 活动 | activity 计入 progress evidence，保持 non-terminal suspicion 或 normal processing | text-delta-only 判断导致误结算、误停止或误恢复 |

## Tests Required

- pure helper：覆盖“同 id 文本增长时复用 deferred snapshot”和“新增 live id 时追加到 stable snapshot”。
- `Messages` integration：覆盖“live assistant row 已拿到最新文本/最新 final 状态时，parent boundary set 仍可停留在稳定快照，然后再收敛”。
- regression：保留 `Codex` large streaming Markdown throttle / live row render path 测试，防止有人把问题误修成 plain-text-only fallback。
- Claude Code regression：覆盖 first-token diagnostics 不阻塞 first visible delta，且 diagnostics/history reconcile 不成为 live delta 前置条件。
- Codex regression：覆盖 no-text 但有 heartbeat/tool/status progress 时不会 terminalize active turn；late stale progress 不能复活已 settled turn。

## Review Checklist

- 是否把新的 timeline-heavy derive 又绑回 `renderSourceItems` / `presentationRenderedItems` 热路径？
- 是否仍然保留了 `liveAssistantItem` / `liveReasoningItem` 的最新 override？
- 是否新增了能证明“即时 live row + 延后父层派生”双轨 contract 的测试？
- 是否把 Claude Code first-token / backend-forwarder / frontend-render 三段 latency 重新混成一个“流式卡顿”判断？
- 是否把 Codex suspected silence 写成 terminal settlement，或把 progress evidence 收窄成只有 assistant text delta？
- 是否引入了任何每 delta 都执行的 process snapshot、runtime ledger write、history detail reload、context ledger persistence？
