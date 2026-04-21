# Fix Explored Card Auto Collapse

## Goal

优化实时对话中的 `Explored` 工具卡片展开/折叠行为：保留实时 Explore 阶段自动展开，但当流式对话进入后续非 Explore 阶段时自动折叠已完成探索详情。

## OpenSpec Change

- `fix-explored-card-auto-collapse-after-stage`

## Requirements

- 保留实时对话过程中 `Explored` 自动展开的现有行为。
- 只在对话完成后或实时阶段推进到非 Explore 操作时自动折叠。
- 不影响其他工具卡片或非 Explore 操作展示逻辑。
- 不修改 runtime/backend contract。

## Acceptance Criteria

- [x] 最新实时阶段仍是 Explore 时，Explore 卡片自动展开。
- [x] processing 仍为 true 但后续阶段变成非 Explore 时，旧 `Explored` 自动折叠。
- [x] existing Explore merge / hide / chronology tests 继续通过。
- [x] 目标测试和 typecheck 通过。

## Technical Notes

- 前端局部 UI state 修复，目标文件为 `Messages.tsx`。
- 回归测试放在 `Messages.explore.test.tsx`。
