## ADDED Requirements

### Requirement: Claude Concurrent Realtime Session Rebind MUST Prefer Turn-Bound Pending Lineage

当同一 workspace 下存在多个并行 `Claude` pending 会话时，系统 MUST 先用 `turnId` 将 realtime session-id update 绑定到拥有相同 turn 的 pending thread，而不是依赖当前 active 会话或单个 pending 猜测。

#### Scenario: concurrent Claude session start binds to matching pending turn
- **WHEN** 同一 workspace 下存在两条或以上 `claude-pending-*` 线程
- **AND** Claude runtime 发出包含 `sessionId` 与 `turnId` 的 session started 事件
- **THEN** 前端 MUST 将该 finalized `claude:<sessionId>` 绑定到 `activeTurnIdByThread == turnId` 的 pending thread
- **AND** 系统 MUST NOT 因为当前 `activeThreadId` 指向另一条 Claude 会话而把 rebind 路由到错误会话

#### Scenario: missing turn-bound match falls back conservatively
- **WHEN** Claude session started 事件缺少 `turnId`，或当前没有唯一 turn-bound pending match
- **THEN** 系统 MAY 回退到现有保守 pending resolver
- **AND** 系统 MUST NOT 引入比当前实现更激进的 session 猜测误绑

### Requirement: Claude Concurrent Realtime Isolation MUST Not Pollute Final Conversation Truth

realtime 阶段的并行 session rebind 失败 MUST NOT 污染最终的 canonical conversation truth。

#### Scenario: realtime crossed surface does not survive final reconcile
- **WHEN** 并行 Claude 会话在 realtime 阶段出现 crossed surface 风险
- **THEN** 系统 MUST 将错误限制在临时 live 路由层
- **AND** 最终 canonical history / selected conversation truth MUST 仍能收敛到各自正确会话
