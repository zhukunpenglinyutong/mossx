## ADDED Requirements

### Requirement: Stream Latency Diagnostics MUST Classify Backend Forwarding Stalls Separately

The system MUST distinguish Claude backend event forwarding stalls from upstream first-token delay and frontend visible render stalls.

#### Scenario: backend stall is classified after engine event ingress
- **WHEN** the Claude engine has produced a stream delta inside the backend
- **AND** the corresponding app event is not emitted within the bounded forwarding window
- **THEN** diagnostics MUST classify the slow path as `backend-forwarder-stall` or an equivalent explicit category
- **AND** the classification MUST NOT be collapsed into upstream provider delay

#### Scenario: burst flush is classified when queued deltas arrive together
- **WHEN** multiple Claude deltas are emitted to the frontend after a long backend forwarding gap
- **THEN** diagnostics MUST record burst evidence such as max forwarding gap, queued delta count, or equivalent summary
- **AND** the classification MUST remain distinct from `visible-output-stall-after-first-delta`

#### Scenario: diagnostics correlate runtime sync and process snapshot timing
- **WHEN** backend forwarding latency overlaps runtime sync, process diagnostics, or ledger persistence work
- **THEN** diagnostics MUST preserve enough timing evidence to correlate the stall with that work
- **AND** the evidence MUST include `workspaceId`, `threadId`, `engine`, `platform`, and turn correlation where available

#### Scenario: backend evidence uses existing bounded diagnostics surfaces
- **WHEN** backend forwarding latency evidence is recorded for a Claude turn
- **THEN** the evidence MUST be written to an existing bounded diagnostics surface such as runtime diagnostics, renderer diagnostics correlation, app-server diagnostic events, structured logs, or an equivalent project-approved diagnostics channel
- **AND** the evidence MUST be correlatable by `workspaceId`, `threadId`, `turnId` where available, `engine`, and `platform`
- **AND** adding this evidence MUST NOT require changing the stable Tauri command payload contract for conversation streaming

#### Scenario: frontend classification only consumes backend evidence when surfaced
- **WHEN** backend forwarding evidence is exposed through an existing frontend-consumable diagnostics surface
- **THEN** frontend stream latency diagnostics MAY classify `backend-forwarder-stall` or burst-flush from that evidence
- **AND** when backend evidence is log-only, frontend diagnostics MUST keep using local ingress/render timing and MUST NOT infer backend-forwarder stalls from visible render delay alone

#### Scenario: frontend visible stall remains a separate category
- **WHEN** app events are emitted promptly but visible assistant text does not grow in the frontend
- **THEN** diagnostics MUST continue to classify the issue as `visible-output-stall-after-first-delta` or equivalent frontend render category
- **AND** backend forwarding stall evidence MUST NOT be reported as the primary category for that turn
