# composer-manual-memory-reference Specification

## Purpose

Defines the composer-manual-memory-reference behavior contract, covering `@@` 触发项目记忆候选.
## Requirements
### Requirement: `@@` 触发项目记忆候选

系统 MUST 在 Composer 中支持 `@@` 触发项目记忆候选列表，用于用户主动关联记忆。

#### Scenario: 输入 `@@` 打开候选

- **WHEN** 用户在聊天输入框输入 `@@`
- **THEN** 系统 SHALL 打开项目记忆候选列表
- **AND** 候选来源 SHALL 限定为当前 workspace 的项目记忆

#### Scenario: `@` 文件引用不受影响

- **WHEN** 用户输入单个 `@`
- **THEN** 系统 SHALL 保持现有文件引用自动补全语义
- **AND** `@@` 语义 SHALL 与 `@` 语义隔离

### Requirement: 候选列表支持多选

系统 MUST 支持用户从记忆候选中多选并维持本次发送上下文。

#### Scenario: 多选记忆

- **WHEN** 用户在候选列表中连续选择多条记忆
- **THEN** 系统 SHALL 保留全部选中项
- **AND** Composer 区域 SHALL 可见地展示已选记忆

#### Scenario: 取消选择

- **WHEN** 用户移除已选记忆项
- **THEN** 该记忆 SHALL 从本次发送集合中移除

### Requirement: 候选信息可读与可比较

系统 MUST 在 `@@` 候选中提供足够信息支持用户选择，并以左侧 compact preview + 右侧完整详情的方式控制信息密度。

#### Scenario: 候选卡片信息完整

- **WHEN** 系统渲染记忆候选项
- **THEN** 每项 SHALL 至少展示标题与摘要片段
- **AND** SHALL 展示关键元信息（如 kind、优先级、更新时间、标签、engine 中的一组或多组）

#### Scenario: 左侧候选 compact preview

- **GIVEN** 候选记忆包含很长的 AI 回复
- **WHEN** 系统渲染 `@@` 候选左侧列表
- **THEN** 左侧候选项 SHALL 将标题限制为 1 行
- **AND** SHALL 将摘要限制为 2 到 3 行
- **AND** SHALL 将 metadata 压缩为 1 行
- **AND** SHALL NOT 因长正文撑高单条候选

#### Scenario: 选择前可查看细节

- **WHEN** 用户仅高亮或聚焦某条候选但未选择
- **THEN** 系统 SHALL 在右侧详情区提供该候选的完整细节预览
- **AND** 预览行为 SHALL NOT 改变该候选的选中状态

#### Scenario: 右侧详情保持完整展开

- **GIVEN** 用户高亮一条 conversation turn 记忆候选
- **WHEN** 右侧详情区渲染
- **THEN** 右侧 SHALL 能展示完整用户输入和完整 AI 回复
- **AND** Phase 3 的左侧 compact preview 改动 SHALL NOT 裁剪右侧详情内容

#### Scenario: 同屏候选数量

- **GIVEN** 输入框上方有足够高度显示 `@@` 候选弹层
- **WHEN** 候选列表包含 8 条以上记忆
- **THEN** 左侧列表 SHALL 稳定展示至少 5 条候选
- **AND** 剩余候选 SHALL 通过列表滚动访问

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

### Requirement: 选择数据的会话隔离

系统 MUST 保证手动选择仅作用于当前会话发送，不跨会话泄漏。

#### Scenario: 切换会话不继承选择

- **WHEN** 用户切换到另一个 thread 或 workspace
- **THEN** 系统 SHALL 不复用上一会话的手动记忆选择

### Requirement: `@@` 候选跨平台布局稳定性

系统 SHALL 以平台无关的 CSS 和文本裁剪策略渲染 `@@` 候选，避免不同操作系统字体、滚动条和换行差异破坏布局。

#### Scenario: 长英文 token 不撑破候选

- **GIVEN** 候选标题或摘要包含很长的英文 token、路径或代码符号
- **WHEN** 系统渲染左侧 compact preview
- **THEN** 文本 SHALL 被 clamp、wrap 或 overflow 处理
- **AND** SHALL NOT 横向撑破候选面板

#### Scenario: Windows 和 macOS 滚动条差异不影响右侧详情

- **WHEN** `@@` 候选弹层在 Windows 或 macOS 渲染
- **THEN** 左侧列表 SHALL 保持独立滚动容器
- **AND** 右侧详情 SHALL 保持可滚动和可阅读

