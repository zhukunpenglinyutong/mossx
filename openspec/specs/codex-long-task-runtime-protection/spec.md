# codex-long-task-runtime-protection Specification

## Purpose

Define active-work protection and runtime-ended fallback guarantees so long-running Codex work is not evicted as idle and can recover deterministically if the runtime exits.
## Requirements
### Requirement: Managed Codex Runtime MUST Protect Active Long-Running Work From Idle Eviction

The system MUST treat active Codex turn or stream work as renewable protected work that cannot be evicted by idle retention policies while the task is still in flight.

#### Scenario: turn start acquires active-work protection

- **WHEN** a managed Codex runtime begins a conversation turn
- **THEN** the host MUST acquire active-work protection for that runtime before or with the turn start lifecycle
- **AND** that protection MUST remain effective until a terminal completion, terminal error, or explicit runtime-ended fallback is recorded

#### Scenario: quiet long-running work remains protected

- **WHEN** a managed Codex turn is still active but no new stream output has arrived during a quiet execution phase
- **THEN** the host MUST continue treating the runtime as protected active work
- **AND** warm retention TTL or equivalent idle timers MUST NOT cool or evict the runtime for that reason alone

#### Scenario: active-work protection releases only after terminal settlement

- **WHEN** the host receives a terminal completion, terminal error, or explicit runtime-ended fallback for the active work
- **THEN** the host MUST release the active-work protection associated with that runtime
- **AND** subsequent retention policy may treat the runtime as idle

### Requirement: Active-Work Protection MUST Override Idle Retention And Budget Policies

While a managed Codex runtime is protected by active work, idle retention settings and pool budget policies MUST NOT evict it or require manual pinning to keep it alive.

#### Scenario: warm ttl does not evict protected work

- **WHEN** warm TTL expires while the managed Codex runtime still has active-work protection
- **THEN** the runtime MUST remain alive
- **AND** the host MUST defer cooling or eviction until the active-work protection is released

#### Scenario: budget pressure does not evict protected work

- **WHEN** runtime pool budget reconciliation needs to reduce hot or warm instance count
- **AND** a managed Codex runtime still has active-work protection
- **THEN** the reconciler MUST choose an idle candidate instead of the protected runtime
- **AND** the user MUST NOT need to pin that runtime to preserve the active task

#### Scenario: manual idle retention remains secondary

- **WHEN** a managed Codex runtime is both pinned and protected by active work
- **THEN** active-work protection MUST remain the primary reason it cannot be evicted
- **AND** removing pin alone MUST NOT interrupt the active task

### Requirement: Runtime Loss MUST Trigger Deterministic Fallback And Recovery Paths

If a managed Codex runtime truly exits despite active-work protection, the host MUST emit structured fallback diagnostics, settle pending state, and offer an actionable recovery path.

#### Scenario: child exits during an active turn

- **WHEN** a managed Codex runtime process exits while active-work protection is still present
- **THEN** the host MUST emit a structured `runtime/ended` diagnostic for that workspace
- **AND** the diagnostic MUST include a normalized reason code and any available exit metadata such as exit code or signal

#### Scenario: pending request receives readable runtime-ended failure

- **WHEN** one or more requests are still pending when the managed runtime ends unexpectedly
- **THEN** each affected request MUST resolve or fail with a readable runtime-ended error
- **AND** the host MUST NOT leave the pending request table waiting forever

#### Scenario: active thread leaves processing after runtime exit

- **WHEN** a thread was marked processing and its managed runtime ends before terminal turn completion
- **THEN** the frontend MUST leave processing state for that thread through a deterministic teardown path
- **AND** the thread MUST preserve the last successful visible conversation snapshot instead of blanking or hanging

#### Scenario: runtime-ended thread shows recover or resend action

- **WHEN** the active thread receives a runtime-ended diagnostic caused by managed runtime loss
- **THEN** the conversation surface MUST present a reconnect, recover, or resend action
- **AND** that action MUST reacquire a healthy managed runtime before resuming or resending the work

### Requirement: Codex Active Work MUST Gate Runtime-Ended Visibility

Codex active-work protection MUST be the deciding signal for whether runtime loss is user-visible and recoverable on the conversation surface.

#### Scenario: active protected work makes runtime loss visible

- **WHEN** a managed Codex runtime exits while active-work protection or foreground work continuity exists
- **THEN** the conversation surface MUST receive a runtime-ended diagnostic that can drive reconnect, recover, or resend actions
- **AND** active-work protection MUST release only after that fallback settlement is recorded

#### Scenario: internal cleanup after settled work stays invisible to the conversation

- **WHEN** a managed Codex runtime is stopped after all active work has reached terminal settlement
- **AND** no pending foreground request or callback remains
- **THEN** the stop MUST NOT create a new user-visible runtime-ended reconnect card
- **AND** the stop MAY remain visible through runtime pool diagnostics

#### Scenario: stdout eof is correlated with process exit metadata

- **WHEN** Codex stdout closes before a terminal lifecycle event
- **THEN** the host MUST attempt a bounded correlation with child process status
- **AND** the resulting diagnostic MUST include exit code or signal if it is available within that bounded wait

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
