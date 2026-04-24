## ADDED Requirements

### Requirement: Thread Messaging Session Tooling Extraction Compatibility
The system SHALL preserve the effective command surface and user-visible outcomes when session-tooling commands are moved out of `useThreadMessaging` into a feature-local hook.

#### Scenario: Existing callers keep the same action names
- **WHEN** `useThreadMessaging` extracts session-tooling commands into a submodule hook
- **THEN** the top-level hook MUST continue exposing the same effective action names such as `startStatus`, `startMcp`, `startLsp`, `startSpecRoot`, `startExport`, `startImport`, `startShare`, `startCompact`, `startFast`, `startMode`, `startFork`, and `startResume`
- **AND** callers such as `useThreads` and `useQueuedSend` MUST NOT require contract migration for that extraction batch

#### Scenario: Extracted session tooling preserves existing command semantics
- **WHEN** a session-tooling command is executed after modularization
- **THEN** it MUST preserve the same effective service command selection, dispatch order, activity recording, and user-visible success or error messaging semantics as before extraction
- **AND** the extraction MUST NOT alter runtime command names, payload meaning, or thread routing behavior
