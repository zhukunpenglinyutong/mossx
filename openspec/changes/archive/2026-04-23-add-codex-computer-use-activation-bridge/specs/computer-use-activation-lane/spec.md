## ADDED Requirements

### Requirement: Activation Lane MUST Be Explicit and macOS-Only

系统 MUST 仅在 `macOS` 的显式用户动作下开放 Computer Use activation/probe lane，不得把该能力变成后台自动流程或跨平台模糊入口。

#### Scenario: eligible macOS host can trigger activation lane
- **WHEN** 当前平台为 `macOS`，官方 Codex App、plugin 与 helper 已被发现，且用户在 Computer Use surface 显式点击 verify / activate
- **THEN** 系统 MUST 开始一次 bounded activation/probe
- **AND** MUST NOT 要求用户通过聊天发送、设置保存或其他隐式动作触发

#### Scenario: unsupported or ineligible host cannot trigger activation lane
- **WHEN** 当前平台为 `Windows`，或 `macOS` 上仍缺少 Codex App / plugin / helper 等硬前置条件
- **THEN** 系统 MUST NOT 暴露 activation affordance
- **AND** MUST 继续停留在 `unsupported`、`unavailable` 或前置条件未满足的状态表达

### Requirement: Activation Lane MUST Return Structured Result With Evidence

系统 MUST 为每次 activation/probe 返回结构化结果，能够区分 helper 已验证、被已知 blocked reason 拦住、执行失败与 timeout/incompatible 等失败类型。

#### Scenario: successful probe returns verified result
- **WHEN** bounded activation/probe 成功验证当前宿主可以桥接官方 helper
- **THEN** 系统 MUST 返回 `verified` outcome
- **AND** MUST 附带更新后的 bridge status 与最小 diagnostics

#### Scenario: blocked probe preserves remaining permission or approval blockers
- **WHEN** activation/probe 已成功验证 helper 能在当前宿主中拉起，但 `permission_required` 或 `approval_required` 仍未被本期自动验证
- **THEN** 系统 MUST 返回 `blocked` outcome
- **AND** MUST 提供 failure kind、diagnostic message 与 next-step guidance

#### Scenario: probe timeout or helper failure remains explicit
- **WHEN** helper 启动失败、握手失败、宿主不兼容或 probe 超时
- **THEN** 系统 MUST 返回 `failed` outcome
- **AND** MUST 暴露 bounded evidence，例如 exit code、stderr snippet 或 timeout classification

### Requirement: Activation Lane MUST Be Single-Flight and Kill-Switchable

系统 MUST 确保 activation/probe 在同一时刻只有一个实例在执行，并且能够在回归时整块关闭。

#### Scenario: repeated trigger while running does not start parallel probe
- **WHEN** 已有 activation/probe 正在运行，用户再次触发 verify / activate
- **THEN** 系统 MUST 拒绝或复用当前 single-flight execution
- **AND** MUST NOT 启动第二个并发 helper invoke

#### Scenario: kill switch disables activation lane while preserving phase 1 status surface
- **WHEN** activation feature flag 被关闭
- **THEN** 系统 MUST 停止暴露 activation lane
- **AND** MUST 保留 Phase 1 discovery/status surface 的只读行为
