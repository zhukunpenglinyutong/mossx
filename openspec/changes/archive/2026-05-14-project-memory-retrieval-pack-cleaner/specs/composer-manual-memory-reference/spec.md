## MODIFIED Requirements

### Requirement: 一次性注入（One-shot）
系统 MUST 仅在当次发送注入用户手动选择的记忆，发送完成后自动清空选择，并 SHALL 将手动选择的记忆作为详细 Retrieval Pack source records 注入。

#### Scenario: 发送时注入一次

- **WHEN** 用户已选择 2 条记忆并发送消息
- **THEN** 系统 SHALL 在该次请求中注入这 2 条记忆
- **AND** 注入完成后 SHALL 清空本次已选记忆

#### Scenario: 详细记录注入

- **WHEN** 用户通过 `@@` 选择一条 conversation turn 记忆并发送消息
- **THEN** 系统 SHALL 注入该记忆的 detailed source record
- **AND** detailed source record SHALL 包含 memoryId、稳定索引、title、threadId、turnId、engine、updatedAt 中所有可用字段
- **AND** SHALL 包含 userInput 和 assistantResponse 中所有可用字段

#### Scenario: 未选择时不注入

- **WHEN** 用户未选择任何记忆并发送消息
- **THEN** 系统 SHALL 不注入任何项目记忆上下文

### Requirement: 候选信息可读与可比较
系统 MUST 在 `@@` 候选中提供足够信息，支持用户在选择前完成判断；候选 UI MAY 使用 compact preview，但发送注入 MUST 使用 detailed source record。

#### Scenario: 候选卡片信息完整

- **WHEN** 系统渲染记忆候选项
- **THEN** 每项 SHALL 至少展示标题与摘要片段
- **AND** SHALL 展示关键元信息（如 kind、优先级、更新时间、标签中的一组或多组）

#### Scenario: 选择前可查看细节

- **WHEN** 用户仅高亮/聚焦某条候选但未选择
- **THEN** 系统 SHALL 提供该候选的细节预览
- **AND** 预览行为 SHALL NOT 改变该候选的选中状态

#### Scenario: 长文本可控展示

- **WHEN** 候选摘要或详情内容较长
- **THEN** 系统 SHALL 采用折叠/截断策略避免挤占输入区
- **AND** 用户 SHALL 可以展开查看完整内容

#### Scenario: UI preview 不决定注入内容

- **WHEN** 左侧 `@@` 候选以 compact preview 展示
- **THEN** 该展示 SHALL NOT 裁剪发送时的 source record 语义
- **AND** 发送链路 SHALL 根据 Retrieval Pack 预算决定详细字段裁剪
