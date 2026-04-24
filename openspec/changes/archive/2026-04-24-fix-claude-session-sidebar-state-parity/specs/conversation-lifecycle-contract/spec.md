## MODIFIED Requirements

### Requirement: Unified Cross-Engine Conversation Lifecycle Contract

The system MUST define consistent lifecycle semantics (delete, recent ordering, restart visibility, key tool card recoverability) across Claude, Codex, and OpenCode.

#### Scenario: claude sidebar entry is reconciled before lifecycle consumers treat it as active
- **WHEN** 当前引擎为 `Claude`
- **AND** 用户从 recent conversations sidebar 重新激活一条历史会话
- **AND** 该 entry 需要 canonical resolve、existence check 或等价 reconcile
- **THEN** 生命周期消费者 MUST 在读取其 active identity 前先完成该 reconcile
- **AND** 系统 MUST NOT 让 sidebar 显示的 selected entry 与实际打开的 `Claude` native session identity 相互矛盾

#### Scenario: claude load failure cannot settle as a false loaded success
- **WHEN** `Claude` 历史会话在 history load / reopen 过程中失败
- **THEN** 生命周期状态 MUST 进入可解释的 failure 或 reconcile 分支
- **AND** 系统 MUST NOT 继续把该 entry 当作已正常加载的 thread

