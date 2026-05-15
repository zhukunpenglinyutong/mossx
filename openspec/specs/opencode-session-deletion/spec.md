# opencode-session-deletion Specification

## Purpose

Defines the opencode-session-deletion behavior contract, covering OpenCode 会话必须支持后端 hard delete.

## Requirements

### Requirement: OpenCode 会话必须支持后端 hard delete

系统 MUST 为 OpenCode 会话提供后端删除能力。删除操作 MUST 清除磁盘上对应的会话存储文件/目录。

#### Scenario: successful deletion via CLI

- **GIVEN** 用户请求删除一个 OpenCode 会话
- **AND** OpenCode CLI 支持 `session delete` 子命令
- **WHEN** 后端执行 `opencode session delete <session_id>`
- **THEN** CLI MUST 返回成功退出码
- **AND** 系统 MUST 返回 `{ "deleted": true, "method": "cli" }`
- **AND** 前端 MUST 从列表移除该会话

#### Scenario: successful deletion via filesystem fallback

- **GIVEN** 用户请求删除一个 OpenCode 会话
- **AND** OpenCode CLI 不支持 `session delete` 子命令（返回非零退出码）
- **WHEN** 后端回退到文件系统删除策略
- **AND** 成功定位并删除会话存储文件/目录
- **THEN** 系统 MUST 返回 `{ "deleted": true, "method": "filesystem" }`
- **AND** 前端 MUST 从列表移除该会话

#### Scenario: deletion of non-existent session

- **GIVEN** 用户请求删除一个不存在的 OpenCode 会话
- **WHEN** 后端尝试执行删除
- **THEN** 系统 MUST 返回错误，错误码包含 `SESSION_NOT_FOUND`
- **AND** 前端 MUST 保留该会话在列表中
- **AND** UI MUST 显示失败提示

#### Scenario: deletion fails due to IO error

- **GIVEN** 用户请求删除一个 OpenCode 会话
- **AND** CLI 删除与文件系统删除均因权限/IO 问题失败
- **WHEN** 后端返回错误
- **THEN** 系统 MUST 返回错误，错误码包含 `IO_ERROR`
- **AND** 前端 MUST 保留该会话在列表中

#### Scenario: workspace is not connected

- **GIVEN** 用户请求删除一个 OpenCode 会话
- **AND** `workspace_id` 在后端工作区注册表中不存在
- **WHEN** 后端执行删除
- **THEN** 系统 MUST 返回错误，错误码包含 `WORKSPACE_NOT_CONNECTED`
- **AND** 前端 MUST 保留该会话在列表中
- **AND** UI MUST 显示工作区未连接提示

### Requirement: 删除成功响应必须标识删除路径

系统在删除成功时 MUST 返回 `method` 字段，且值必须为 `"cli"` 或 `"filesystem"`。

#### Scenario: success response contains deletion method

- **GIVEN** 一个 OpenCode 会话删除请求执行成功
- **WHEN** 后端返回成功结果
- **THEN** 返回体 MUST 包含 `deleted: true`
- **AND** 返回体 MUST 包含 `method` 字段
- **AND** `method` MUST 属于 `"cli"` 或 `"filesystem"`

### Requirement: 删除操作必须持久化

系统 MUST 确保删除后的会话在应用重启后不再出现。

#### Scenario: restart after successful deletion

- **GIVEN** 一个 OpenCode 会话已被成功删除
- **WHEN** 用户重启应用
- **THEN** 该会话 MUST NOT 出现在任何会话列表中

### Requirement: 删除前端路由必须消除 ENGINE_UNSUPPORTED

前端 `deleteThreadForWorkspace` 中的 OpenCode 分支 MUST NOT 再抛出 ENGINE_UNSUPPORTED 错误，MUST 改为调用后端删除命令。

#### Scenario: opencode thread deletion invokes backend

- **GIVEN** 用户在 sidebar 或 Workspace Home 点击删除一个 `opencode:` 前缀的会话
- **WHEN** `deleteThreadForWorkspace` 被调用
- **THEN** 系统 MUST 调用 `opencode_delete_session` Tauri Command
- **AND** MUST NOT 抛出 ENGINE_UNSUPPORTED 错误

