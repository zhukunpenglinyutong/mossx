## ADDED Requirements

### Requirement: Host Contract Diagnostics MUST Include Official Parent Handoff Evidence

host-contract diagnostics MUST 能包含 official parent handoff discovery 的只读证据，并继续保持 diagnostics-only 语义。

#### Scenario: host diagnostics includes handoff discovery summary
- **WHEN** 用户在 `host_incompatible` 后显式运行 host-contract diagnostics 或 handoff discovery
- **THEN** 结果 MUST 包含 official parent handoff discovery summary
- **AND** summary MUST 表达 handoff method、source path、confidence、diagnostic message 与 bounded snippets

#### Scenario: handoff evidence does not imply helper verification
- **WHEN** diagnostics 找到 candidate handoff method
- **THEN** 系统 MUST NOT 自动移除 `helper_bridge_unverified`
- **AND** MUST NOT 将 bridge status 收敛为 `ready`

### Requirement: Host Contract Diagnostics MUST Explain Diagnostics-Only Stop Condition

当未发现官方 handoff 入口时，系统 MUST 清晰表达 Computer Use 在当前宿主中只能诊断、不能运行。

#### Scenario: no official handoff communicates stop condition
- **WHEN** handoff discovery 返回 `handoff_unavailable` 或 `requires_official_parent`
- **THEN** UI guidance MUST 说明当前第三方宿主不能直接运行官方 Computer Use helper
- **AND** MUST 建议等待官方 API、官方 parent handoff 或继续保持 diagnostics-only
