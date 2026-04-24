## Why

`src/styles/settings.part1.css` 和 `src/styles/settings.part2.css` 都已经进入当前 `styles` policy 的 retained hard-debt 区间。  
问题不只是“文件大”，而是这两个文件已经同时承载多个视觉子域，导致任何局部样式调整都会放大 review 面积，也让后续继续治理 `settings` 面板的成本持续升高。

## 目标与边界

- 目标：
  - 按自然 section 边界拆分 `settings.part1.css` 与 `settings.part2.css`。
  - 保持 `src/styles/settings.css` 作为稳定聚合入口。
  - 在不改变 selector contract 和 cascade 结果的前提下，让两个大文件回到当前 hard gate 以下。
- 边界：
  - 不修改 React 组件 DOM 结构。
  - 不重命名任何现有 class selector、CSS variable 或 data-attribute。
  - 不调整 settings 面板的用户可见行为或视觉语义。

## Non-Goals

- 不把 `settings` 样式迁移到 CSS modules、Tailwind 或其他样式系统。
- 不顺手改造 settings UI 的 spacing、color、layout 或 interaction。
- 不合并、删除或重写现有 panel section 的 CSS 规则。

## What Changes

- 新增承载 `Vendor Settings` section 的 CSS shard，并从 `settings.part1.css` 中移出该 section。
- 新增承载 `Basic settings redesign` section 的 CSS shard，并从 `settings.part2.css` 中移出该 section。
- 调整 `src/styles/settings.css` import 顺序，使新 shard 在聚合入口中的 cascade 位置与拆分前等价。
- 通过 large-file gate 验证拆分后两个 retained hard-debt 文件都回到当前阈值以下。

## Capabilities

### New Capabilities
- `settings-css-panel-sections-compatibility`: 约束 `settings` 样式分片后仍保持稳定 selector contract、等价 import order 与用户可见样式结果。

### Modified Capabilities
- None.

## Acceptance Criteria

- `src/styles/settings.part1.css` 与 `src/styles/settings.part2.css` 都低于当前 `styles` policy 的 fail threshold。
- `src/styles/settings.css` 继续作为唯一聚合入口，且新 shard 的 import order 与原 section 的 cascade 位置等价。
- settings 面板现有 selector contract 不需要任何调用方迁移。
- `npm run check:large-files:gate` 通过。

## Impact

- Affected code:
  - `src/styles/settings.css`
  - `src/styles/settings.part1.css`
  - `src/styles/settings.part2.css`
  - `src/styles/settings.part1.vendor-panels.css`
  - `src/styles/settings.part2.basic-redesign.css`
- Verification:
  - `npm run check:large-files:gate`
  - `npm run check:large-files:baseline`
  - `npm run check:large-files:near-threshold:baseline`
