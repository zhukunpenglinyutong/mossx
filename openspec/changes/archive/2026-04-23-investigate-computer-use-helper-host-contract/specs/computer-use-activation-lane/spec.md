## ADDED Requirements

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
