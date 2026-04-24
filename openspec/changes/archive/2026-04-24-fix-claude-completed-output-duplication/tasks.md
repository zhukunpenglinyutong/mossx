## 1. Completed Replay Collapse

- [x] 1.1 在 `threadReducerTextMerge.ts` 为 completed assistant text 增加 leading replay collapse，覆盖 `prefix + full snapshot` 形态
- [x] 1.2 保持该修复只发生在 terminal completed merge 边界，不修改 `Claude` history reconcile 调度与 session identity

## 2. Regression Coverage

- [x] 2.1 在 `threadReducerTextMerge.test.ts` 增加 Markdown report prefix replay 单测
- [x] 2.2 在 `useThreadsReducer.completed-duplicate.test.ts` 增加 reducer 级 completed settlement 回归，验证最终只保留一个 assistant bubble
- [x] 2.3 复跑既有 completed duplicate / reducer / Claude memory-race 相关 targeted tests，确认不回退

## 3. Validation

- [x] 3.1 运行 targeted Vitest：`threadReducerTextMerge.test.ts`、`useThreadsReducer.completed-duplicate.test.ts`、`useThreadsReducer.test.ts`、`useThreads.memory-race.integration.test.tsx`
- [x] 3.2 运行 `npm run typecheck`
- [x] 3.3 结合用户在 macOS 上的实际复现场景，确认 completed 最后一跳的大段重复明显改善
