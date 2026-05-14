## MODIFIED Requirements

### Requirement: 前端消息注入
系统 MUST 在用户发送消息前采用"手动选择优先 + 显式 Memory Reference"注入策略，不再执行静默自动相关性检索注入，并 SHALL 将模型可见上下文组织为 Project Memory Retrieval Pack。

#### Scenario: 未手动选择且未开启 Memory Reference 时不注入

- **WHEN** 用户发送消息且本次未手动选择任何记忆
- **AND** Composer Memory Reference toggle 未开启
- **THEN** 系统 SHALL 直接发送用户原始文本
- **AND** SHALL NOT 自动调用相关性注入流程

#### Scenario: 手动选择后注入详细记录

- **WHEN** 用户在本次发送前手动选择了项目记忆
- **THEN** 系统 SHALL 注入这些已选记忆
- **AND** 注入块 SHALL 追加在用户原始文本前
- **AND** 注入来源 SHALL 标记为 `manual-selection`
- **AND** 每条被注入记忆 SHALL 使用详细 source record，而不是只注入 summary

#### Scenario: 开启 Memory Reference 后注入清洗后的 Retrieval Pack

- **WHEN** 用户开启 Composer Memory Reference toggle 并发送消息
- **THEN** 系统 SHALL 在发送前执行当前 workspace 的 Project Memory 检索
- **AND** 若存在候选记忆，系统 SHALL 执行受限 Memory Cleaner 或等价清洗步骤
- **AND** 若清洗或检索返回可用上下文，系统 SHALL 注入 cleaned context 和详细 source records
- **AND** 注入来源 SHALL 标记为 `memory-scout`

#### Scenario: 手动选择与 Memory Reference 并存

- **WHEN** 用户已手动选择记忆
- **AND** 同时开启 Memory Reference toggle
- **THEN** 系统 SHALL 同时保留 `manual-selection` 和 `memory-scout` 两类来源
- **AND** UI SHALL 区分显示两类注入来源
- **AND** 两类来源 SHALL 使用同一 Retrieval Pack 索引体系

#### Scenario: 注入记忆作为独立关联资源展示

- **GIVEN** 用户消息包含 `manual-selection` 或 `memory-scout` 的 Project Memory 注入块
- **WHEN** 系统在消息时间线中渲染该轮对话
- **THEN** Project Memory 引用 SHALL 作为独立关联资源卡片展示
- **AND** SHALL NOT 与用户可见输入气泡混排
- **AND** Claude、Codex 和 Gemini 路径 SHALL 使用一致的展示语义

#### Scenario: Codex 历史回放保留 Project Memory 关联资源

- **GIVEN** Codex 历史记录中的 user payload 原始文本包含 Project Memory Retrieval Pack 或兼容 `<project-memory>` 注入块
- **WHEN** 系统从 remote resume 或 local JSONL history 回放该线程
- **THEN** history loader SHALL 保留 Project Memory 注入块供消息渲染层解析
- **AND** 用户可见气泡 SHALL 只显示真实用户输入
- **AND** Project Memory 引用 SHALL 独立显示为关联资源卡片

#### Scenario: 当次发送后清空

- **WHEN** 注入发送完成（成功或失败后收敛）
- **THEN** 系统 SHALL 清空本次手动选择集合
- **AND** Memory Reference toggle SHALL 回到未激活状态或空闲状态
- **AND** 下次发送前需重新选择或重新开启

### Requirement: Token 预算控制
系统 MUST 控制 Retrieval Pack 的总上下文预算，优先保留详细 source record 的身份、来源和任务相关字段，并显式标记发生裁剪的位置。

#### Scenario: 字段级裁剪

- **GIVEN** 单条记忆的 assistantResponse 超过单字段预算
- **WHEN** 系统构建 Retrieval Pack
- **THEN** 系统 SHALL 保留 memoryId、索引和来源 metadata
- **AND** SHALL 裁剪超预算字段
- **AND** SHALL 在该字段或该记录上标记 truncated

#### Scenario: 总量预算裁剪

- **GIVEN** 候选记忆共 10 条
- **AND** Retrieval Pack 达到总预算限制
- **WHEN** 系统继续处理剩余记忆
- **THEN** 系统 SHALL 停止追加低优先级记录
- **AND** SHALL 在 pack 头部标记 `truncated="true"` 或等价状态

#### Scenario: 不以 summary 替代详细记录

- **GIVEN** 某条记忆被选中注入
- **WHEN** 该记忆在预算内可容纳详细字段
- **THEN** 系统 SHALL 注入详细字段
- **AND** SHALL NOT 仅用 summary 替代完整 source record
