## Why

`src/features/threads/hooks/useThreadActions.ts` 当前约 `2926` 行，已经进入 `feature-hotpath` policy 的 retained hard-debt 区间。  
真正的问题不是单纯“大”，而是 session 启动、fork/rewind、sidebar listing/recovery、archive/delete 被长期堆在同一个 hook 里，导致：

- session runtime 生命周期改动会和 sidebar 恢复链混在一起
- `useThreadActions` 成为 threads 域的高频 merge hotspot
- 想继续治理 listing/recovery 主链时，前置噪音过大

因此需要先把边界更清晰、风险更低的 session runtime 子域从主 hook 中独立出来。

## 目标与边界

- 目标：
  - 将 `start/fork/rewind` 这组 session runtime 动作提取到 feature-local hook。
  - 保持 `useThreadActions` 对外返回字段名和调用方式稳定。
  - 让 `src/features/threads/hooks/useThreadActions.ts` 回到当前 large-file hard gate 以下。
- 边界：
  - 不修改 `resumeThreadForWorkspace`、`listThreadsForWorkspace`、`loadOlderThreadsForWorkspace` 主链。
  - 不修改 archive/delete 行为语义。
  - 不修改 `services/tauri.ts` command contract。

## Non-Goals

- 不做 `useThreadActions` 全量重写。
- 不顺手重构 sidebar recovery、thread summary merge 或 session catalog 拉取策略。
- 不改变 `useThreads`、thread tests 或 runtime payload 结构。

## What Changes

- 新增 feature-local hook 承载 `startThreadForWorkspace`、`startSharedSessionForWorkspace`、`forkThreadForWorkspace`、`forkClaudeSessionFromMessageForWorkspace`、`forkSessionFromMessageForWorkspace`。
- 将 `useThreadActions.ts` 中对应的 session runtime 动作迁移到新 hook，并保持原返回字段名不变。
- 复用现有 `renameThreadTitleMapping` 与 `createStartSharedSessionForWorkspace`，避免继续复制 thread title migration / shared session start 逻辑。
- 通过 typecheck、large-file gate 与 targeted thread action tests 验证拆分没有破坏 contract。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `thread-actions-session-runtime-compatibility`: 增补线程动作 hook 的 session runtime modularization 兼容性要求，确保 start/fork/rewind 动作抽离后外部调用面与行为结果保持稳定。

## Acceptance Criteria

- `useThreadActions` 对外返回的 `start*` / `fork*` 字段名保持不变。
- `src/features/threads/hooks/useThreadActions.ts` 低于当前 P1 hard gate。
- `npm run typecheck`、`npm run check:large-files:gate` 和相关 targeted tests 通过。

## Impact

- Affected code:
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadActionsSessionRuntime.ts`
  - `src/features/threads/hooks/useThreadActions.rewind.test.tsx`
  - `src/features/threads/hooks/useThreadActions.codex-rewind.test.tsx`
  - `src/features/threads/hooks/useThreadActions.shared-native-compat.test.tsx`
  - `src/features/threads/hooks/useThreadActions.test.tsx`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
  - `npx vitest run src/features/threads/hooks/useThreadActions.test.tsx src/features/threads/hooks/useThreadActions.rewind.test.tsx src/features/threads/hooks/useThreadActions.codex-rewind.test.tsx src/features/threads/hooks/useThreadActions.shared-native-compat.test.tsx`
