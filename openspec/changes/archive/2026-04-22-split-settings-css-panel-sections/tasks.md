## 1. Spec And Task Setup

- [x] 1.1 创建本次 settings CSS section split 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 settings 样式结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-settings-css-panel-sections 显示 tasks ready/done]`

## 2. CSS Section Extraction

- [x] 2.1 新建 `Vendor Settings` shard 并从 `settings.part1.css` 中迁出对应 section `[P1][依赖: 1.1][输入: settings.part1.css 的 section 边界][输出: settings.part1.vendor-panels.css][验证: selector 与规则内容保持等价]`
- [x] 2.2 新建 `Basic settings redesign` shard 并从 `settings.part2.css` 中迁出对应 section `[P1][依赖: 1.1][输入: settings.part2.css 的 section 边界][输出: settings.part2.basic-redesign.css][验证: selector 与规则内容保持等价]`
- [x] 2.3 更新 `settings.css` import 顺序，保持聚合入口和 cascade 顺序稳定 `[P0][依赖: 2.1, 2.2][输入: 原 settings.css 引入顺序][输出: 等价的样式入口][验证: 新 shard 在原 section 的相对位置引入]`
- [x] 2.4 确保 `settings.part1.css` 和 `settings.part2.css` 都低于当前 `styles` policy 的 fail threshold `[P0][依赖: 2.3][输入: 拆分后的 settings 样式文件][输出: 不再触发 retained hard debt 的 part 文件][验证: check-large-files:gate 不再将这两个文件标记为 hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run check:large-files:gate` 验证样式拆分通过治理门禁 `[P0][依赖: 2.4][输入: 拆分后的 settings 样式文件][输出: 通过的治理检查结果][验证: 无新的 gate failure]`
- [x] 3.2 重算 baseline/watchlist，确认 retained hard debt 与 near-threshold 状态已更新 `[P0][依赖: 2.4][输入: 最新 large-file 状态][输出: 更新后的 baseline/watchlist 文档][验证: baseline 与 watchlist 反映新的 settings 样式行数]`
