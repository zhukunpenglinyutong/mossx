# computer-use-availability-surface Specification

## Purpose

定义客户端中 Computer Use 状态面板或等价入口的可见行为，确保用户看到的是平台真值、blocked reason 与可操作 guidance，而不是模糊占位信息。
## Requirements
### Requirement: Availability Surface MUST Expose Computer Use State Truthfully

系统 MUST 在客户端中提供 Computer Use 状态面板或等价入口，并准确展示桥接真值。

#### Scenario: surface shows core detection state
- **WHEN** 用户打开 Computer Use 设置区或等价状态入口
- **THEN** 系统 MUST 展示当前 platform、Codex App 检测结果、plugin 检测结果与 plugin enabled 状态
- **AND** MUST 展示统一 availability status

#### Scenario: surface refresh converges to backend truth
- **WHEN** 用户主动刷新状态，或重新打开 Computer Use surface
- **THEN** UI MUST 以最新后端 discovery 结果为准
- **AND** MUST NOT 保留与后端真值冲突的旧状态

### Requirement: Availability Surface MUST Explain Blocked or Unavailable States

当 Computer Use 不可用时，系统 MUST 提供可理解的 blocked reason 与 guidance，而不是只显示空白或灰色占位。

#### Scenario: blocked state includes actionable guidance
- **WHEN** availability status 为 `blocked`
- **THEN** surface MUST 展示至少一个 blocked reason
- **AND** MUST 提供对应 guidance，例如需要启用 plugin、切回官方 Codex App 或补齐权限

#### Scenario: unavailable state remains explicit
- **WHEN** availability status 为 `unavailable`
- **THEN** surface MUST 明确说明未检测到官方安装或官方 plugin
- **AND** MUST NOT 暗示当前客户端已经具备完整 Computer Use runtime

#### Scenario: surface maps deterministic blocked reasons to consistent copy
- **WHEN** 后端返回已知 blocked reason，例如 `plugin_disabled`、`helper_missing`、`helper_bridge_unverified`、`permission_required` 或 `approval_required`
- **THEN** surface MUST 使用稳定且一致的文案表达该阻塞
- **AND** MUST NOT 由前端自由推断另一种状态语义

#### Scenario: surface never shows ready for unverified prerequisites
- **WHEN** 后端结果仍包含已知未确认前置条件，例如 `helper_bridge_unverified`、`permission_required`、`approval_required` 或 `unknown_prerequisite`
- **THEN** surface MUST 不显示 `ready`
- **AND** MUST 清晰表达当前仍处于 `blocked`

### Requirement: Availability Surface MUST Represent Windows as Unsupported

系统 MUST 在 `Windows` 上明确呈现 unsupported，而不是显示为“未准备好”或“正在开发中”。

#### Scenario: windows surface shows unsupported platform state
- **WHEN** 用户在 `Windows` 上进入 Computer Use surface
- **THEN** UI MUST 展示 `unsupported`
- **AND** 文案 MUST 明确说明当前版本不支持 Windows Computer Use bridge

#### Scenario: windows surface does not present activation affordance
- **WHEN** availability status 为 `unsupported`
- **THEN** UI MUST NOT 呈现误导性的启用、安装完成或立即可用动作
- **AND** SHOULD 仅保留说明性 guidance

### Requirement: Availability Surface MUST Remain Non-Disruptive to Existing Workflows

Computer Use surface 接入后 MUST 保持默认非打扰，不得影响未使用该能力的主流程体验。

#### Scenario: existing settings flow remains unchanged when user ignores computer use
- **WHEN** 用户从未进入 Computer Use surface，也未触发相关动作
- **THEN** 现有设置页、聊天、MCP、工作区行为 MUST 与当前版本一致
- **AND** MUST NOT 因 surface 接入产生额外初始化副作用

#### Scenario: surface failure remains localized
- **WHEN** Computer Use discovery 或 surface 渲染失败
- **THEN** 失败 MUST 被限制在 Computer Use 模块内
- **AND** MUST NOT 扩散为全局设置页或主应用不可用

### Requirement: Surface MUST Expose Activation Action Only For Eligible macOS States

Computer Use surface MUST 只在满足前置条件的 `macOS` 场景下展示显式 verify / activate affordance。

#### Scenario: helper bridge unverified macOS state shows action
- **WHEN** 当前平台为 `macOS`，且 status 为 `blocked`，blocked reasons 中包含 `helper_bridge_unverified`
- **THEN** surface MUST 展示显式 verify / activate action
- **AND** MUST 继续保留原有 blocked reasons 与 guidance

#### Scenario: unsupported or unavailable states do not show activation action
- **WHEN** 当前状态为 `unsupported`、`unavailable`，或硬前置条件如 plugin/helper 缺失
- **THEN** surface MUST NOT 展示 verify / activate action
- **AND** MUST 不得误导用户认为当前宿主已经进入可执行阶段

#### Scenario: remaining permission or approval blockers stay guidance-only
- **WHEN** helper bridge 已在当前 app session 中验证成功，但 status 仍因 `permission_required` 或 `approval_required` 处于 `blocked`
- **THEN** surface MAY 不再继续展示 verify / activate action
- **AND** MUST 继续清晰展示权限与 approval guidance

### Requirement: Surface MUST Render Activation Progress And Result Diagnostics

surface MUST 明确渲染 activation lane 的运行态、成功态、失败态与对应 diagnostics。

#### Scenario: running activation disables repeated trigger and shows progress
- **WHEN** activation/probe 正在运行
- **THEN** surface MUST 呈现 running state
- **AND** MUST 禁止用户重复触发并发 activation

#### Scenario: failed activation shows failure classification and next steps
- **WHEN** activation/probe 返回 `blocked` 或 `failed`
- **THEN** surface MUST 渲染 failure classification、diagnostic message 与 next-step guidance
- **AND** MUST NOT 只显示泛化的“加载失败”

#### Scenario: successful activation updates visible state truth
- **WHEN** activation/probe 成功完成
- **THEN** surface MUST 呈现 verified/ready 后的最新状态
- **AND** MUST NOT 继续显示过时的 `helper_bridge_unverified` 主提示

### Requirement: Surface MUST Keep Activation Failures Localized

activation lane 的失败 MUST 被限制在 Computer Use surface 内，不得扩散为全局设置页故障。

#### Scenario: activation error does not break surrounding settings page
- **WHEN** activation/probe 抛错、超时或返回 failure result
- **THEN** 失败 MUST 仅影响 Computer Use surface
- **AND** MUST NOT 让整个设置页或 Codex 入口失去可用性
