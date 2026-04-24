## ADDED Requirements

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
