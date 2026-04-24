## ADDED Requirements

### Requirement: Claude Sidebar Entry MUST Resolve Against Native Session Truth Before Activation

当用户从左侧栏重新打开 `Claude` 历史会话时，系统 MUST 在 activation / history load 前先确认该 entry 对应的 native session truth，而不是直接把 sidebar projection 当成事实源。

#### Scenario: stale sidebar entry is reconciled before reopen
- **WHEN** 用户选择左侧栏中的 `Claude` 历史会话
- **AND** 该 entry 对应的 native session 已失效、缺失或需要 canonical resolve
- **THEN** 系统 MUST 先执行 existence check、canonical resolve 或等价 reconcile
- **AND** 系统 MUST NOT 直接进入一个与该 entry 不一致的 loaded success 状态

#### Scenario: reopen failure does not silently create a new agent conversation
- **WHEN** `Claude` 历史会话在 reopen / history load 过程中失败
- **THEN** 系统 MUST 将该结果视为当前 entry 的 recoverable failure 或 reconcile 分支
- **AND** 系统 MUST NOT 静默创建一个不相关的新 Agent conversation 来顶替原 entry

### Requirement: Claude Sidebar Projection MUST Converge Back To Session Truth After Not-Found

当 `Claude` sidebar entry 已与底层 session truth 分叉，系统 MUST 在 authoritative not-found 之后收敛回真实状态，而不是保留永久 ghost entry。

#### Scenario: delete not found triggers ghost cleanup
- **WHEN** 用户删除某条 `Claude` sidebar entry
- **AND** authoritative delete path 返回 `SESSION_NOT_FOUND` 或等价 not-found
- **THEN** 系统 MUST 触发 authoritative refresh、ghost cleanup 或等价 reconcile
- **AND** 左侧栏最终 MUST 不再长期保留该失效 entry

