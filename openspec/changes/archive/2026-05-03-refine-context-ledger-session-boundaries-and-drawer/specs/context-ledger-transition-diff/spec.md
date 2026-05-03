## ADDED Requirements

### Requirement: Context Ledger Transition Diff SHALL Remain Session-Scoped

系统 MUST 把 `last send` 与 `pre-compaction` comparison 限定在当前 thread/session boundary 内，而不是跨会话复用最近一次基线。

#### Scenario: switching to a new thread clears the previous send comparison

- **WHEN** 用户切换到新的 thread/session
- **THEN** 系统 SHALL 清空旧 thread 的 `last send baseline`
- **AND** 新 thread SHALL NOT 继续显示旧 thread 的 `相比最近一次发送` comparison

#### Scenario: switching workspace context clears pre-compaction baseline

- **WHEN** composer 关联的 workspace context 发生切换
- **THEN** 系统 SHALL 清空旧上下文的 `pre-compaction baseline`
- **AND** SHALL NOT 把旧 workspace 的 compaction comparison 带入当前 surface
