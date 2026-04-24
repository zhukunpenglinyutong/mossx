## ADDED Requirements

### Requirement: Bridge MUST Base Remediation On Official Handoff Evidence

Computer Use bridge 的后续 remediation MUST 基于 official parent handoff discovery evidence，而不是重复 direct exec nested helper。

#### Scenario: host incompatible directs user to handoff discovery
- **WHEN** activation/probe 返回 `host_incompatible`
- **THEN** Computer Use surface MAY 引导用户运行 official parent handoff discovery
- **AND** MUST NOT 建议用户手动运行 nested helper binary

#### Scenario: bridge rejects unsupported handoff workarounds
- **WHEN** 未发现 official handoff method
- **THEN** bridge guidance MUST NOT 推荐复制、重签名、重打包、patch helper 或伪造 parent contract
- **AND** MUST 保持 unavailable / blocked diagnostics state

### Requirement: Bridge MUST Keep Official Asset Boundary During Handoff Discovery

bridge MUST 把 official handoff discovery 视为只读能力，不得成为官方 plugin lifecycle manager。

#### Scenario: plugin state is not mutated during handoff discovery
- **WHEN** handoff discovery 扫描 official plugin manifest 或 marketplace cache
- **THEN** 系统 MUST NOT 修改 plugin enabled state、manifest、cache 或 helper path
- **AND** MUST NOT 将 scanner 输出写回官方 Codex config
