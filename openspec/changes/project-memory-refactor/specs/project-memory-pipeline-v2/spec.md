# project-memory-pipeline-v2 Specification Delta

## ADDED Requirements

### Requirement: Conversation Turn Memory SHALL Be the Canonical Automatic Memory Unit
系统 MUST 将自动采集的项目记忆建模为完整对话轮次，而不是 assistant 回复摘要。

#### Scenario: 用户输入与 AI 回复绑定为同一记忆
- **GIVEN** 用户发送一轮消息并收到 AI 最终回复
- **WHEN** 系统写入自动 Project Memory
- **THEN** 该记忆 MUST 在同一 record 中保存完整 `userInput`
- **AND** MUST 在同一 record 中保存完整 `assistantResponse`
- **AND** MUST 关联 `workspaceId/threadId/turnId`

#### Scenario: 摘要字段不得替代正文真值
- **GIVEN** 系统生成 `title/summary/detail/cleanText`
- **WHEN** record 已包含 `userInput` 与 `assistantResponse`
- **THEN** `userInput` 与 `assistantResponse` MUST 作为 canonical truth
- **AND** `title/summary/detail/cleanText` MUST 仅作为 projection 或 compatibility fields
- **AND** projection fields MUST NOT 反向覆盖 canonical fields

#### Scenario: 自动 turn 记忆与手动 note 分型
- **GIVEN** 用户手动创建一条记忆
- **WHEN** 系统持久化该记录
- **THEN** 该记录 SHOULD 标记为 `recordKind=manual_note`
- **AND** MUST NOT 强制要求 `turnId/userInput/assistantResponse`
- **AND** 自动对话轮次记忆 SHOULD 标记为 `recordKind=conversation_turn`

### Requirement: Project Memory SHALL Be Engine-Agnostic
系统 MUST 将 Project Memory 作为通用对话记忆能力，而不是某个引擎的私有能力。

#### Scenario: Codex 与 Claude Code 共享完整主链路
- **GIVEN** 会话来源分别为 Codex 与 Claude Code
- **WHEN** 系统自动写入 conversation turn memory
- **THEN** 两者 MUST 使用同一 canonical record model
- **AND** 两者 MUST 保存完整 `userInput`
- **AND** 两者 MUST 保存完整 `assistantResponse`
- **AND** 两者 MUST 通过同一 facade/store 完成 upsert

#### Scenario: Gemini 复用同一契约
- **GIVEN** 会话来源为 Gemini
- **WHEN** Gemini adapter 能提供 turn payload
- **THEN** 系统 SHOULD 使用同一 canonical record model
- **AND** SHOULD 通过同一 facade/store 写入
- **AND** MUST NOT 引入 Gemini 专用 Project Memory API、文件格式或真值字段

#### Scenario: engine 字段只作为元信息
- **GIVEN** conversation turn memory 包含 `engine`
- **WHEN** 系统执行 create/update/list/get/search
- **THEN** `engine` MAY 用于展示、筛选或诊断
- **AND** MUST NOT 改变 canonical fields 的含义
- **AND** MUST NOT 影响全文是否被保存

### Requirement: Full Text SHALL Not Be Truncated by Digest Logic
系统 MUST 保证摘要器、清洗器与兼容投影不会截断 canonical 全文。

#### Scenario: 超长 AI 回复完整保存
- **GIVEN** AI 最终回复长度超过当前摘要器或 detail projection 的限制
- **WHEN** 系统执行 fusion 写入
- **THEN** canonical `assistantResponse` MUST 保存完整回复
- **AND** MUST NOT 使用 `OutputDigest.detail` 替代 canonical `assistantResponse`
- **AND** MUST NOT 使用固定长度 slice 截断 canonical `assistantResponse`

#### Scenario: 超长用户输入完整保存
- **GIVEN** 用户输入长度超过普通摘要或列表展示限制
- **WHEN** 系统执行 capture
- **THEN** canonical `userInput` MUST 保存完整可见输入
- **AND** MUST NOT 因列表展示、搜索索引或脱敏策略截断 canonical `userInput`

### Requirement: Turn Fusion SHALL Be Idempotent by Turn Key
系统 MUST 以 turn key 保证 capture/completed 乱序与重复事件下不会产生重复记忆。

#### Scenario: 同一 turn 重复 completed
- **GIVEN** 同一 `workspaceId/threadId/turnId` 的 assistant completed 事件被重复触发
- **WHEN** 系统执行 Project Memory fusion
- **THEN** 系统 MUST 更新或复用同一条记忆
- **AND** MUST NOT 创建多条重复 Project Memory

#### Scenario: capture 与 completed 乱序
- **GIVEN** capture 与 assistant completed 事件到达顺序不稳定
- **WHEN** 二者都能通过 `workspaceId/threadId/turnId` 对齐
- **THEN** 系统 MUST 合并为同一条 conversation turn memory
- **AND** MUST NOT 因事件乱序丢失 `userInput` 或 `assistantResponse`

### Requirement: Operation Trail SHALL Be Optional After Full Text Persistence
系统 MUST 将 operation trail 视为完整问答落库之后的可选增强，不得用它阻塞 canonical `userInput/assistantResponse` 写入。

#### Scenario: 无 operationTrail 时仍可写入完整记忆
- **GIVEN** 当前 turn 无法可靠恢复工具调用或操作记录
- **WHEN** 系统已经拿到 `userInput` 与 `assistantResponse`
- **THEN** 系统 MUST 写入完整 conversation turn memory
- **AND** MUST NOT 因 operation metadata 缺失而跳过本轮记忆

### Requirement: Release Candidate SHALL Pass Cross-Platform Governance Gates
系统 MUST 在发布候选前通过与仓库 CI 一致的跨平台治理门禁。

#### Scenario: Heavy test noise sentry remains green
- **GIVEN** Project Memory 变更新增或修改测试
- **WHEN** 变更进入发布候选
- **THEN** `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` MUST pass
- **AND** `npm run check:heavy-test-noise` MUST pass
- **AND** 新测试命名与输出 MUST NOT 破坏 Ubuntu/macOS/Windows workflow 语义

#### Scenario: Large file governance remains green
- **GIVEN** Project Memory 变更可能增加大字段样例、fixtures 或存储测试
- **WHEN** 变更进入发布候选
- **THEN** `node --test scripts/check-large-files.test.mjs` MUST pass
- **AND** `npm run check:large-files:near-threshold` MUST pass
- **AND** `npm run check:large-files:gate` MUST pass
- **AND** 测试资产 SHOULD 避免无必要的大文件 fixture
