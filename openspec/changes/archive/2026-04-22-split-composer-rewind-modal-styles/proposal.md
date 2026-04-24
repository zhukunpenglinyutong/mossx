## Why

`src/styles/composer.part1.css` 当前约 `2941` 行，已经进入 `styles` policy 的 retained hard-debt 区间。  
其中从 `.claude-rewind-modal` 开始到文件末尾是一整块命名空间清晰的 rewind modal 样式，继续把它和 composer 主体样式混在一个文件里，只会让后续维护和治理成本继续抬高。

## 目标与边界

- 目标：
  - 将 rewind modal 命名空间从 `composer.part1.css` 中抽到独立 shard。
  - 保持 `src/styles/composer.css` 的单入口组织方式。
  - 在不改变 selector contract 与用户可见样式结果的前提下，让 `composer.part1.css` 回到当前 hard gate 以下。
- 边界：
  - 不修改 `claude-rewind-modal-*` selector 名称。
  - 不改 React 组件的 DOM/className。
  - 不调整 rewind modal 的视觉设计或交互行为。

## Non-Goals

- 不重写 composer 样式结构。
- 不顺手整理 composer 其它命名空间。
- 不把 rewind modal 样式迁移到 CSS module、Tailwind 或其他样式系统。

## What Changes

- 新增承载 `claude-rewind-modal-*` 命名空间的 CSS shard。
- 从 `composer.part1.css` 中移出 rewind modal 样式块。
- 调整 `src/styles/composer.css` import 顺序，使新 shard 的 cascade 位置与拆分前等价。
- 通过 large-file gate 验证 `composer.part1.css` 已脱离 retained hard debt。

## Capabilities

### New Capabilities
- `composer-rewind-modal-style-compatibility`: 约束 rewind modal 样式抽离后仍保持稳定 selector contract、等价 import order 与用户可见样式结果。

### Modified Capabilities
- None.

## Acceptance Criteria

- `src/styles/composer.part1.css` 低于当前 `styles` policy 的 fail threshold。
- `src/styles/composer.css` 继续作为唯一聚合入口，且新 shard 的 import 位置与原 rewind modal section 的 cascade 位置等价。
- 现有 `claude-rewind-modal-*` selector contract 不需要调用方迁移。
- `npm run check:large-files:gate` 通过。

## Impact

- Affected code:
  - `src/styles/composer.css`
  - `src/styles/composer.part1.css`
  - `src/styles/composer.rewind-modal.css`
- Verification:
  - `npm run check:large-files:gate`
  - `npm run check:large-files:baseline`
  - `npm run check:large-files:near-threshold:baseline`
