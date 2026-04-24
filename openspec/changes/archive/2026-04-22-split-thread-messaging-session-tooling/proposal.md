## Why

`src/features/threads/hooks/useThreadMessaging.ts` 当前约 `2996` 行，已经进入 `feature-hotpath` policy 的 hard-debt 区间。  
真正的问题不只是文件大，而是主发送链、review 流程、slash command session tooling 被长期堆在同一个 hook 里，导致：

- 发送主链改动总会和低风险 tooling 逻辑混在一起
- 线程消息 hook 成为高频 merge hotspot
- session tooling 的小改动也会放大 review 面积

因此需要先把低风险、低耦合的 session tooling commands 从主发送链分离出来。

## 目标与边界

- 目标：
  - 将 slash/session/tooling commands 提取到 feature-local hook。
  - 保持 `useThreadMessaging` 对外返回字段名和调用方式稳定。
  - 让 `src/features/threads/hooks/useThreadMessaging.ts` 回到当前 large-file hard gate 以下。
- 边界：
  - 不改 `sendMessageToThread` 主发送链。
  - 不改 `interruptTurn`、`startReviewTarget`、`startReview` 等高风险链路。
  - 不修改 `services/tauri.ts` command contract。

## Non-Goals

- 不做 `useThreadMessaging` 全量重写。
- 不顺手重构 review prompt、memory injection 或 engine send recovery。
- 不改变 `useQueuedSend` / `useThreads` 的消费模式。

## What Changes

- 新增 feature-local hook 承载 session tooling commands。
- 将 `useThreadMessaging.ts` 中 `startContext` 到 `startResume` 这组低风险 commands 移入新 hook。
- 保留 `useThreadMessaging` 顶层返回字段不变，只替换实现来源。
- 通过 typecheck、large-file gate 与 targeted tests 验证拆分没有破坏 contract。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `thread-messaging-session-tooling-compatibility`: 增补线程消息 hook 的 session-tooling modularization 兼容性要求，确保 commands 抽离后外部调用面与行为结果保持稳定。

## Acceptance Criteria

- `useThreads` 与 `useQueuedSend` 不需要修改返回字段名。
- `src/features/threads/hooks/useThreadMessaging.ts` 低于当前 P1 hard gate。
- `npm run typecheck`、`npm run check:large-files:gate` 和相关 targeted tests 通过。

## Impact

- Affected code:
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadMessagingSessionTooling.ts`
  - `src/features/threads/hooks/useThreadMessaging.test.tsx`
  - `src/features/threads/hooks/useQueuedSend.test.tsx`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
  - `npm run test -- useThreadMessaging.test.tsx useQueuedSend.test.tsx`
