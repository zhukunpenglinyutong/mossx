## REMOVED Requirements

### Requirement: Phase 1 Surface MUST Stay Status-Only
**Reason**: 第二阶段允许 `macOS` 上的显式 verify / activate action，因此 surface 不再只能展示静态状态。
**Migration**: 将 surface 从“仅状态诊断”升级为“状态 + 显式 activation feedback”，但继续禁止后台或隐式 helper invoke。

## ADDED Requirements

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
