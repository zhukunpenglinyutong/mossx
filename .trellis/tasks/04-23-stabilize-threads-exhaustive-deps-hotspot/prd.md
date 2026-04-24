# Stabilize threads exhaustive deps hotspot

## Goal
把 `threads` 域剩余的 `react-hooks/exhaustive-deps` warning 按批次清掉，先补普通缺失依赖，再把 `useCallback(factory(...))` 这种 lint pattern 统一改成稳定的 memoized callback construction，同时保持发送、resume、事件流和 shared-session 行为不回退。

## Requirements
- OpenSpec change `stabilize-threads-exhaustive-deps-hotspot` 必须包含完整 proposal / design / specs / tasks。
- `P0` 只处理普通缺失依赖：`useQueuedSend.ts`、`useThreadItemEvents.ts`、`useThreadTurnEvents.ts`、`useThreadActions.ts` 中直接引用但未列入数组的依赖。
- `P1` 只处理 factory callback warnings：`useThreadActions.ts` 和 `useThreadActionsSessionRuntime.ts` 中的 `useCallback(factory(...))`。
- 必须用 `lint`、`typecheck` 和定向 `threads` tests 做验收。

## Acceptance Criteria
- [ ] 目标 5 个 `threads` hook 的 warning 清零。
- [ ] `useMemo(() => factory(...), deps)` 替换后不引入 archive/delete/rename/shared-session 行为回退。
- [ ] 发送、resume、item event、turn event 主链保持兼容。
- [ ] `npm run lint`、`npm run typecheck` 和定向 `threads` tests 通过。

## Technical Notes
- 普通缺依赖优先按最小集合补齐，不顺手做结构重构。
- factory callback remediation 只改 memoization 形式，不改 `sessionActions` helper 实现。
- 如果 `P1` 测试暴露回退，立即停在 `P0` 结果，不把 factory 替换强行混入同一个提交。
