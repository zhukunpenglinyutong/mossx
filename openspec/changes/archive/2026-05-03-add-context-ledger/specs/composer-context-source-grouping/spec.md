## ADDED Requirements

### Requirement: Composer-Visible Context Sources SHALL Preserve Grouping Semantics In Ledger

系统 SHALL 将 Composer 中用户可见的上下文来源语义带入 Context Ledger，而不是把它们压平成无来源说明的杂项列表。

#### Scenario: active and inline file references keep resource grouping

- **WHEN** 当前发送同时包含 active file reference 与 inline file references
- **THEN** ledger SHALL 将这些引用投影为资源相关 block
- **AND** 重复引用 SHALL 使用稳定去重结果

#### Scenario: non-resource helper selections are not misclassified as resource blocks

- **WHEN** 当前仅存在 slash command、skill 或其他 prompt-assembly helper 选择
- **THEN** ledger SHALL NOT 把这些 helper 伪装成 file 或 memory resource blocks
- **AND** 资源分组 SHALL 只覆盖真实上下文来源
