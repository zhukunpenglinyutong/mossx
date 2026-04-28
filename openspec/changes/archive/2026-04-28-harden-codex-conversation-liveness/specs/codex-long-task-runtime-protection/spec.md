## ADDED Requirements

### Requirement: Active-Work Protection MUST Cooperate With Bounded Liveness Settlement

Codex active-work protection MUST prevent idle eviction of real active work while still allowing bounded settlement when liveness evidence shows the foreground turn is stalled, dead, or abandoned.

#### Scenario: quiet protected work is not evicted as idle
- **WHEN** a Codex turn is active and still within the bounded no-progress window
- **THEN** active-work protection MUST continue preventing warm TTL, idle eviction, and budget cleanup from stopping the runtime
- **AND** the system MUST treat the turn as quiet protected work rather than idle runtime

#### Scenario: expired liveness window does not require infinite protection
- **WHEN** a Codex turn exceeds the bounded no-progress window without progress evidence
- **THEN** the system MUST transition the turn to stalled or dead-recoverable state
- **AND** active-work protection MUST be converted to recovery protection or released after terminal settlement rather than keeping normal processing alive indefinitely

#### Scenario: abandoned or failed turn releases active foreground protection
- **WHEN** a stalled Codex turn settles as abandoned, interrupted, failed, runtime-ended, or equivalent terminal state
- **THEN** active foreground work protection for that turn MUST be released
- **AND** later runtime retention decisions MAY treat the runtime as idle unless another active lease or protected work exists
