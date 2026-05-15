## ADDED Requirements

### Requirement: Realtime Performance Budget MUST Include Session Visibility
Realtime conversation performance evidence MUST include active, inactive, and restoring session visibility so regressions can distinguish provider delay from client render amplification.

#### Scenario: diagnostics correlate visibility with stream and render cost
- **WHEN** a Codex, Claude Code, or Gemini session is streaming
- **THEN** diagnostics MUST be able to correlate workspace, thread, engine, turn, visibility state, ingress cadence, buffer depth, flush latency, render cost, and long task evidence
- **AND** the evidence MUST remain bounded for long-running sessions

#### Scenario: background render amplification is distinguishable from upstream delay
- **WHEN** users report switching lag between running sessions
- **THEN** diagnostics MUST distinguish provider or backend first-token delay from runtime ingress delay, background buffer flush delay, React render amplification, and layout or scroll work
- **AND** the system MUST NOT classify background UI render amplification as an upstream provider issue without evidence

### Requirement: Background Scheduling Optimizations MUST Be Layer-Rollback Safe
Background session scheduling optimizations MUST be independently rollback-safe without breaking realtime session continuity.

#### Scenario: disabling render gating restores baseline rendering without disconnecting runtime
- **WHEN** background render gating is disabled by a rollback flag
- **THEN** the client MUST return to baseline-compatible realtime rendering behavior
- **AND** active runtime connections and in-flight session tasks MUST NOT be disconnected, restarted, or cancelled by that rollback

#### Scenario: disabling staged hydration preserves diagnostics
- **WHEN** staged hydration is disabled by a rollback flag
- **THEN** the client MAY restore baseline foreground rendering behavior for switched sessions
- **AND** diagnostics MUST continue collecting enough ingress, flush, render, and long task evidence to compare baseline and optimized behavior
