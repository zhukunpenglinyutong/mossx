# feishu-message-connector Specification

## Purpose

Defines the feishu-message-connector behavior contract, covering Feishu Connector SHALL Support App Credential Based Setup.

## Requirements
### Requirement: Feishu Connector SHALL Support App Credential Based Setup

飞书连接器 MUST 支持通过 `App ID` 与 `App Secret` 完成接入配置。

#### Scenario: required fields validation
- **WHEN** 用户未填写 `App ID` 或 `App Secret` 就尝试保存
- **THEN** 系统 MUST 阻止保存
- **AND** 系统 MUST 提示缺失字段

#### Scenario: credentials can be updated
- **WHEN** 用户更新并提交新的 `App Secret`
- **THEN** 系统 MUST 覆盖旧配置并立即生效于下一次连接

### Requirement: Feishu Connector SHALL Support Long Connection Lifecycle

飞书连接器 MUST 支持长连接模式的启动、停止和状态上报。

#### Scenario: start connection successfully
- **WHEN** 用户启动飞书连接且配置有效
- **THEN** 系统 MUST 建立连接并进入 `在线` 状态
- **AND** 系统 MUST 上报连接成功事件

#### Scenario: fail to connect with invalid credentials
- **WHEN** 用户凭据错误并启动连接
- **THEN** 系统 MUST 进入 `失败` 状态
- **AND** 系统 MUST 返回认证失败原因

### Requirement: Feishu Connector SHALL Normalize Receive Message Events

飞书连接器 MUST 将 `im.message.receive_v1` 事件映射为统一外部消息模型。

#### Scenario: normalize p2p text message
- **WHEN** 收到飞书 `im.message.receive_v1` 文本消息
- **THEN** 系统 MUST 输出统一 `ExternalMessage` 结构
- **AND** `external_message_id` MUST 映射为飞书 `message_id`

#### Scenario: unsupported message type is flagged
- **WHEN** 收到当前不支持的消息类型
- **THEN** 系统 MUST 标记该消息为 `unsupported`
- **AND** 客户端 MUST 显示可读提示而非崩溃

### Requirement: Feishu Secrets SHALL Not Leak Through Logs

系统 MUST 防止飞书密钥在普通日志和界面中泄露。

#### Scenario: runtime logs do not print app secret
- **WHEN** 系统记录连接日志或错误日志
- **THEN** 日志 MUST NOT 包含明文 `App Secret`
- **AND** 异常信息中的敏感字段 MUST 被脱敏

### Requirement: Feishu Connector SHALL Reply Automatically via Engine Bridge

飞书连接器 MUST 支持基于引擎桥接的自动回发能力。

#### Scenario: auto reply uses selected engine output
- **WHEN** 会话已选择引擎且收到用户消息
- **THEN** 系统 MUST 将消息传递给所选引擎
- **AND** 系统 MUST 将引擎文本结果回发到飞书

#### Scenario: engine or reply failure is observable
- **WHEN** 引擎调用失败或飞书回发失败
- **THEN** 系统 MUST 记录失败审计与失败指标
- **AND** 用户 MUST 收到可读失败反馈（非静默失败）

