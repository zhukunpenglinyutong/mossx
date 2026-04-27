## MODIFIED Requirements

### Requirement: Claude Sidebar Entry MUST Resolve Against Native Session Truth Before Activation

当用户从左侧栏重新打开 `Claude` 历史会话时，系统 MUST 在 activation / history load 前先确认该 entry 对应的 native session truth，而不是直接把 sidebar projection 当成事实源。

#### Scenario: concurrent realtime crossed surface does not rewrite final sidebar truth
- **WHEN** 同一 workspace 下存在多个并行 `Claude` realtime 会话
- **AND** live session rebind 一度需要在多个 pending 之间做隔离
- **THEN** sidebar selected entry 的最终 truth MUST 仍然收敛到对应 native session
- **AND** temporary realtime isolation failure MUST NOT 永久改写历史 reopen 后的 selected conversation truth
