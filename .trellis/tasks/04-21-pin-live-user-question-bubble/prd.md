# Pin Live User Question Bubble

## Goal

优化实时对话幕布中的用户提问气泡滚动行为：当前 turn 的最后一条普通用户提问在处理期间滚到顶部后固定常驻，帮助用户持续识别当前回答对应的问题。

## Linked OpenSpec Change

- `pin-live-user-question-bubble`

## Requirements

- 实时 processing 期间，仅最后一条普通用户提问气泡进入 sticky 顶部行为。
- 较早用户提问、agent task notification 等非普通提问不进入 sticky 行为。
- 对话结束后，最后用户提问恢复正常滚动。
- 查询或恢复历史会话时，用户提问保持正常滚动。
- 该能力只作用于展示层，不修改 message payload、copy 内容、runtime event、history loader 或 storage schema。

## Acceptance Criteria

- [x] 实时中最后用户提问 wrapper 拥有 sticky class。
- [x] 实时中较早用户提问没有 sticky class。
- [x] `isThinking=false` 后 sticky class 消失。
- [x] `conversationState.meta.historyRestoredAtMs` 存在时不应用 sticky class。
- [x] 目标组件测试通过。

## Technical Notes

- Primary files:
  - `src/features/messages/components/Messages.tsx`
  - `src/styles/messages.css`
  - `src/features/messages/components/Messages.live-behavior.test.tsx`
- Preferred implementation: conditional class + CSS `position: sticky`.
- No backend or Tauri bridge changes.
