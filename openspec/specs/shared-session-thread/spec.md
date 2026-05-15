# shared-session-thread Specification

## Purpose

Defines the shared-session-thread behavior contract, covering Shared Session Is A Distinct Immutable Conversation Type.

## Requirements
### Requirement: Shared Session Is A Distinct Immutable Conversation Type

The system MUST allow users to create a `shared session` as a distinct conversation type alongside native `Codex`, `Claude`, `Gemini`, and `OpenCode` sessions, and MUST preserve that type after creation.

#### Scenario: user creates a shared session from new conversation flow

- **WHEN** the user creates a new conversation and chooses `shared session`
- **THEN** the system MUST create a conversation whose persisted type is `shared`
- **AND** conversation list, tabs, and reopen flows MUST recognize it as `shared` rather than as a native engine session

#### Scenario: shared session type remains fixed after creation

- **WHEN** the user reopens, renames, or continues an existing `shared session`
- **THEN** the system MUST preserve the `shared` conversation type
- **AND** the system MUST NOT silently convert that conversation into any native engine session type

### Requirement: Shared Session Maintains One Canonical Thread

A `shared session` MUST append all user turns and assistant outputs into one canonical shared thread even when the selected execution engine changes between turns.

#### Scenario: switching engine between turns keeps one shared history

- **WHEN** the user sends one turn with `Claude` and a later turn with `Codex` inside the same `shared session`
- **THEN** both turns MUST appear in one continuous shared conversation history
- **AND** the system MUST NOT create a second primary user-facing conversation just because the execution engine changed

#### Scenario: shared session identity stays stable across navigation surfaces

- **WHEN** the user leaves the active conversation and later returns through conversation list, topbar tab, or reopen flow
- **THEN** the system MUST resolve the same `shared session` identity
- **AND** the recovered conversation history MUST remain attached to that same shared thread

### Requirement: Shared Session Hidden Native Bindings Stay Internal

Native bindings owned by a `shared session` are runtime internals and MUST NOT become user-facing native conversations.

#### Scenario: selector change does not create a visible native conversation

- **WHEN** the user switches selected engine inside a `shared session` but has not sent a new turn
- **THEN** the system MUST persist the shared selector state for that session
- **AND** the system MUST NOT create an extra user-visible native conversation only because of that selector change

#### Scenario: shared-owned native bindings are filtered from native list surfaces

- **WHEN** thread list / tabs / reopen flows include both native sessions and shared sessions
- **THEN** native bindings marked as shared-owned internals MUST remain hidden from native conversation surfaces
- **AND** users MUST continue the conversation through the `shared session` identity

### Requirement: Shared Session Folder Assignment Stays Separate From Native Assignment

`shared session` folder organization MUST target the canonical `shared:*` thread identity and MUST NOT reuse native engine folder assignment for its hidden bindings.

#### Scenario: native folder assignment rejects shared thread ids

- **WHEN** a caller attempts to move a `shared:*` thread through native session folder assignment
- **THEN** the native assignment path MUST reject the request instead of treating it as a `Claude` or `Codex` native session
- **AND** the system MUST preserve the existing shared session folder/root placement

#### Scenario: hidden native bindings do not define shared folder placement

- **WHEN** a `shared session` has hidden `Claude` or `Codex` native bindings
- **THEN** moving or projecting those hidden bindings MUST NOT be considered the durable folder assignment for the shared session
- **AND** users MUST continue to see the shared conversation through the canonical `shared:*` identity

#### Scenario: empty shared sessions may remain at root until shared assignment exists

- **WHEN** a newly created `shared session` has no completed turn yet
- **AND** no shared-specific folder assignment contract is available
- **THEN** the system MAY keep that empty shared session at project root
- **AND** later conversation activity MAY allow existing projection refresh logic to place it under the intended folder as a best-effort behavior

### Requirement: Shared Session History Rendering Preserves User Turns

Shared history replay MUST preserve user-message visibility even when source payloads are wrapper/fallback formats.

#### Scenario: wrapped user payload still renders one visible user bubble

- **WHEN** shared history contains user messages wrapped by context-sync or fallback prefixes
- **THEN** the replayed conversation MUST show a visible user bubble with the effective current request text
- **AND** the system MUST NOT drop that user bubble during history load or reopen

#### Scenario: optimistic reconcile does not truncate unmatched earlier user history

- **WHEN** local optimistic user bubbles coexist with delayed shared snapshot reconciliation
- **THEN** unmatched earlier optimistic user entries MUST be preserved until a deterministic match arrives
- **AND** the system MUST NOT truncate prior user history because of a broad fallback replace

### Requirement: Shared Pending Rebinding Is Safe And Deterministic

Pending placeholder rebind for shared/native bridge MUST avoid stale or ambiguous mappings.

#### Scenario: pending rebind uses unique fresh placeholder

- **WHEN** runtime events arrive for a shared turn whose native thread id finalized after send
- **THEN** the bridge MUST rebind through a unique pending placeholder for the same workspace/engine
- **AND** subsequent turn events MUST route to the same shared thread identity

#### Scenario: stale or ambiguous pending placeholders are ignored

- **WHEN** multiple pending placeholders exist or the pending placeholder is stale
- **THEN** the bridge MUST reject fallback rebind for that event
- **AND** the system MUST avoid assigning that event to an unrelated shared conversation

### Requirement: Shared Session Recovery Preserves Engine Provenance

The system MUST preserve source-engine metadata for assistant messages and key activity facts inside a `shared session` so history remains explainable after replay and reopen.

#### Scenario: shared history retains source engine metadata

- **WHEN** a `shared session` contains assistant turns or key activity facts produced by different engines
- **THEN** persisted history MUST retain engine provenance for each relevant record
- **AND** replay consumers MUST be able to determine which engine produced that record

#### Scenario: reopen restores one shared conversation with provenance intact

- **WHEN** the user closes and later reopens an existing `shared session`
- **THEN** the system MUST restore one shared conversation history with source-engine metadata intact
- **AND** the system MUST NOT split that recovered history into multiple unrelated native engine conversations

### Requirement: Native Engine Sessions Remain Unchanged

Adding `shared session` support MUST NOT change the creation, reopen, or history semantics of existing native engine sessions.

#### Scenario: native session flow remains engine-scoped

- **WHEN** the user creates or reopens a native `Codex`, `Claude`, `Gemini`, or `OpenCode` conversation
- **THEN** the existing conversation MUST remain engine-scoped and follow its current native lifecycle
- **AND** the presence of `shared session` support MUST NOT force migration or conversion
