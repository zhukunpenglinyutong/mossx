# project-memory-crud Specification Delta

## MODIFIED Requirements

### Requirement: 创建记忆 (Create)
系统 MUST 支持创建 conversation turn memory 与 manual note memory 两类记录。

#### Scenario: 创建自动对话轮次记忆
- **GIVEN** capture/fusion 链路提供 `workspaceId/threadId/turnId/userInput/assistantResponse`
- **WHEN** 系统创建 Project Memory
- **THEN** 记录 MUST 标记为 conversation turn
- **AND** MUST 保存完整 `userInput`
- **AND** MUST 保存完整 `assistantResponse`
- **AND** MUST 生成兼容 `summary/detail/cleanText`

#### Scenario: 创建手动 note 记忆
- **GIVEN** 用户在 Project Memory UI 中手动创建记忆
- **WHEN** 系统调用 create
- **THEN** 记录 SHOULD 标记为 manual note
- **AND** MAY 使用 `title/summary/detail/tags` 作为主要字段
- **AND** MUST NOT 要求 `turnId/userInput/assistantResponse`

### Requirement: 读取记忆 (Read)
系统 MUST 读取完整 conversation turn 详情，并为列表提供兼容 projection。

#### Scenario: 按 ID 查询返回完整 turn fields
- **GIVEN** 记忆 ID 指向一条 conversation turn memory
- **WHEN** 调用 `project_memory_get`
- **THEN** 返回结果 MUST 包含完整 `userInput`
- **AND** MUST 包含完整 `assistantResponse`
- **AND** MUST 包含 `workspaceId/threadId/turnId`

#### Scenario: 列表查询不强制水合大字段
- **GIVEN** workspace 中存在多条超长 conversation turn memory
- **WHEN** 调用 `project_memory_list`
- **THEN** 系统 MAY 返回轻量 projection
- **AND** MUST 保留打开详情后读取完整字段的能力

#### Scenario: 兼容字段继续可用
- **GIVEN** Context Ledger、manual injection 或旧 UI 消费 `summary/detail/cleanText`
- **WHEN** 读取新 conversation turn memory
- **THEN** 系统 MUST 提供由 canonical fields 派生的兼容字段
- **AND** 这些字段 MUST NOT 替代 canonical fields

### Requirement: 更新记忆 (Update)
系统 MUST 区分 conversation turn 的结构化更新与 manual note 的自由编辑更新。

#### Scenario: conversation turn 更新 canonical response
- **GIVEN** assistant completed 后需要补齐一条 provisional turn memory
- **WHEN** 系统执行 update/upsert
- **THEN** MUST 更新 canonical `assistantResponse`
- **AND** MUST 重新生成 projection fields

#### Scenario: manual note 可继续编辑 detail
- **GIVEN** 用户编辑 manual note
- **WHEN** 系统执行 update
- **THEN** MAY 更新 `title/summary/detail/tags/importance`
- **AND** MUST NOT 影响 conversation turn 更新语义

#### Scenario: detail patch 不得覆写 conversation turn 真值
- **GIVEN** 调用方对 conversation turn 传入 `detail`
- **WHEN** 系统执行更新
- **THEN** MUST NOT 将 `detail` 作为 `userInput` 或 `assistantResponse` 的真值来源
- **AND** SHOULD 要求调用方使用结构化 turn patch

### Requirement: 删除记忆 (Delete)
系统 MUST 在兼容期内隐藏旧 soft-deleted 记录，并逐步收敛前端删除 API。

#### Scenario: legacy soft-deleted records remain hidden
- **GIVEN** 旧记录包含 `deletedAt`
- **WHEN** 系统执行 list/get
- **THEN** `deletedAt` 不为空的记录 MUST 继续隐藏

#### Scenario: frontend facade 不暴露 hardDelete 长期语义
- **GIVEN** 前端通过 `projectMemoryFacade.delete` 删除记忆
- **WHEN** conversation turn memory 删除语义完成收口
- **THEN** facade MUST NOT 暴露 `hardDelete` 参数
- **AND** 删除行为 MUST 由后端 record kind 和兼容策略决定
