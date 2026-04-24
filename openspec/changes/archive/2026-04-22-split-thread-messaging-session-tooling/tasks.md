## 1. Spec And Task Setup

- [x] 1.1 创建本次 `useThreadMessaging` modularization 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 thread messaging 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-thread-messaging-session-tooling 显示 tasks ready/done]`

## 2. Session Tooling Extraction

- [x] 2.1 新建 feature-local hook 承载 session tooling commands `[P1][依赖: 1.1][输入: startContext 到 startResume 的 commands][输出: useThreadMessagingSessionTooling.ts][验证: hook 暴露稳定 action surface]`
- [x] 2.2 在 `useThreadMessaging.ts` 中接线新 hook 并保留原返回字段名 `[P1][依赖: 2.1][输入: 顶层 hook return surface][输出: 兼容的 outward contract][验证: useThreads/useQueuedSend 不需要迁移]`
- [x] 2.3 确保 `src/features/threads/hooks/useThreadMessaging.ts` 行数降到当前 P1 hard gate 以下 `[P0][依赖: 2.2][输入: 拆分后的主 hook][输出: 低于 policy fail threshold 的 useThreadMessaging.ts][验证: check-large-files:gate 不再将该文件标记为 retained hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 hook extraction 没有破坏下游 contract `[P0][依赖: 2.3][输入: 拆分后的 thread messaging hooks][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 targeted tests 验证 slash commands 与 queued send 行为未回退 `[P0][依赖: 2.3][输入: useThreadMessaging / useQueuedSend][输出: 通过的测试结果][验证: useThreadMessaging.test.tsx 与 useQueuedSend.test.tsx 通过]`
- [x] 3.3 执行 `npm run check:large-files:gate` 与 baseline/watchlist 重算 `[P0][依赖: 2.3][输入: 拆分后的 large-file 状态][输出: 更新后的 baseline/watchlist][验证: gate 通过且 baseline 反映新的 useThreadMessaging 行数]`
