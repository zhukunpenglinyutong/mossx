## ADDED Requirements

### Requirement: 记忆健康状态

系统 SHALL 为 Project Memory 记录提供可见的健康状态，用于判断自动记忆是否完整可信。

#### Scenario: 完整记忆

- **GIVEN** 一条 conversation turn 记忆同时包含非空 `userInput` 和非空 `assistantResponse`
- **WHEN** 系统计算健康状态
- **THEN** 该记忆 SHALL 标记为 `complete`

#### Scenario: 仅用户输入

- **GIVEN** 一条 conversation turn 记忆包含 `userInput`
- **AND** 不包含 `assistantResponse`
- **WHEN** 系统计算健康状态
- **THEN** 该记忆 SHALL 标记为 `input_only` 或 `pending_fusion`

#### Scenario: 仅 AI 回复

- **GIVEN** 一条 conversation turn 记忆包含 `assistantResponse`
- **AND** 不包含 `userInput`
- **WHEN** 系统计算健康状态
- **THEN** 该记忆 SHALL 标记为 `assistant_only`

#### Scenario: 捕获失败

- **GIVEN** 一条记忆在 reconcile 后仍无法补齐必要字段
- **WHEN** 系统显示健康状态
- **THEN** 该记忆 SHALL 标记为 `capture_failed`

### Requirement: Review Inbox

系统 SHALL 提供 Review Inbox，用于集中处理未整理的自动记忆。

#### Scenario: 自动记忆进入待整理

- **WHEN** 系统创建新的 conversation turn memory
- **THEN** 该记忆 SHALL 默认可出现在 Review Inbox
- **AND** 其 review state SHALL 视为 `unreviewed`，除非已有显式状态

#### Scenario: 保留记忆

- **GIVEN** 用户在 Review Inbox 中查看一条未整理记忆
- **WHEN** 用户点击保留
- **THEN** 系统 SHALL 将该记忆 review state 更新为 `kept`
- **AND** 该记忆 SHALL 不再出现在默认待整理列表中

#### Scenario: 转为手动 note

- **GIVEN** 用户在 Review Inbox 中查看一条 conversation turn memory
- **WHEN** 用户选择转为手动 note
- **THEN** 系统 SHALL 创建或更新一条 manual note 形式的稳定记忆
- **AND** 原始 conversation turn SHALL 保留审计事实或标记为 converted

#### Scenario: 标记过期

- **GIVEN** 用户发现一条记忆已经不再适用
- **WHEN** 用户点击标记过期
- **THEN** 系统 SHALL 将 review state 更新为 `obsolete`
- **AND** 默认注入和 Scout 检索 SHALL 排除 obsolete 记忆，除非用户显式筛选

#### Scenario: 删除或忽略

- **GIVEN** 用户在 Review Inbox 中选择删除或忽略一条记忆
- **WHEN** 操作确认完成
- **THEN** 系统 SHALL 从待整理视图移除该记忆

### Requirement: 健康和 Review 筛选

系统 SHALL 支持按健康状态和 Review 状态筛选 Project Memory。

#### Scenario: 查看异常记忆

- **WHEN** 用户选择异常或不完整筛选
- **THEN** 列表 SHALL 仅显示 `input_only`、`assistant_only`、`pending_fusion` 或 `capture_failed` 记忆

#### Scenario: 查看待整理记忆

- **WHEN** 用户选择 Review Inbox 或待整理筛选
- **THEN** 列表 SHALL 仅显示 review state 为 `unreviewed` 的记忆

#### Scenario: 查看过期记忆

- **WHEN** 用户选择过期筛选
- **THEN** 列表 SHALL 显示 review state 为 `obsolete` 的记忆
- **AND** 过期记忆 SHALL 与普通可用记忆有视觉区分

### Requirement: Reconcile 和 Diagnostics

系统 SHALL 提供 Project Memory 诊断与修复入口，用于发现半截记忆、重复 turn key 和坏文件。

#### Scenario: 诊断统计

- **WHEN** 用户打开 Project Memory 诊断入口
- **THEN** 系统 SHALL 显示当前 workspace 的记忆总数
- **AND** SHALL 显示按 health state 分组的数量
- **AND** SHALL 显示重复 `workspaceId/threadId/turnId` 组数量

#### Scenario: Dry run 修复

- **WHEN** 用户运行 reconcile dry run
- **THEN** 系统 SHALL 返回将要修复或跳过的项目数量
- **AND** SHALL NOT 修改任何 Project Memory 文件

#### Scenario: Apply 修复

- **GIVEN** dry run 显示存在可修复的半截记忆
- **WHEN** 用户确认 apply reconcile
- **THEN** 系统 SHALL 只修改可确定修复的记录
- **AND** SHALL 跳过无法安全合并的冲突记录
- **AND** SHALL 返回修复摘要

### Requirement: Diagnostics 工程边界

系统 SHALL 将 diagnostics/reconcile 限定在 Project Memory 存储范围内，并保持跨平台、低噪音和可回滚。

#### Scenario: 诊断不扫描项目源码

- **WHEN** 用户运行 Project Memory diagnostics
- **THEN** 系统 SHALL 只读取 Project Memory 存储文件和相关 metadata
- **AND** SHALL NOT 扫描 workspace 源码、Git 历史或 OpenSpec 文档

#### Scenario: 路径显示平台无关

- **WHEN** diagnostics 返回坏 JSON shard 或存储文件信息
- **THEN** 系统 SHALL 使用平台无关路径处理方式
- **AND** UI SHALL 显示可读文件名或相对标识
- **AND** SHALL NOT 依赖硬编码 `/` 或 `\` 分隔符

#### Scenario: 修复摘要不输出完整正文

- **WHEN** reconcile 返回 dry run 或 apply 摘要
- **THEN** 摘要 SHALL 包含数量、状态和 record id
- **AND** SHALL NOT 输出完整用户输入或完整 AI 回复
