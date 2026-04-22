# Stabilize git-history exhaustive deps hotspot

## Goal
把 `useGitHistoryPanelInteractions.tsx` 里集中爆发的 `react-hooks/exhaustive-deps` warning 拆成明确批次，先安全落掉低风险的 branch/create-pr bootstrap 告警，再继续落 `P1` 的 create-pr / push-pull-sync preview 链路，最后把 diff/menu/resize 留给专门的 defer gate。

## Requirements
- OpenSpec change `stabilize-git-history-exhaustive-deps-hotspot` 必须包含完整 proposal / design / specs / tasks。
- 首批 `P0` 只能覆盖低风险 warning：fallback/workspace state、branch CRUD bootstrap、create-pr defaults/head repo parse/简单 copy handlers。
- `P1` 允许处理 `create-pr preview` 与 `push/pull/sync preview`，但仍不得夹带 `branch diff`、`context menu`、`resize`。
- 必须用 lint/typecheck 和定向 `git-history` tests 做验收。

## Acceptance Criteria
- [ ] 当前 `70` 条 `git-history` hotspot warning 已拆出明确的 `P0/P1/P2` 批次边界。
- [ ] `P0` warning 修复后，不引入新的 lint error 或 typecheck error。
- [ ] `P1` preview warning 修复后，create-pr / push / pull / sync 基础交互测试仍通过。
- [ ] 定向 `git-history` tests 通过，branch/create-pr 基础交互行为不回退。
- [ ] Deferred 批次仍保留明确进入条件，不会被静默捎带修改。

## Technical Notes
- 优先补稳定 setter/imported helper/service 依赖，不在本轮做 hook 结构重写。
- `P1` 可以处理 `load token ref` / `preview cache ref`，但必须绑定 preview 相关测试；`context menu focus` 与 `resize` 仍留到后续批次。
