# Split thread messaging session tooling into feature-local hook

## Goal
在不改变 `useThreadMessaging` 对外返回面和 runtime contract 的前提下，将 slash/session/tooling commands 从主发送链中提取到独立 feature-local hook，先把 `src/features/threads/hooks/useThreadMessaging.ts` 压回 large-file hard gate 以下。

## Requirements
- 抽离 `startContext`、`startStatus`、`startMode`、`startFast`、`startCompact`、`startSpecRoot`、`startExport`、`startShare`、`startImport`、`startMcp`、`startLsp`、`startFork`、`startResume`。
- 保持 `useThreadMessaging` 对外返回字段名不变，`useThreads` 与 `useQueuedSend` 不需要迁移。
- 不修改 `sendMessageToThread` 主发送链、review 主链、Tauri command 名或 payload 结构。
- 抽分后 `src/features/threads/hooks/useThreadMessaging.ts` 需要低于当前 `feature-hotpath` policy 的 fail threshold。

## Acceptance Criteria
- [ ] 新增 feature-local hook 承载 session tooling commands。
- [ ] `src/features/threads/hooks/useThreadMessaging.ts` 行数降到 `2800` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `useThreadMessaging.ts` 不再属于 retained hard debt。
- [ ] 相关 targeted tests 通过。

## Technical Notes
- OpenSpec change: `split-thread-messaging-session-tooling`
- 本轮不拆 `sendMessageToThread` / `interruptTurn` / `startReviewTarget` 等高风险主链。
