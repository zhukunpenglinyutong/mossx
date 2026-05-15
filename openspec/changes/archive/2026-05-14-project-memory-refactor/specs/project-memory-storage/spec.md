# project-memory-storage Specification Delta

## MODIFIED Requirements

### Requirement: 文件格式与结构
系统 MUST 支持 schema v2 conversation turn 记录，并兼容读取旧 Project Memory 记录。

#### Scenario: v2 conversation turn 字段完整
- **GIVEN** 系统写入一条自动对话轮次记忆
- **WHEN** 记录被序列化到 JSON
- **THEN** 记录 MUST 包含 `schemaVersion`
- **AND** MUST 包含 `recordKind=conversation_turn`
- **AND** MUST 包含 `workspaceId/threadId/turnId`
- **AND** MUST 包含完整 `userInput`
- **AND** MUST 包含完整 `assistantResponse`

#### Scenario: projection 字段由 canonical fields 派生
- **GIVEN** v2 record 已包含 `userInput` 与 `assistantResponse`
- **WHEN** 系统生成 `title/summary/detail/cleanText/fingerprint`
- **THEN** 这些字段 MUST 由 canonical fields 派生
- **AND** MUST NOT 成为 canonical fields 的唯一来源

#### Scenario: legacy 记录继续可读
- **GIVEN** 存储中存在旧版 `summary/detail/rawText/cleanText/deletedAt` 记录
- **WHEN** 系统读取 Project Memory 列表或详情
- **THEN** 系统 MUST 保持兼容读取
- **AND** MUST NOT 批量迁移或重写旧记录

### Requirement: Workspace 隔离存储
系统 MUST 继续按 workspace 隔离保存 Project Memory，并支持按 turn key 查找同一轮记录。

#### Scenario: 按 turn key upsert
- **GIVEN** 已存在 `workspaceId/threadId/turnId` 相同的 conversation turn memory
- **WHEN** 系统再次写入该 turn 的 fusion 结果
- **THEN** 系统 MUST 更新原记录
- **AND** MUST NOT 创建重复记录

#### Scenario: workspace 隔离不变
- **GIVEN** 两个 workspace 中存在相同 threadId 或 turnId
- **WHEN** 系统执行 upsert 或读取
- **THEN** `workspaceId` MUST 参与隔离
- **AND** MUST NOT 跨 workspace 合并或泄露记忆

#### Scenario: 引擎来源不改变 workspace 隔离
- **GIVEN** Claude Code、Codex 或 Gemini 在同一 workspace 写入 Project Memory
- **WHEN** 系统执行 list/get/upsert/delete
- **THEN** 隔离边界 MUST 仍由 `workspaceId` 与 record key 决定
- **AND** `engine` MUST NOT 创建独立存储根或绕过 workspace 隔离

### Requirement: 原文存储策略
系统 MUST 对 `userInput` 与 `assistantResponse` 执行原文直存。

#### Scenario: 用户输入不截断
- **GIVEN** 用户输入为长文本
- **WHEN** 系统持久化 conversation turn memory
- **THEN** `userInput` MUST 保存完整文本
- **AND** MUST NOT 因 summary、detail、cleanText 长度限制截断

#### Scenario: AI 回复不截断
- **GIVEN** AI 回复为长文本
- **WHEN** 系统持久化 conversation turn memory
- **THEN** `assistantResponse` MUST 保存完整文本
- **AND** MUST NOT 因摘要器或列表 projection 截断

### Requirement: Store Hardening SHALL Follow Full Text Persistence
系统 MUST 优先保证全文落库稳定，并将原子写入、blocking worker、日期分片等存储增强作为后续 hardening 执行。

#### Scenario: 原子写入
- **WHEN** 系统覆盖日期 JSON 文件
- **THEN** SHOULD 使用临时文件写入后 rename 的方式降低损坏风险

#### Scenario: 大字段 I/O 后台化
- **WHEN** 系统执行大体量 list/get/search/write
- **THEN** SHOULD 将阻塞型文件 I/O 移入 Rust blocking worker

#### Scenario: 大文件分片后置
- **GIVEN** 单日 JSON 文件体积持续增长
- **WHEN** 文件达到实现定义的阈值
- **THEN** 系统 MAY 滚动写入同日分片
- **AND** 分片策略不得阻塞 P0 完整问答落库

### Requirement: Storage Implementation SHALL Be Cross-Platform
系统 MUST 使用兼容 macOS/Windows/Linux 的文件路径、临时文件和测试写法。

#### Scenario: 路径构造不依赖 POSIX 分隔符
- **GIVEN** 系统计算 workspace memory 文件路径
- **WHEN** 代码在 Windows 或 macOS 上运行
- **THEN** 路径 MUST 通过平台路径 API 构造
- **AND** MUST NOT 依赖硬编码 `/`、`/tmp` 或大小写敏感文件系统假设

#### Scenario: 临时写入与 rename 跨平台
- **GIVEN** 系统执行 JSON 原子写入
- **WHEN** 目标平台为 Windows 或 macOS
- **THEN** 临时文件 SHOULD 创建在目标文件同目录
- **AND** rename/replace 流程 MUST 明确处理目标已存在、权限失败和部分写入失败
