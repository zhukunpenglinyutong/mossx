## ADDED Requirements

### Requirement: Stream Latency Diagnostics MUST Classify Visible Output Stall After First Delta
The system MUST record a distinct visible-output-stall classification when stream ingress exists but frontend visible text does not continue progressing.

#### Scenario: first delta arrives but visible output stalls
- **WHEN** a streaming conversation has recorded `firstDeltaAt`
- **AND** the active assistant message has not shown continued visible text growth within the bounded live render window
- **THEN** diagnostics MUST classify the turn as `visible-output-stall-after-first-delta` or an equivalent explicit category
- **AND** diagnostics MUST preserve `workspaceId`, `threadId`, `engine`, `platform`, `firstDeltaAt`, visible render timing, and active mitigation profile

#### Scenario: stall classification is independent of provider and model
- **WHEN** the active engine is `claude`
- **AND** the platform is Windows
- **AND** the turn shows first-delta-then-stall evidence
- **THEN** diagnostics MUST record the stall even if provider/model fields are empty, custom, or unrelated to Qwen
- **AND** provider/model fields MUST remain correlation dimensions rather than root-cause gates

#### Scenario: upstream pending remains distinct from visible stall
- **WHEN** a streaming turn has not received any assistant delta
- **THEN** diagnostics MUST classify the condition as upstream pending, first-token delay, timeout, or equivalent
- **AND** diagnostics MUST NOT classify it as visible output stall until at least one assistant delta has arrived
