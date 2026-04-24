## 1. Spec And Task Setup

- [x] 1.1 创建本次 `useThreadActions` session runtime modularization 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 thread actions 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-thread-actions-session-runtime 显示 tasks ready/done]`

## 2. Session Runtime Extraction

- [x] 2.1 新建 feature-local hook 承载 session runtime actions `[P1][依赖: 1.1][输入: start/fork/rewind 相关 callback][输出: useThreadActionsSessionRuntime.ts][验证: hook 暴露稳定 action surface]`
- [x] 2.2 在 `useThreadActions.ts` 中接线新 hook 并保留原返回字段名 `[P1][依赖: 2.1][输入: 顶层 hook return surface][输出: 兼容的 outward contract][验证: useThreads 与现有 tests 不需要迁移]`
- [x] 2.3 确保 `src/features/threads/hooks/useThreadActions.ts` 行数降到当前 P1 hard gate 以下 `[P0][依赖: 2.2][输入: 拆分后的主 hook][输出: 低于 policy fail threshold 的 useThreadActions.ts][验证: check-large-files:gate 不再将该文件标记为 retained hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 hook extraction 没有破坏下游 contract `[P0][依赖: 2.3][输入: 拆分后的 thread action hooks][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 targeted tests 验证 start/fork/rewind 行为未回退 `[P0][依赖: 2.3][输入: useThreadActions 相关线程动作 tests][输出: 通过的测试结果][验证: useThreadActions.test.tsx / useThreadActions.rewind.test.tsx / useThreadActions.codex-rewind.test.tsx / useThreadActions.shared-native-compat.test.tsx 通过]`
- [x] 3.3 执行 `npm run check:large-files:gate` 与 baseline/watchlist 重算 `[P0][依赖: 2.3][输入: 拆分后的 large-file 状态][输出: 更新后的 baseline/watchlist][验证: gate 通过且 baseline 反映新的 useThreadActions 行数]`
