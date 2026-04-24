## 1. Spec And Task Setup

- [x] 1.1 创建本次 git history branch compare style extraction 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 git history 样式结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-git-history-branch-compare-styles 显示 tasks ready/done]`

## 2. Branch Compare Style Extraction

- [x] 2.1 新建 branch compare CSS shard，并从 `git-history.part1.css` 中迁出 `git-history-branch-compare-*` 命名空间 `[P1][依赖: 1.1][输入: git-history.part1.css 中 branch compare block 边界][输出: git-history.branch-compare.css][验证: selector 与规则内容保持等价]`
- [x] 2.2 更新 `git-history.css` import 顺序，保持聚合入口和 cascade 顺序稳定 `[P0][依赖: 2.1][输入: 原 git-history.css 引入顺序][输出: 等价的样式入口][验证: 新 shard 在原 branch compare block 的相对位置引入]`
- [x] 2.3 确保 `git-history.part1.css` 低于当前 `styles` policy 的 fail threshold `[P0][依赖: 2.2][输入: 拆分后的 git history 样式文件][输出: 不再触发 retained hard debt 的 git-history.part1.css][验证: check-large-files:gate 不再将该文件标记为 hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run check:large-files:gate` 验证样式拆分通过治理门禁 `[P0][依赖: 2.3][输入: 拆分后的 git history 样式文件][输出: 通过的治理检查结果][验证: 无新的 gate failure]`
- [x] 3.2 重算 baseline/watchlist，确认 retained hard debt 与 near-threshold 状态已更新 `[P0][依赖: 2.3][输入: 最新 large-file 状态][输出: 更新后的 baseline/watchlist 文档][验证: baseline 与 watchlist 反映新的 git history 样式行数]`
