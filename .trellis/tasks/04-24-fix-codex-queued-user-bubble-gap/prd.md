# Fix Codex Queued User Bubble Gap

## Goal
修复 `Codex` 实时对话在 `live -> queued follow-up` 自动切换时最新 user bubble 短暂消失的问题，保证连续会话期间幕布可见性稳定。

## Requirements
- 仅针对 `Codex` 实时会话结束后自动进入 queued follow-up 的 handoff 窗口生效。
- queue item 被 auto-drain 摘出后，幕布必须立即有对应的 latest user bubble 可见表示。
- 旧 turn 的 history reconcile 不得在 handoff 未决期间把这条最新用户消息吃掉。
- optimistic 或 authoritative history user item 到达后，必须与本地 handoff bubble 正常去重。
- 不新增 Tauri command，不修改现有 runtime contract，不影响 `show-codex-history-loading-state`。

## Acceptance Criteria
- [ ] 多轮连续追问时，当前 turn 结束并自动进入 queued follow-up 后，最新用户消息在消息区持续可见。
- [ ] 旧 turn reconcile 与下一轮 queued handoff 并发时，不再出现最新用户消息短暂消失。
- [ ] history refresh 返回真实 user item 后，不会渲染双份 latest user bubble。
- [ ] 非 `Codex` provider 与现有 history loading 行为不回归。

## Technical Notes
- 关联 OpenSpec change：`fix-codex-queued-user-bubble-gap`
- 新 capability：`codex-queued-user-bubble-continuity`
- 预计改动触点：
  - `src/features/threads/hooks/useQueuedSend.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
- 建议测试重点：`queue auto-drain + old-turn reconcile + optimistic/history dedupe`
