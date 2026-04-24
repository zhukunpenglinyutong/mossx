## 1. Spec And Task Setup

- [x] 1.1 创建本次 `AppShell` modularization 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 app-shell 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-app-shell-orchestration 显示 tasks ready/done]`

## 2. AppShell Orchestration Split

- [x] 2.1 抽离 `workspace/search/radar/activity` orchestration 到独立 hook `[P1][依赖: 1.1][输入: app-shell 中 workspace/search/radar 相关逻辑][输出: src/app-shell-parts/* hook + 稳定字段回注][验证: 行为字段名不变且 typecheck 通过]`
- [x] 2.2 抽离 `prompt actions` handlers 到独立 hook `[P1][依赖: 1.1][输入: app-shell 中 prompt CRUD/reveal 逻辑][输出: src/app-shell-parts/* hook + 稳定 action 回注][验证: render/layout 节点仍使用原字段名]`
- [x] 2.3 确保 `src/app-shell.tsx` 行数降到当前 P0 hard gate 以下 `[P0][依赖: 2.1,2.2][输入: 拆分后的 AppShell][输出: 低于 policy fail threshold 的 app-shell.tsx][验证: check-large-files:gate 不再将 app-shell.tsx 标记为 retained hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 hook extraction 没有破坏下游 contract `[P0][依赖: 2.3][输入: 拆分后的 app-shell][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 `npm run check:large-files:gate` 验证 `src/app-shell.tsx` 降线成功 `[P0][依赖: 2.3][输入: 拆分后的 app-shell][输出: gate 结果中不再包含 src/app-shell.tsx][验证: gate 通过且 app-shell.tsx 不在 retained hard debt 列表]`
