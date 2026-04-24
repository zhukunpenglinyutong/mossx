## ADDED Requirements

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
