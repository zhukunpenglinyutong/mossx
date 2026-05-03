## ADDED Requirements

### Requirement: Composer-Adjacent Memory Feedback SHALL Stay Ledger-Traceable

系统 MUST 让用户从 Composer 附近看到的手动记忆反馈与 Context Ledger 使用同一套来源语义，而不要求重做现有项目记忆管理面板。

#### Scenario: manual memory selection keeps stable provenance in ledger

- **WHEN** 用户通过 `@@` 选择某条项目记忆
- **THEN** Composer 附近的 ledger surface SHALL 使用稳定标题回退与 memory provenance 展示该记忆
- **AND** 该展示 SHALL NOT 依赖修改原始项目记忆详情结构

#### Scenario: composer feedback and ledger stay in sync

- **WHEN** 当前发送的手动记忆选择集合发生变化
- **THEN** 现有 Composer 反馈与 ledger surface SHALL 同步更新
- **AND** 用户 SHALL NOT 看到两套不同步的选择结果
