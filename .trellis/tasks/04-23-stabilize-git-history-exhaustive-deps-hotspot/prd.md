# Stabilize git-history exhaustive deps hotspot

## Goal
把 `useGitHistoryPanelInteractions.tsx` 里集中爆发的 `react-hooks/exhaustive-deps` warning 拆成明确批次，先安全落掉低风险的 branch/create-pr bootstrap 告警，再继续落 `P1` 的 create-pr / push-pull-sync preview 链路，最后收掉 `P2` 的 diff/menu/resize/commit action 尾巴。

## Requirements
- OpenSpec change `stabilize-git-history-exhaustive-deps-hotspot` 必须包含完整 proposal / design / specs / tasks。
- 首批 `P0` 只能覆盖低风险 warning：fallback/workspace state、branch CRUD bootstrap、create-pr defaults/head repo parse/简单 copy handlers。
- `P2` 允许处理 `branch diff`、`commit actions`、`context menu`、`resize`，但不得顺手改 user-visible behavior 或 Tauri contract。
- 必须用 lint/typecheck 和定向 `git-history` tests 做验收。

## Acceptance Criteria
- [ ] 当前 `70` 条 `git-history` hotspot warning 已拆出明确的 `P0/P1/P2` 批次边界。
- [ ] `P0` warning 修复后，不引入新的 lint error 或 typecheck error。
- [ ] `P1` preview warning 修复后，create-pr / push / pull / sync 基础交互测试仍通过。
- [ ] `P2` interaction warning 修复后，branch diff / commit context / push preview 相关交互测试仍通过。
- [ ] 定向 `git-history` tests 通过，branch/create-pr 基础交互行为不回退。
- [ ] Deferred 批次仍保留明确进入条件，不会被静默捎带修改。

## Technical Notes
- 优先补稳定 setter/imported helper/service 依赖，不在本轮做 hook 结构重写。
- `P2` 只做依赖数组补全，不做新的 context-menu 结构调整或 splitter 行为重构。
