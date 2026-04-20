# Fix Realtime Completion Notification Sound Once

## Goal

修复实时对话声音提示触发逻辑，使提示音只在本轮对话或任务最终结束时播放一次，而不是在流式输出过程中反复播放。

OpenSpec change: `fix-realtime-completion-sound-once`

## Requirements

- 流式输出期间的 agent message delta / snapshot / completion 事件不得触发 notification sound。
- 每个 `turn/completed` 事件对应的完成轮次最多触发一次 notification sound。
- 同一 thread 的不同 `turnId` 连续完成时，每轮仍可各触发一次提示音。
- 关闭 notification sounds 时，任何实时对话事件都不得播放提示音。
- 不影响现有实时对话的流式输出体验。

## Acceptance Criteria

- [ ] 流式输出过程中不要反复触发声音提示。
- [ ] 每轮对话结束后只触发一次声音提示。
- [ ] 不影响现有实时对话的流式输出体验。
- [ ] Hook-level regression tests 覆盖 streaming silence、duplicate completion dedupe、consecutive turns、disabled sounds。

## Technical Notes

- Primary file: `src/features/notifications/hooks/useAgentSoundNotifications.ts`
- Test file: `src/features/notifications/hooks/useAgentSoundNotifications.test.tsx`
- 不修改 `useAppServerEvents` 的 event routing，不修改 backend runtime payload。
- 验证命令：
  - `npm exec vitest run src/features/notifications/hooks/useAgentSoundNotifications.test.tsx`
  - `npm run typecheck`
