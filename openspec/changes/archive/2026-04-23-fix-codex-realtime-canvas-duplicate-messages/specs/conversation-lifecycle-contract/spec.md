## MODIFIED Requirements

### Requirement: Realtime Optimization Must Preserve Lifecycle Semantics

Any client-side realtime CPU optimization MUST preserve conversation lifecycle semantics and terminal outcomes.

#### Scenario: optimized and baseline paths converge to same lifecycle outcome
- **WHEN** the same ordered event stream is replayed through baseline and optimized paths
- **THEN** both paths MUST converge to the same lifecycle state transitions and terminal state
- **AND** user-visible message continuity MUST remain equivalent

#### Scenario: batching does not leave pseudo-processing residue
- **WHEN** a turn reaches completed or error terminal state under optimized processing
- **THEN** lifecycle state MUST leave processing mode deterministically
- **AND** the thread MUST NOT remain in stuck pseudo-processing state

#### Scenario: duplicate codex assistant aliases converge before terminal settlement
- **WHEN** a Codex realtime turn observes equivalent assistant content through multiple event aliases or fallback ids
- **THEN** lifecycle consumers MUST converge those observations into one completed assistant message
- **AND** terminal settlement MUST NOT leave duplicate assistant bubbles in the conversation state
