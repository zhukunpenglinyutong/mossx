# Triage exhaustive deps warnings into executable batches

## Goal
在不改变主链副作用时机和 callback contract 的前提下，把当前 `109` 条 `react-hooks/exhaustive-deps` warning 分成 `值得马上处理` 与 `可以先不动` 两张表，并把第一批 `11` 条低风险 warning 排成可直接执行的 `P0` 批次。

## Requirements
- OpenSpec change `triage-exhaustive-deps-warning-batches` 必须完整包含 proposal / design / specs / tasks。
- proposal 必须覆盖全部 `109` 条 warning，并能明确回算为 `11 + 98`。
- `P0` 批次只能包含叶子或中等复杂度模块中的低风险 warning，不允许混入 `git-history`、`threads`、`app-shell` 热点，也不允许混入依赖 `timer/localStorage` 哨兵的 warning。
- `P0` 批次拆成 `P0-A` 与 `P0-B` 两个单会话子批次，每个子批次都定义验证方式。

## Acceptance Criteria
- [ ] `openspec status --change triage-exhaustive-deps-warning-batches` 显示 apply-required artifacts ready/done。
- [ ] proposal 中存在两张 warning 分类表，并列出每个文件的 warning 数与处理建议。
- [ ] design 中包含至少两个方案对比以及 deferred hotspot gate。
- [ ] tasks 中明确 `P0-A` / `P0-B` 的实施范围和验证命令。
- [ ] `P0` 计划总 warning 数为 `11`，剩余 `98` 条被明确延期且给出进入下一批的条件。

## Technical Notes
- 当前 warning snapshot 以 `npx eslint src --ext .ts,.tsx -f json` 为准。
- `P0-A` 聚焦纯 derive / helper stabilization warning。
- `P0-B` 聚焦局部 callback/effect 稳定化，不触碰主链 orchestration hook。
- `useSessionRadarFeed` 与 `ButtonArea` 的 warning 归类为 sentinel-pattern deferred batch，不在本轮实现范围内。
- 后续若进入实现，应优先使用 direct `npx vitest run ...` 做局部验收，避免 batched wrapper 干扰局部反馈。
