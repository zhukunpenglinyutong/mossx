# third-party-message-ingestion Specification

## Purpose

Defines the third-party-message-ingestion behavior contract, covering Client SHALL Provide Third-Party Message Integration Module.

## Requirements
### Requirement: Client SHALL Provide Third-Party Message Integration Module

系统 MUST 提供独立的“第三方消息接入”模块，用于管理外部消息平台接入与运行状态。

#### Scenario: module entry is visible
- **WHEN** 用户进入设置或集成中心
- **THEN** 系统 MUST 显示“第三方消息接入”入口
- **AND** 用户 MUST 可以进入模块页面

#### Scenario: provider state is visible
- **WHEN** 用户打开模块页面
- **THEN** 系统 MUST 展示每个 Provider 的当前状态
- **AND** 状态 MUST 至少包含：未配置、已配置、连接中、在线、失败

### Requirement: System SHALL Persist Provider Configuration Securely

系统 MUST 持久化 Provider 配置并对密钥类字段进行保护。

#### Scenario: save feishu credentials securely
- **WHEN** 用户提交 Feishu `App ID` 与 `App Secret`
- **THEN** 系统 MUST 成功保存配置
- **AND** `App Secret` MUST 以加密或等效保护方式存储

#### Scenario: sensitive fields are masked in UI
- **WHEN** 用户再次打开配置页面
- **THEN** 系统 MUST 不明文回显完整 `App Secret`
- **AND** 用户 MUST 可以执行“更新密钥”操作

### Requirement: Module SHALL Support Connectivity Test

系统 MUST 提供连通性测试能力，并返回可读诊断结果。

#### Scenario: connectivity test success
- **WHEN** 用户点击“连通性测试”且 Provider 可正常连接
- **THEN** 系统 MUST 显示测试成功
- **AND** 系统 MUST 展示最近连接时间或最近心跳时间

#### Scenario: connectivity test failure
- **WHEN** 用户点击“连通性测试”且连接失败
- **THEN** 系统 MUST 显示失败结果
- **AND** 系统 MUST 提供可读的失败原因和建议动作

### Requirement: Inbound Message Inbox SHALL Be Observable

系统 MUST 在客户端展示已接入的外部消息，并支持去重。

#### Scenario: inbound message appears in inbox
- **WHEN** 系统接收到标准化外部消息
- **THEN** 客户端 MUST 在消息列表显示该记录
- **AND** 列表项 MUST 包含来源平台、会话ID、发送者、消息类型、接收时间

#### Scenario: duplicate messages are deduplicated
- **WHEN** 系统接收到相同 `external_message_id` 的重复事件
- **THEN** 系统 MUST 仅保留一条有效记录
- **AND** 客户端 MUST NOT 展示重复消息项

### Requirement: Inbound Message Flow SHALL Support Auto Processing

系统 MUST 支持对飞书入站消息执行自动处理流，而无需用户在 CodeMoss 页面点击“发送回复”。

#### Scenario: new inbound message triggers auto flow
- **WHEN** 系统接收到一条新的（去重后）飞书入站消息
- **THEN** 系统 MUST 自动触发外部会话处理流程
- **AND** 系统 MUST 记录自动处理的审计信息与指标

#### Scenario: duplicated inbound message does not trigger repeated auto reply
- **WHEN** 系统接收到已处理过的重复消息
- **THEN** 系统 MUST NOT 重复执行自动回复
- **AND** 系统 MUST 保持幂等结果

