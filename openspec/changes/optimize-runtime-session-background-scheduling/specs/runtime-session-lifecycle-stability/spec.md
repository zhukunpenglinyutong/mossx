## ADDED Requirements

### Requirement: Session Visibility Changes MUST NOT Interrupt Runtime Execution
Changing whether a running session is foreground or background MUST NOT be treated as a runtime lifecycle transition that can disconnect, terminate, pause, reacquire, or restart the underlying runtime.

#### Scenario: switching a running session to background keeps runtime active
- **WHEN** a running session is switched away from foreground
- **THEN** the runtime connection and in-flight task MUST continue running under the same lifecycle generation
- **AND** the system MUST NOT issue disconnect, terminate, pause, reacquire, or restart actions solely because the session became inactive

#### Scenario: switching a running session back to foreground does not create a replacement runtime
- **WHEN** a background running session is switched back to foreground
- **THEN** the frontend MUST rebind visible surfaces to the existing runtime generation when it is still active
- **AND** the system MUST NOT create a replacement runtime unless normal lifecycle diagnostics indicate the current runtime is actually lost or unusable

### Requirement: Background Session State MUST Remain Reconciliable After Reconnect
If the host reconnects while sessions were backgrounded, runtime and thread state reconciliation MUST preserve background execution continuity and buffered output semantics.

#### Scenario: reconnect reconciles background running sessions
- **WHEN** WebService or Tauri frontend connectivity is restored after a disconnect
- **AND** one or more sessions were running in background visibility before or during the disconnect
- **THEN** runtime refresh MUST reconcile their current lifecycle state without assuming user-visible inactivity means task completion
- **AND** buffered or newly fetched output MUST converge without duplicate session completion or stale disconnected status

#### Scenario: lifecycle diagnostics include visibility context
- **WHEN** runtime lifecycle diagnostics are emitted for a running session
- **THEN** diagnostics MUST include or be correlatable with the session visibility state at the time of the event
- **AND** troubleshooting MUST be able to distinguish visibility-driven render gating from true runtime loss
