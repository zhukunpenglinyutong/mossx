## ADDED Requirements

### Requirement: Context Ledger SHALL Explain Compaction Relative To A Pre-Compaction Baseline

系统 MUST 让 Codex compaction 的解释语义相对于压缩前快照成立，而不是只显示一条当前状态文案。

#### Scenario: compaction completed shows pre-compaction comparison

- **WHEN** Codex compaction 从 `idle/compacting` 进入 `compacted`
- **THEN** ledger SHALL 能展示相对于 `pre-compaction baseline` 的变化摘要
- **AND** 该摘要 SHALL 至少覆盖 recent turns / usage delta 或等价变化信息

#### Scenario: compaction pending sync remains explicit inside comparison

- **WHEN** compaction 已完成但 usage snapshot 尚未刷新
- **THEN** ledger SHALL 在 comparison 语义中继续表达 pending-sync 状态
- **AND** SHALL NOT 把未刷新的 usage delta 伪装成最终同步结果
