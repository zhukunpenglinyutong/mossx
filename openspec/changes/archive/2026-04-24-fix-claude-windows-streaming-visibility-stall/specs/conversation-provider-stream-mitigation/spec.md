## MODIFIED Requirements

### Requirement: Provider-Scoped Stream Mitigation MUST Be Activated By Fingerprint And Evidence
系统 MUST 仅在命中的 provider/model/platform 指纹且存在对应 latency 证据时，启用 provider-scoped 的更激进流式渲染缓解策略；但 provider-scoped profile MUST NOT 成为 engine/platform 级 mitigation 的唯一入口或拦截条件。

#### Scenario: matched provider fingerprint activates stronger provider profile
- **WHEN** 某个流式会话命中预定义的 provider/model/platform 指纹，例如 `Claude-compatible Qwen provider + Windows`
- **AND** 同一次 turn 的 latency evidence 达到激活阈值
- **THEN** 系统 MUST 为该路径启用对应 provider-scoped stream mitigation profile
- **AND** 该 provider profile MUST 在 diagnostics 中与 engine/platform mitigation 维度区分记录

#### Scenario: unmatched provider does not block engine-level mitigation
- **WHEN** 当前会话不命中 provider/model/platform 指纹
- **AND** 同一次 turn 命中 engine/platform 级 mitigation 条件，例如 `Claude Code + Windows + visible-output-stall-after-first-delta`
- **THEN** 系统 MUST 允许 engine/platform mitigation 生效
- **AND** MUST NOT 因 provider 指纹未命中而强制保留在 baseline path

#### Scenario: unmatched providers retain baseline behavior when no other mitigation evidence exists
- **WHEN** 当前会话不命中 provider/model/platform 指纹
- **AND** 也没有达到任何 engine/platform 或 provider-scoped latency evidence 阈值
- **THEN** 系统 MUST 保持现有 batching / throttle / render-safe 基线行为
- **AND** MUST NOT 因单个 provider issue 的修复把所有会话一并降级
