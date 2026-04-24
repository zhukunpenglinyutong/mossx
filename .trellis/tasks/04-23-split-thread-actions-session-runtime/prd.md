# Split thread actions session runtime into feature-local hook

## Goal
在不改变 `useThreadActions` 对外返回面、线程列表语义和 runtime contract 的前提下，将 session runtime 子域从主 hook 中抽离，优先把 `start/fork/rewind` 这组生命周期动作迁移到独立 feature-local hook，先把 `src/features/threads/hooks/useThreadActions.ts` 压回当前 large-file hard gate 以下。

## Requirements
- 抽离 `startThreadForWorkspace`、`startSharedSessionForWorkspace`、`forkThreadForWorkspace`、`forkClaudeSessionFromMessageForWorkspace`、`forkSessionFromMessageForWorkspace`。
- 保持 `useThreadActions` 对外返回字段名不变，`useThreads` 和现有 tests 不需要迁移消费方式。
- `resumeThreadForWorkspace`、`listThreadsForWorkspace`、`loadOlderThreadsForWorkspace`、archive/delete 主链保持在 `useThreadActions.ts`。
- 不修改 `src/services/tauri.ts` command 名、payload 含义或跨层 contract。

## Acceptance Criteria
- [ ] 新增 feature-local hook 承载 session runtime actions。
- [ ] `src/features/threads/hooks/useThreadActions.ts` 行数降到 `2800` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `useThreadActions.ts` 不再属于 retained hard debt。
- [ ] 相关 targeted tests 通过。

## Technical Notes
- OpenSpec change: `split-thread-actions-session-runtime`
- 本轮不拆 `listThreadsForWorkspace` / `loadOlderThreadsForWorkspace` / sidebar recovery 主链。
