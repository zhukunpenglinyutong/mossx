## Why

`src/styles/git-history.part1.css` 当前约 `2818` 行，已经卡在 `styles` policy 的 retained hard-debt 区间。  
文件尾部从 `.git-history-branch-compare-modal` 开始是一整块命名空间清晰的 branch compare 样式，把这块继续和 git history 主体样式混在一起，只会让样式治理和局部改动的 review 面越来越差。

## 目标与边界

- 目标：
  - 将 branch compare 命名空间从 `git-history.part1.css` 中抽到独立 shard。
  - 保持 `src/styles/git-history.css` 的单入口组织方式。
  - 在不改变 selector contract 与用户可见样式结果的前提下，让 `git-history.part1.css` 回到当前 hard gate 以下。
- 边界：
  - 不修改 `git-history-branch-compare-*` selector 名称。
  - 不改 React 组件的 DOM/className。
  - 不调整 branch compare 视图的视觉设计或交互行为。

## Non-Goals

- 不重写 git history 样式结构。
- 不顺手整理 git history 其它命名空间。
- 不把 branch compare 样式迁移到 CSS module、Tailwind 或其他样式系统。

## What Changes

- 新增承载 `git-history-branch-compare-*` 命名空间的 CSS shard。
- 从 `git-history.part1.css` 中移出 branch compare 样式块。
- 调整 `src/styles/git-history.css` import 顺序，使新 shard 的 cascade 位置与拆分前等价。
- 通过 large-file gate 验证 `git-history.part1.css` 已脱离 retained hard debt。

## Capabilities

### New Capabilities
- `git-history-branch-compare-style-compatibility`: 约束 branch compare 样式抽离后仍保持稳定 selector contract、等价 import order 与用户可见样式结果。

### Modified Capabilities
- None.

## Acceptance Criteria

- `src/styles/git-history.part1.css` 低于当前 `styles` policy 的 fail threshold。
- `src/styles/git-history.css` 继续作为唯一聚合入口，且新 shard 的 import 位置与原 branch compare block 的 cascade 位置等价。
- 现有 `git-history-branch-compare-*` selector contract 不需要调用方迁移。
- `npm run check:large-files:gate` 通过。

## Impact

- Affected code:
  - `src/styles/git-history.css`
  - `src/styles/git-history.part1.css`
  - `src/styles/git-history.branch-compare.css`
- Verification:
  - `npm run check:large-files:gate`
  - `npm run check:large-files:baseline`
  - `npm run check:large-files:near-threshold:baseline`
