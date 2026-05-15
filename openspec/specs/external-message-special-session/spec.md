# external-message-special-session Specification

## Purpose

Defines the external-message-special-session behavior contract, covering System SHALL Create Special Session From External Message.

## Requirements
### Requirement: System SHALL Create Special Session From External Message

系统 MUST 支持从外部入站消息创建特殊 session（External Session）。

#### Scenario: create special session from message
- **WHEN** 用户在入站消息列表选择一条消息并点击“创建特殊 session”
- **THEN** 系统 MUST 创建新的 external session 实体
- **AND** 该 session MUST 关联来源 `provider` 与 `external_message_id`

### Requirement: Special Session SHALL Support Reply Action

特殊 session MUST 支持向来源平台回发消息（首期飞书）。

#### Scenario: reply to feishu from special session
- **WHEN** 用户在特殊 session 输入回复并执行发送
- **THEN** 系统 MUST 调用对应 Provider 的回复接口
- **AND** 系统 MUST 在 session 内显示发送结果回执

### Requirement: Special Session SHALL Support Local Task Action With Guard

特殊 session MUST 支持触发本地任务，但必须具备执行守卫。

#### Scenario: local task requires explicit approval
- **WHEN** 用户请求执行本地任务
- **THEN** 系统 MUST 弹出确认步骤
- **AND** 在用户确认之前，系统 MUST NOT 执行任务

#### Scenario: approved local task executes with result
- **WHEN** 用户确认执行本地任务
- **THEN** 系统 MUST 执行目标任务并返回结果
- **AND** session MUST 展示任务执行状态（成功/失败/取消）

### Requirement: Special Session SHALL Preserve Traceability

系统 MUST 为特殊 session 保留可追踪链路。

#### Scenario: linkage is auditable
- **WHEN** 任一回复或任务动作完成
- **THEN** 系统 MUST 记录 `session_id`、`external_message_id`、动作类型、执行结果、时间戳
- **AND** 记录 MUST 支持后续查询与排障定位

### Requirement: Feature Flag SHALL Gate Phase 2 Capability

特殊 session 能力 MUST 受 feature flag 控制，以支持灰度发布与快速回滚。

#### Scenario: phase2 disabled
- **WHEN** `external_special_session_v1` 关闭
- **THEN** 系统 MUST 隐藏“创建特殊 session”入口
- **AND** 不得影响 Phase 1 的接入配置与消息展示能力

### Requirement: Special Session SHALL Support Automatic Engine Selection Handshake

特殊 session MUST 支持自动引擎选择握手流程。

#### Scenario: first inbound message creates auto session and asks engine choice
- **WHEN** 识别到该会话链路下的第一条入站消息
- **THEN** 系统 MUST 自动创建 special session
- **AND** 系统 MUST 自动回发“请选择 Codex 或 Claude Code”提示

#### Scenario: user selects engine from feishu chat
- **WHEN** 用户在飞书中回复 `codex/claude` 或 `1/2`
- **THEN** 系统 MUST 记录所选引擎并进入自动对话状态
- **AND** 系统 MUST 回发已切换确认消息

### Requirement: Special Session SHALL Route Follow-up Messages to Selected Engine Automatically

已完成引擎选择的特殊 session MUST 将后续消息自动路由到已选引擎，并将引擎回复自动回发到对应飞书会话。

#### Scenario: follow-up message gets automatic AI response
- **WHEN** 用户已完成引擎选择并继续发送消息
- **THEN** 系统 MUST 自动调用所选引擎生成回复
- **AND** 系统 MUST 将回复自动回发至飞书会话

