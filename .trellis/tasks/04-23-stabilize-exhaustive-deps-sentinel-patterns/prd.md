# Stabilize exhaustive deps sentinel patterns

## Goal
把 `ButtonArea` 和 `useSessionRadarFeed` 中依赖数组哨兵式的重算触发器改成显式 snapshot/clock 驱动，在保持原有刷新语义不变的前提下，去掉这 3 条特殊的 `exhaustive-deps` warning。

## Requirements
- OpenSpec change `stabilize-exhaustive-deps-sentinel-patterns` 必须包含完整 proposal / design / specs / tasks。
- `ButtonArea` 需要从 `localStorage` 相关配置构建显式 storage snapshot，并用事件刷新 snapshot。
- `useSessionRadarFeed` 需要把 timer 刷新和历史快照刷新拆成显式状态来源。
- 必须补行为测试，证明 sentinel removal 后刷新语义不变。

## Acceptance Criteria
- [ ] `customModelsVersion` 不再作为 version-only sentinel 存在。
- [ ] `durationRefreshTick` / `historyMutationVersion` 不再作为 version-only sentinel 存在。
- [ ] `ButtonArea` 新增或更新测试，覆盖 same-tab `localStorageChange` 刷新模型列表。
- [ ] `useSessionRadarFeed` 测试覆盖 timer refresh 与 history event refresh。
- [ ] `npm run lint` / `npm run typecheck` / 定向 `vitest` 全部通过。

## Technical Notes
- 优先使用最小范围的 snapshot state，不在本轮引入通用 shared external-store 抽象。
- `ButtonArea` 与 radar 的行为风险高于普通 warning cleanup，因此必须以行为测试作为验收，而不是只看 lint。
