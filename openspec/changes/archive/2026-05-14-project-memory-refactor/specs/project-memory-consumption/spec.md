# project-memory-consumption Specification Delta

## MODIFIED Requirements

### Requirement: 前端消息注入
系统 MUST 继续支持手动选择 Project Memory 注入，并兼容 conversation turn projection。

#### Scenario: 未手动选择时不注入
- **WHEN** 用户发送消息且本次未手动选择任何记忆
- **THEN** 系统 SHALL 直接发送用户原始文本
- **AND** SHALL NOT 自动注入项目记忆

#### Scenario: 手动选择 conversation turn 后可注入完整详情
- **GIVEN** 用户通过 `@@` 选择一条 conversation turn memory
- **WHEN** 当前注入模式为 detail
- **THEN** 注入内容 SHOULD 包含该 turn 的完整用户输入与完整 AI 回复
- **AND** MUST NOT 只注入 assistant 摘要片段

#### Scenario: summary mode 使用派生摘要
- **GIVEN** 用户选择 conversation turn memory
- **WHEN** 当前注入模式为 summary
- **THEN** 注入内容 MAY 使用 projection `summary`
- **AND** MUST 保持现有 summary mode 的短上下文语义

### Requirement: Context Ledger Consumption
系统 MUST 让 Context Ledger 在字段升级期间继续稳定展示选中的 Project Memory。

#### Scenario: ledger block 使用兼容字段
- **GIVEN** Context Ledger 接收到 selected Project Memory
- **WHEN** 该 memory 是 conversation turn
- **THEN** ledger projection MUST 能使用 `title/summary/detail` 构建 block
- **AND** MUST NOT 因新增 canonical fields 缺少旧假设而崩溃

#### Scenario: detail inspection 可回看完整 turn
- **GIVEN** 用户从 Context Ledger 打开一条 conversation turn memory 来源
- **WHEN** Project Memory panel 聚焦该 memory
- **THEN** 详情 MUST 展示完整 `userInput` 与完整 `assistantResponse`

### Requirement: User Review Value
系统 MUST 将消费体验从“记忆摘要”提升为“完整轮次回看”。

#### Scenario: 复制整轮内容
- **GIVEN** 用户打开 conversation turn memory 详情
- **WHEN** 用户执行复制整轮内容
- **THEN** 复制结果 MUST 包含完整用户输入
- **AND** MUST 包含完整 AI 回复
- **AND** MUST 包含 `threadId/turnId`
