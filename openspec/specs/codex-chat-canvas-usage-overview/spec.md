# codex-chat-canvas-usage-overview Specification

## Purpose

Defines the codex-chat-canvas-usage-overview behavior contract, covering Codex-Only Usage Entry in Config Menu.

## Requirements
### Requirement: Codex-Only Usage Entry in Config Menu

系统 MUST 在 ChatInputBox 配置菜单中提供“实时用量”入口，并且仅在 Codex 引擎下可见；同时，Codex 专属能力入口区域 MUST 与 `Speed`、`Review` 快捷动作保持同域展示与同级可见性约束。

#### Scenario: usage entry appears for codex engine

- **GIVEN** 当前会话引擎为 `codex`
- **WHEN** 用户打开输入区配置菜单
- **THEN** 菜单 MUST 显示“实时用量”入口

#### Scenario: usage entry is hidden for non-codex engine

- **GIVEN** 当前会话引擎为 `claude` / `opencode` / `gemini`
- **WHEN** 用户打开输入区配置菜单
- **THEN** 菜单 MUST NOT 显示“实时用量”入口

#### Scenario: codex capability entries are shown as one region

- **GIVEN** 当前会话引擎为 `codex`
- **WHEN** 用户打开输入区配置菜单
- **THEN** 菜单 MUST 在同一 Codex 能力区域显示“实时用量”、“Speed”、“Review”入口

#### Scenario: codex capability entries remain hidden for non-codex

- **GIVEN** 当前会话引擎为 `claude` / `opencode` / `gemini`
- **WHEN** 用户打开输入区配置菜单
- **THEN** 菜单 MUST NOT 显示“实时用量”、“Speed”、“Review”三个 Codex 专属入口

#### Scenario: non-codex usage behavior is not regressed

- **GIVEN** 当前会话引擎为 `claude` / `opencode` / `gemini`
- **WHEN** 用户进行发送、停止、切换模型等既有输入区操作
- **THEN** 系统 MUST 保持与改动前一致的交互与可用性
- **AND** 本次 Codex 专属能力接入 MUST NOT 引入额外副作用

### Requirement: Usage Panel Uses Shared Rate-Limit Snapshot

实时用量面板 MUST 使用与 `/status` 同源的 rate-limit 快照数据。

#### Scenario: panel renders 5h and weekly limits from shared snapshot

- **WHEN** 用户展开“实时用量”面板
- **THEN** 面板 MUST 渲染 `5h limit` 百分比
- **AND** 当 weekly 数据存在时 MUST 渲染 `Weekly limit`
- **AND** 重置时间 MUST 来自同一 snapshot 字段

#### Scenario: remaining/used display respects global setting

- **GIVEN** `usageShowRemaining` 设置切换
- **WHEN** 面板计算百分比文案
- **THEN** MUST 按设置显示“剩余”或“已使用”

### Requirement: Usage Refresh Interaction

面板 MUST 支持主动刷新，并显示刷新中状态。

#### Scenario: refresh action requests latest rate-limits

- **WHEN** 用户点击刷新动作
- **THEN** 系统 MUST 调用统一的 `onRefreshAccountRateLimits` 回调
- **AND** 刷新期间 MUST 呈现 loading 状态

#### Scenario: refresh failure keeps UI recoverable

- **WHEN** 刷新请求失败
- **THEN** 面板 MUST 保持可继续操作
- **AND** 不得导致输入区菜单崩溃或卡死

### Requirement: Codex-Only Default/Plan Toggle in Composer Region

系统 MUST 在 Codex 输入区提供 `default/plan` 模式切换，并与当前 collaboration mode 保持一致。

#### Scenario: toggle is shown only for codex engine

- **GIVEN** 当前会话引擎为 `codex`
- **WHEN** 渲染输入区底部控制区域
- **THEN** MUST 显示“计划模式”开关

#### Scenario: toggle is hidden for non-codex engine

- **GIVEN** 当前会话引擎为 `claude` / `opencode` / `gemini`
- **WHEN** 渲染输入区底部控制区域
- **THEN** MUST NOT 显示“计划模式”开关

#### Scenario: toggle updates collaboration mode

- **WHEN** 用户将开关切到 `on`
- **THEN** 系统 MUST 调用 `onSelectCollaborationMode('plan')`
- **AND** 模式徽标 MUST 展示 `计划`

- **WHEN** 用户将开关切到 `off`
- **THEN** 系统 MUST 调用默认模式（`default` 映射 collaboration `code`）
- **AND** 模式徽标 MUST 展示 `默认`

