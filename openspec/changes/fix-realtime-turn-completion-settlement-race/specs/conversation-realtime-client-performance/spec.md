## ADDED Requirements

### Requirement: Realtime Diagnostics MUST Distinguish Terminal Settlement Failure
Realtime client diagnostics MUST distinguish upstream or runtime stalls from frontend terminal settlement failures that leave processing state visible after final output is rendered.

#### Scenario: final output visible but processing remains true is classified as settlement failure
- **WHEN** final assistant output has been accepted by the client
- **AND** the thread remains in processing mode after terminal completion handling
- **THEN** diagnostics MUST classify the issue as frontend terminal settlement failure unless evidence shows the runtime turn is still active
- **AND** diagnostics MUST include workspace, thread, turn, engine, active turn, alias, and processing state dimensions

#### Scenario: missing terminal event remains distinguishable from rejected terminal event
- **WHEN** a user reports a stuck generating state
- **THEN** diagnostics MUST allow troubleshooting to distinguish no `turn/completed` event received from a received event rejected by settlement guards
- **AND** the system MUST NOT classify both cases as generic render or provider delay
