## 1. Spec And Task Setup

- [x] 1.1 创建本次 `threadItems` assistant text modularization 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 threadItems 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-thread-items-assistant-text-normalization 显示 tasks ready/done]`

## 2. Assistant Text Extraction

- [x] 2.1 新建 util module 承载 assistant text normalization / dedupe / readability scoring `[P1][依赖: 1.1][输入: assistant text policy 相关 helper][输出: threadItemsAssistantText.ts][验证: 暴露稳定的 text policy functions]`
- [x] 2.2 在 `threadItems.ts` 中接线新 util module 并保持既有 export surface `[P1][依赖: 2.1][输入: 当前 threadItems public API][输出: 兼容的 outward contract][验证: 现有调用方不需要迁移 import 路径]`
- [x] 2.3 确保 `src/utils/threadItems.ts` 行数降到当前 P1 hard gate 以下 `[P0][依赖: 2.2][输入: 拆分后的主 utils 文件][输出: 低于 policy fail threshold 的 threadItems.ts][验证: check-large-files:gate 不再将该文件标记为 retained hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 util extraction 没有破坏下游 contract `[P0][依赖: 2.3][输入: 拆分后的 thread item utils][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 targeted tests 验证 assistant text normalize 相关行为未回退 `[P0][依赖: 2.3][输入: loader/reducer/thread action 相关 tests][输出: 通过的测试结果][验证: threadReducerTextMerge.test.ts / useThreadActions.test.tsx / useThreadActions.rewind.test.tsx 通过]`
- [x] 3.3 执行 `npm run check:large-files:gate` 与 baseline/watchlist 重算 `[P0][依赖: 2.3][输入: 拆分后的 large-file 状态][输出: 更新后的 baseline/watchlist][验证: gate 通过且 baseline 反映新的 threadItems 行数]`
