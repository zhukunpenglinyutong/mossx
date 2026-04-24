# computer-use-activation-lane Specification

## Purpose
Define the explicit macOS-only Computer Use activation and diagnostics lane. The lane verifies installation and launch-contract evidence without background execution, preserves diagnostics-only fallback when the host is incompatible, and avoids direct helper execution from non-official parent processes.

## Requirements
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

### Requirement: Activation Lane MUST Gate Host Contract Diagnostics After Host Incompatibility

activation lane MUST 在 `host_incompatible` 或等价 helper parent-contract failure 之后，只允许用户显式进入更窄的 host-contract diagnostics，而不是继续 direct exec nested helper。

#### Scenario: host incompatible result exposes diagnostics guidance
- **WHEN** activation/probe 返回 `host_incompatible`，且当前平台为 `macOS`
- **THEN** Computer Use surface MAY 展示 host-contract diagnostics CTA
- **AND** guidance MUST 明确说明该动作用于收集 official parent / handoff evidence，不是重试 direct helper exec

#### Scenario: activation lane does not auto-chain into host diagnostics
- **WHEN** activation/probe 失败并返回 `host_incompatible`
- **THEN** 系统 MUST NOT 自动继续执行 host-contract diagnostics
- **AND** MUST 等待用户显式触发下一步

#### Scenario: host diagnostics shares single-flight guard
- **WHEN** activation/probe 或 host-contract diagnostics 已经在运行
- **THEN** 系统 MUST NOT 启动第二个 Computer Use helper investigation run
- **AND** MUST 返回 already-running 或等价可恢复状态

### Requirement: Activation Lane MUST Preserve Phase 2 Diagnostics-Only Fallback

activation lane MUST 在 host-contract investigation 不可用、被 kill switch 关闭或证据不足时，保持 Phase 2 的 diagnostics-only fallback，不得误报 ready。

#### Scenario: kill switch hides host contract diagnostics
- **WHEN** activation / host-contract feature flag 被关闭
- **THEN** surface MUST 不展示 host-contract diagnostics CTA
- **AND** `host_incompatible` MUST 继续作为 diagnostics-only failure 呈现

#### Scenario: unknown host contract remains blocked
- **WHEN** host-contract diagnostics 返回 `unknown` 或 evidence 不足
- **THEN** bridge status MUST 保持 blocked
- **AND** MUST NOT 移除 `helper_bridge_unverified` 或等价 blocked reason

### Requirement: Activation Lane MUST Route Host Incompatibility To Handoff Discovery

activation lane 在遇到 `host_incompatible` 后 MUST 引导到 official parent handoff discovery，而不是重复执行同一个 activation/probe。

#### Scenario: host incompatible exposes handoff discovery CTA
- **WHEN** activation/probe 返回 `host_incompatible`，且当前平台为 `macOS`
- **THEN** Computer Use surface MAY 展示 official parent handoff discovery CTA
- **AND** CTA copy MUST 说明该动作只调查官方 parent handoff evidence

#### Scenario: activation retry is not primary remediation
- **WHEN** 当前 session 已经得到 `host_incompatible`
- **THEN** UI MUST NOT 把重复 activation/probe 作为主要下一步
- **AND** MUST 将下一步解释为 handoff discovery 或 diagnostics-only stop condition

### Requirement: Activation And Handoff Discovery MUST Share Single-Flight Guard

activation/probe 与 official parent handoff discovery MUST 共享 Computer Use investigation single-flight guard。

#### Scenario: handoff discovery cannot run during activation
- **WHEN** activation/probe 正在运行
- **THEN** 系统 MUST NOT 启动 handoff discovery
- **AND** MUST 返回 already-running 或等价可恢复状态

#### Scenario: activation cannot run during handoff discovery
- **WHEN** handoff discovery 正在运行
- **THEN** 系统 MUST NOT 启动 activation/probe
- **AND** MUST 返回 already-running 或等价可恢复状态

### Requirement: Activation Lane MUST Stop Retry Guidance After Parent Contract Evidence

activation lane 在发现 host incompatibility 后 MUST 避免把重复 activation 或重复 diagnostics 作为主要 remediation。

#### Scenario: host incompatible routes to diagnostics once
- **WHEN** activation/probe 返回 `host_incompatible`
- **THEN** UI MUST 隐藏 activation CTA
- **AND** MAY 展示一次 host-contract diagnostics CTA

#### Scenario: final parent verdict hides repeated diagnostics action
- **WHEN** host-contract diagnostics 已经返回 `requires_official_parent` 或 `handoff_unavailable`
- **THEN** UI MUST NOT 继续把 host-contract diagnostics CTA 作为主行动
- **AND** MUST 保留普通 refresh 作为环境变化后的重新读取入口

#### Scenario: candidate handoff does not restart activation
- **WHEN** official parent discovery 返回 `handoff_candidate_found`
- **THEN** UI MUST NOT 自动重启 activation/probe
- **AND** MUST 将 candidate 入口展示为 evidence-only

### Requirement: Activation Lane MUST Support Codex CLI Plugin Contract Verification

Activation lane MUST support verifying the Codex CLI plugin cache contract without executing the helper directly from mossx, and broker execution MUST depend on that verification.

#### Scenario: cli cache contract removes helper bridge blocker
- **WHEN** CLI plugin cache descriptor and helper file are present
- **AND** descriptor args include `mcp`
- **THEN** activation MAY mark helper bridge verified for the current app session
- **AND** MUST keep remaining permission/approval blockers

#### Scenario: cli cache activation avoids direct exec
- **WHEN** helper path belongs to Codex CLI plugin cache
- **THEN** activation MUST NOT spawn `SkyComputerUseClient`
- **AND** MUST return a diagnostic message explaining that Codex CLI is the launch parent

#### Scenario: broker may attempt manual permission resolution
- **WHEN** activation has verified the CLI cache helper contract but only `permission_required` or `approval_required` remains
- **THEN** broker MAY allow an explicit user-triggered Codex run
- **AND** guidance MUST explain that official Codex may still require macOS permissions or allowed-app approval
