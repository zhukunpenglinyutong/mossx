## MODIFIED Requirements

### Requirement: 删除成功必须以后端确认为准

系统 MUST 在删除结果已经可证明结算时才将会话从前端列表移除；对于目标已经不存在的缺失类错误，系统 MUST 将其视为 idempotent settled delete，而不是用户可见失败。

#### Scenario: hard delete success

- **GIVEN** 用户请求删除某条会话
- **WHEN** 后端返回删除成功
- **THEN** 前端 MUST 移除该会话
- **AND** 删除结果 MUST 标记为 `success=true`

#### Scenario: missing target settles as idempotent delete

- **GIVEN** 客户端仍显示一条 stale 会话
- **WHEN** 删除链路返回 `SESSION_NOT_FOUND`、`session file not found`、`thread not found` 或等价缺失证据
- **THEN** 系统 MUST 将该会话视为已删除完成
- **AND** 客户端 MUST 直接移除对应会话
- **AND** 用户 MUST NOT 再收到阻塞删除的失败提示

#### Scenario: hard delete failed

- **GIVEN** 用户请求删除某条会话
- **WHEN** 后端返回非缺失类错误（如 workspace 未连接、IO 失败、权限失败、歧义候选）
- **THEN** 前端 MUST 保留该会话
- **AND** 删除结果 MUST 返回错误码与错误信息

### Requirement: 删除失败必须可观测

系统 MUST 对真实删除失败提供可见反馈，并携带可分类错误码；已缺失目标不得被再次呈现为删除失败。

#### Scenario: delete failed with categorized reason

- **GIVEN** 会话删除失败
- **WHEN** UI 处理删除回执
- **THEN** 系统 MUST 显示失败摘要
- **AND** MUST 使用标准错误码集合（`WORKSPACE_NOT_CONNECTED`、`SESSION_NOT_FOUND`、`PERMISSION_DENIED`、`IO_ERROR`、`ENGINE_UNSUPPORTED`、`UNKNOWN`）

#### Scenario: settled missing target does not surface failure UI

- **GIVEN** 删除链路发现目标会话已经不存在
- **WHEN** 系统完成缺失目标结算
- **THEN** 系统 MUST NOT 将该结果计入失败摘要
- **AND** MUST NOT 弹出要求用户处理的删除失败提示

### Requirement: 引擎差异必须收敛到统一删除语义

系统 MUST 对 Claude、Codex、OpenCode 提供统一“删除成功/缺失即结算/真实失败”语义，差异仅存在于后端执行细节。

#### Scenario: claude deletion path

- **GIVEN** 目标会话是 Claude 会话
- **WHEN** 删除请求被执行
- **THEN** 系统 MUST 执行 Claude session 文件硬删除
- **AND** 删除失败 MUST 回传错误，不得吞错

#### Scenario: codex-opencode deletion path

- **GIVEN** 目标会话是 Codex 或 OpenCode 会话
- **WHEN** 删除请求被执行
- **THEN** 系统 MUST 执行线程归档/删除 RPC
- **AND** 仅在删除已成功或目标已明确不存在后才从列表移除

#### Scenario: missing-target semantics remain engine-consistent

- **GIVEN** 目标会话属于 Claude、Codex 或 OpenCode 中任一引擎
- **WHEN** 删除链路确认该目标已经不存在
- **THEN** 系统 MUST 对三种引擎都收敛到同一 settled delete 语义
- **AND** 用户 MUST 不需要根据引擎理解不同的删除失败文案
