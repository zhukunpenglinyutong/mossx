## ADDED Requirements

### Requirement: Thread Actions Session Runtime Extraction Compatibility
The system SHALL preserve the effective action surface and thread lifecycle outcomes when session runtime actions are moved out of `useThreadActions` into a feature-local hook.

#### Scenario: Existing callers keep the same action names
- **WHEN** `useThreadActions` extracts session runtime actions into a submodule hook
- **THEN** the top-level hook MUST continue exposing the same effective action names such as `startThreadForWorkspace`, `startSharedSessionForWorkspace`, `forkThreadForWorkspace`, `forkClaudeSessionFromMessageForWorkspace`, and `forkSessionFromMessageForWorkspace`
- **AND** callers such as `useThreads` and existing thread action tests MUST NOT require contract migration for that extraction batch

#### Scenario: Extracted session runtime preserves start and fork behavior
- **WHEN** a caller starts a session or forks a thread after modularization
- **THEN** the system MUST preserve the same effective service command selection, dispatch order, active-thread selection, and loaded-thread bookkeeping semantics as before extraction
- **AND** the extraction MUST NOT alter runtime command names, payload meaning, or thread routing behavior

#### Scenario: Extracted rewind flow preserves rollback and rename semantics
- **WHEN** a caller executes Claude or Codex rewind/fork-from-message after modularization
- **THEN** the system MUST preserve the same workspace-restore rollback behavior, thread-id migration semantics, title-mapping persistence, and post-fork resume flow as before extraction
- **AND** failure paths MUST remain recoverable without introducing new partial-success states
