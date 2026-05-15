## MODIFIED Requirements

### Requirement: 前端消息注入

系统 MUST 在用户发送消息前采用"手动选择优先 + 显式 Memory Reference"注入策略，并 SHALL 将 Memory Reference 的检索状态作为单个可更新的 UI 生命周期展示。

#### Scenario: Memory Reference 状态卡原地更新

- **WHEN** 用户开启 Composer Memory Reference toggle 并发送消息
- **THEN** 系统 SHALL 显示一张 Memory Reference 查询状态卡
- **AND** 查询完成后 SHALL 用最终状态原地更新同一张卡
- **AND** 时间线中 SHALL NOT 同时保留查询中卡片和最终结果卡片

#### Scenario: Memory Reference 空结果仍只显示一张卡

- **GIVEN** Project Memory 检索返回空结果
- **WHEN** 查询状态卡更新为 `no related project memory found`
- **THEN** 系统 SHALL 复用查询状态卡的同一条消息记录
- **AND** 不得新增第二张 Memory Reference 摘要卡

#### Scenario: Memory Reference 命中结果仍只显示一张卡

- **GIVEN** Project Memory 检索命中至少一条记忆
- **WHEN** 查询状态卡更新为 `referenced N project memories`
- **THEN** 系统 SHALL 复用查询状态卡的同一条消息记录
- **AND** 注入到主会话的 Project Memory Retrieval Pack SHALL 保持不变

#### Scenario: 检索包历史展示使用统一结构化资源卡

- **GIVEN** 用户消息中包含 `project-memory-pack` 注入内容
- **WHEN** 消息列表渲染该消息的记忆上下文卡片
- **THEN** 系统 SHALL 在用户气泡外展示独立资源卡
- **AND** 资源卡 SHALL 优先展示 UI-only 唯一序号与 `Source Records` 中的记忆标题
- **AND** 当多个 `project-memory-pack` 各自包含内部 `[M1]` 时，资源卡 SHALL NOT 在左侧主索引位重复显示多个 `[M1]`
- **AND** 资源卡 SHALL NOT 将完整 `Cleaned Context`、`Original user input` 或 `Original assistant response` 作为普通正文倾倒到卡片内

#### Scenario: 检索包可查看真实发送详情

- **GIVEN** 用户消息中包含 `project-memory-pack` 注入内容
- **WHEN** 用户从记忆上下文卡片打开发送详情
- **THEN** 系统 SHALL 按 `project-memory-pack` 分组展示实际注入到该轮主会话的记忆详情
- **AND** 详情 SHALL 默认使用 Markdown 渲染 `Cleaned Context`
- **AND** 详情 SHALL 在折叠 raw 区域保留真实 `<project-memory-pack>` payload、`[Mx]` 引用、source、memoryId 与原始记录字段
- **AND** 详情窗体 SHALL 提供可见的关闭控件
- **AND** 详情 SHALL 仅用于审计/调试展示，不改变发送到主会话的 payload

#### Scenario: Legacy 记忆摘要保留 Markdown 格式

- **GIVEN** 历史消息包含没有结构化 records 的记忆摘要
- **WHEN** 用户展开该记忆上下文卡片
- **THEN** 系统 SHALL 使用 Markdown 渲染摘要原文
- **AND** 标题、列表、inline code 等 Markdown 结构 SHALL 保持格式化展示

#### Scenario: 语义检索不在本变更实现

- **WHEN** 用户输入宽泛回忆型问题导致文本检索召回不足
- **THEN** 本变更 SHALL NOT 引入本地向量、embedding、ANN 或新的检索依赖
- **AND** 系统 SHALL 将该问题保留为后续独立方案研究
