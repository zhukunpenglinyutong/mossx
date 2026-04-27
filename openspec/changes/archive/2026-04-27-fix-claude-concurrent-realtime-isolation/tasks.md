## 1. Event Contract

- [x] 1.1 [P0] 为 engine `SessionStarted` 事件增加 optional `turnId` 透传，并保证 Claude runtime 在 emit realtime session start 时填充该值。
- [x] 1.2 [P0] 让 app server event / frontend handler 把 `turnId` 一路透传到 `onThreadSessionIdUpdated()`。

## 2. Realtime Isolation

- [x] 2.1 [P0] 在 `useThreads` 中新增按 `(workspaceId, engine, turnId)` 解析 pending thread 的 helper，优先匹配拥有相同 active turn 的 pending thread。
- [x] 2.2 [P0] 在 `useThreadTurnEvents` 的 `onThreadSessionIdUpdated()` 中优先使用 turn-bound pending source，再回退到现有 `resolvePendingThreadForSession()`。
- [x] 2.3 [P0] 保持缺失 `turnId` 时的现有保守兼容逻辑，不引入更激进的误绑策略。

## 3. Validation

- [x] 3.1 [P0] 补充 `useThreadTurnEvents` 的并行 Claude session regression tests，覆盖两个 pending Claude turns 同时存在时的 session rebind。
- [x] 3.2 [P0] 补充 app server / Rust event tests，确保 `turnId` 透传正确且旧路径兼容。
- [x] 3.3 [P0] 执行 `openspec validate fix-claude-concurrent-realtime-isolation --strict` 与最小相关测试。
