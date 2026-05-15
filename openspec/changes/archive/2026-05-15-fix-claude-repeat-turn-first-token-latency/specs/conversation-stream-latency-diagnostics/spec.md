## ADDED Requirements

### Requirement: Stream Latency Diagnostics MUST Classify Claude First Token Delay Separately

The system MUST classify Claude Code first-token delay separately from backend forwarding stalls and frontend visible-output stalls.

#### Scenario: no stdout is classified as first-token startup latency
- **WHEN** a Claude Code turn has started and stdin has closed
- **AND** no stdout line has been observed within the bounded diagnostic window
- **THEN** diagnostics MUST classify the wait as Claude first-token or startup latency
- **AND** diagnostics MUST NOT report `backend-forwarder-stall` or `visible-output-stall-after-first-delta` as the primary category

#### Scenario: stdout without valid event is classified before parser ingress
- **WHEN** Claude Code stdout has produced at least one line
- **AND** no valid stream-json event has been parsed within the bounded diagnostic window
- **THEN** diagnostics MUST classify the wait as stdout-without-valid-event or equivalent parser/protocol startup latency
- **AND** diagnostics MUST preserve the distinction from no-stdout upstream delay

#### Scenario: valid event without text is classified before assistant ingress
- **WHEN** a valid Claude Code stream-json event has been parsed
- **AND** no assistant text delta has been emitted yet
- **THEN** diagnostics MUST classify the wait as valid-event-without-text or equivalent first-text latency
- **AND** diagnostics MUST NOT trigger frontend visible-stall mitigation until assistant text delta ingress exists

#### Scenario: malformed timing payloads are ignored safely
- **WHEN** frontend diagnostics receive missing, non-finite, negative, or otherwise malformed timing fields
- **THEN** diagnostics MUST ignore or clamp those fields safely
- **AND** diagnostic gap calculations MUST NOT produce negative durations
