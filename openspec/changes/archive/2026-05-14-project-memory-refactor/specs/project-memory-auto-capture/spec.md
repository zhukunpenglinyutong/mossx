# project-memory-auto-capture Specification Delta

## MODIFIED Requirements

### Requirement: 输入采集确权 (A - Input Capture)
系统 MUST 保持现有发送侧自动采集入口，并将完整用户可见输入保存为 canonical `userInput`。

#### Scenario: 发送侧传递完整 visible user text
- **GIVEN** 用户在 composer 中发送消息
- **WHEN** `useThreadMessaging` 调用 Project Memory capture
- **THEN** capture payload MUST 包含完整 `visibleUserText`
- **AND** MUST 包含 `workspaceId/threadId/turnId`
- **AND** `visibleUserText` MUST 成为 canonical `userInput`

#### Scenario: capture 阶段不得用 normalize 结果覆盖原文
- **GIVEN** 后端需要执行噪声过滤、指纹计算或脱敏检测
- **WHEN** 系统处理 capture payload
- **THEN** 系统 MAY 使用规范化文本生成 `cleanText/fingerprint`
- **AND** MUST 保存原始 `visibleUserText` 到 `userInput`
- **AND** MUST NOT 用脱敏文本替换 canonical `userInput`

#### Scenario: 采集失败不阻塞发送
- **GIVEN** `project_memory_capture_auto` 或等价 capture 调用失败
- **WHEN** 用户消息已进入发送流程
- **THEN** 系统 MUST 继续发送消息
- **AND** MUST NOT 因 Project Memory 写入失败阻塞对话主链路

#### Scenario: capture 是通用能力而非单引擎能力
- **GIVEN** 当前会话来源为 Claude Code、Codex 或 Gemini
- **WHEN** 引擎 adapter 触发 Project Memory capture
- **THEN** 系统 MUST 使用同一 canonical capture contract
- **AND** Claude Code 与 Codex MUST 覆盖完整 capture 主链路
- **AND** Gemini SHOULD 复用同一 contract，至少不得写入独立 Project Memory store

### Requirement: 融合写入 (C - Fusion Write)
系统 MUST 在 assistant completed 后写入完整 AI 可见回复，而不是写入摘要片段。

#### Scenario: assistant completed 写入完整 response
- **GIVEN** assistant completed payload 包含最终可见文本
- **WHEN** 系统执行 Project Memory fusion
- **THEN** payload text MUST 完整保存到 canonical `assistantResponse`
- **AND** MUST NOT 使用摘要器输出替代该字段

#### Scenario: Codex 同一 turn 的多段 assistant completed 聚合
- **GIVEN** Codex 在同一 `workspaceId/threadId/turnId` 内先产生启动协议、只读扫描或阶段性说明
- **AND** 后续又产生最终可见答复
- **WHEN** 每段 assistant completed 事件进入 Project Memory fusion
- **THEN** 系统 MUST 以同一 `turnId` 更新同一条 conversation turn memory
- **AND** canonical `assistantResponse` MUST 包含该 turn 的完整可见 assistant 正文
- **AND** MUST NOT 因第一段 completed 已写入而丢弃后续最终答复

#### Scenario: 摘要器只生成 projection
- **GIVEN** 系统调用 `buildAssistantOutputDigest`
- **WHEN** 生成 `title/summary/detail`
- **THEN** 这些字段 MUST 仅用于 projection 或 compatibility
- **AND** MUST NOT 决定 `assistantResponse` 的持久化长度或内容

#### Scenario: update-first/create-fallback 保持 turn 幂等
- **GIVEN** capture 阶段已创建 provisional 记录
- **WHEN** assistant completed 后执行 fusion
- **THEN** 系统 SHOULD 优先更新该记录
- **AND** 若更新失败 MAY create fallback
- **AND** fallback MUST 仍以 `workspaceId/threadId/turnId` 保证幂等

#### Scenario: fusion 不按引擎分叉存储
- **GIVEN** Claude Code、Codex 或 Gemini 的 assistant completed 事件被归一化
- **WHEN** 系统执行 Project Memory fusion
- **THEN** fusion MUST 调用同一 Project Memory facade/store
- **AND** `engine` MUST 只作为 metadata 保存
- **AND** MUST NOT 按引擎创建不同的记忆文件格式、CRUD 命令或 canonical 字段集合

### Requirement: 事件驱动架构
系统 MUST 继续通过现有事件链路触发 fusion，但事件 payload 必须足以恢复 turn key。

#### Scenario: completed 事件携带可融合上下文
- **GIVEN** assistant 消息完成事件到达 `useThreads`
- **WHEN** 系统触发 Project Memory fusion
- **THEN** fusion MUST 能解析 `workspaceId/threadId/turnId` 或通过 pending capture 恢复 `turnId`
- **AND** MUST 保存 assistant 最终可见文本全文

#### Scenario: 引擎事件归一化
- **GIVEN** 不同引擎的原始 completed payload 字段名或生命周期不同
- **WHEN** payload 进入 Project Memory 前
- **THEN** adapter MUST 归一化为 `workspaceId/threadId/turnId/engine/assistantResponse`
- **AND** MUST 显式处理缺失 turn key 的降级路径
- **AND** MUST NOT 让降级路径生成重复或不可回溯的记忆
