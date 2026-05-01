## MODIFIED Requirements

### Requirement: 项目级信号 MUST 反映 worktree 汇总状态

系统 MUST 在 hide-exited filtering 与 worktree 汇总状态之间保持层级连续性，避免隐藏仍承载活跃 descendant 的 exited ancestor。

#### Scenario: running child session keeps exited parent visible under hide-exited mode
- **WHEN** hide-exited mode is enabled for a workspace or worktree
- **AND** an exited ancestor row still owns a running, reviewing, or otherwise active descendant session
- **THEN** the ancestor row SHALL remain visible as hierarchy context
- **AND** only inactive exited leaf rows SHALL be hidden

### Requirement: exited session visibility toggle MUST be project-scoped and icon-level

系统 MUST 将 exited session visibility 视为 workspace/worktree row 级别的显示偏好，并在 leading icon 附近提供稳定的 icon-level affordance，而不是在 thread list 内渲染独立的常驻条带。

#### Scenario: workspace row exposes icon-level exited visibility toggle
- **GIVEN** 某 workspace 当前列表中存在至少一条 exited session
- **WHEN** 侧栏渲染该 workspace 行
- **THEN** 该 workspace 行 MUST 在 leading icon 附近提供 show/hide exited sessions 的 icon affordance
- **AND** keyboard 激活该 affordance 时 MUST NOT 触发父级 row 的 collapse / expand 热键
- **AND** thread list 内 MUST NOT 再渲染同语义的常驻 pill bar

#### Scenario: path-scoped visibility survives list rebuild
- **WHEN** workspace / worktree rows are rebuilt after refresh
- **THEN** exited visibility preference SHALL be restored by normalized workspace path
- **AND** sibling worktrees and parent workspace SHALL NOT share the same preference unless their normalized path is identical
