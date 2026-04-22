# Stabilize exhaustive deps tail warnings

## Goal
把仓库最后剩下的 6 条 `react-hooks/exhaustive-deps` warning 收尾清零，采用低风险补依赖 + cleanup ref 修正的方式，保持相关叶子 feature 行为不回退。

## Requirements
- OpenSpec change `stabilize-exhaustive-deps-tail-warnings` 必须包含完整 proposal / design / specs / tasks。
- 只允许修改当前 6 条 warning 对应文件，不得夹带无关 feature 变更。
- `GitHistoryPanelImpl.tsx` 必须使用 cleanup-safe timer clearing pattern。
- 必须用 `lint`、`typecheck` 和相关 feature tests 做验收。

## Acceptance Criteria
- [ ] 仓库 `react-hooks/exhaustive-deps` warning：`6 -> 0`
- [ ] `npm run lint` 与 `npm run typecheck` 通过
- [ ] 相关 feature 定向测试通过
- [ ] 不引入新的 lint error 或 typecheck error

## Technical Notes
- 缺依赖修复只按最小集合补齐，不做结构重构。
- `useDetachedFileExplorerState.ts` 先稳定化 helper，再把它纳入 effect 依赖。
- `TaskCreateModal.tsx` 保留现有 `isOpen` guard 与初始化流程。
