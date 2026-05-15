## ADDED Requirements

### Requirement: Claude Forwarding Latency MUST Start After Engine Event Ingress

The Claude Code stream forwarding latency contract MUST only classify delays after an engine event has reached the backend forwarder.

#### Scenario: pre-ingress first-token delay is not a forwarder stall
- **WHEN** a Claude Code turn has started
- **AND** the backend forwarder has not yet received a realtime engine event for that turn
- **THEN** diagnostics MUST NOT classify the delay as `backend-forwarder-stall`
- **AND** first-token/startup diagnostics MUST own that pre-ingress latency window

#### Scenario: first delta remains protected after ingress
- **WHEN** the first Claude Code assistant text delta reaches the backend forwarder
- **THEN** the forwarder MUST emit the corresponding app-server event before runtime diagnostics or ledger persistence
- **AND** this guarantee MUST apply regardless of any earlier first-token latency recorded for the turn
