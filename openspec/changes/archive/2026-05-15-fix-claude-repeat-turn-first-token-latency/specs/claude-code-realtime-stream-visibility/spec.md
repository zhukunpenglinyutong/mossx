## ADDED Requirements

### Requirement: Claude Visible Stream Mitigation MUST Require Assistant Text Ingress

Claude Code visible-stream mitigation MUST activate only after assistant text delta ingress exists.

#### Scenario: no first text delta stays in first-token diagnostics
- **WHEN** a Claude Code turn is processing
- **AND** no assistant text delta has been emitted for the active turn
- **THEN** the frontend MUST NOT activate `visible-output-stall-after-first-delta` recovery for that turn
- **AND** diagnostics MUST keep the issue in first-token/startup latency until assistant text ingress exists

#### Scenario: first text delta hands off to visible-stream diagnostics
- **WHEN** a Claude Code assistant text delta has been emitted and app-server delivery has occurred
- **THEN** subsequent lack of visible text growth MAY be classified as visible-output stall
- **AND** the existing Claude Windows visible-stream mitigation rules MUST remain available
