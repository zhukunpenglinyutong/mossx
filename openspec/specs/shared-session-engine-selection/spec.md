# shared-session-engine-selection Specification

## Purpose

Defines the shared-session-engine-selection behavior contract, covering Shared Session Uses Explicit Manual Engine Selection.

## Requirements
### Requirement: Shared Session Uses Explicit Manual Engine Selection

Within a `shared session`, the system MUST let the user explicitly choose the current execution engine before sending a turn.

#### Scenario: shared composer exposes current engine selector

- **WHEN** the user focuses the composer inside a `shared session`
- **THEN** the system MUST show an explicit execution engine selector
- **AND** that selector MUST allow the user to choose from the currently supported `Codex` and `Claude` engines only

#### Scenario: selector update is metadata-only before send

- **WHEN** the user changes the shared-session engine selector but does not submit a message yet
- **THEN** the system MUST update the selected engine state for that shared session
- **AND** the system MUST NOT dispatch a turn or start an extra user-visible native conversation solely due to selector change

#### Scenario: submitted turn uses the user-selected engine

- **WHEN** the user submits a message from a `shared session`
- **THEN** the system MUST dispatch that turn to the engine currently selected by the user
- **AND** the dispatch result MUST remain attributable to that selected engine

#### Scenario: unsupported engines stay unavailable in shared session

- **WHEN** the user focuses the composer inside a `shared session`
- **THEN** the system MUST keep `Gemini` and `OpenCode` unavailable for selection in that shared-session selector
- **AND** the system MUST NOT route a shared-session turn through `Gemini` or `OpenCode`

### Requirement: Shared Session Engine Selection Is Sticky Until User Changes It

The currently selected execution engine in a `shared session` MUST remain active for subsequent turns until the user explicitly changes it.

#### Scenario: consecutive turns reuse prior engine selection

- **WHEN** the user sends a turn in a `shared session` and then sends another turn without changing the selector
- **THEN** the system MUST reuse the same execution engine for the later turn
- **AND** the system MUST NOT require the user to re-select an engine before every message

#### Scenario: changing selector updates future turns only

- **WHEN** the user changes the selected engine before sending the next message
- **THEN** the next turn MUST use the newly selected engine
- **AND** previously completed turns MUST keep their original engine attribution

#### Scenario: switching back to previous engine remains reversible

- **WHEN** the user switches from `Claude` to `Codex` and later switches back to `Claude` in the same shared session
- **THEN** each subsequent turn MUST execute on the latest selector value at send time
- **AND** the system MUST keep the selector reversible without locking the session to a prior engine

### Requirement: Each Shared Turn Uses Exactly One Engine

In V1, every user turn inside a `shared session` MUST execute on exactly one engine from start to terminal outcome.

#### Scenario: one submitted turn is not fanned out to multiple engines

- **WHEN** the user submits one message in a `shared session`
- **THEN** the system MUST dispatch that turn to exactly one engine
- **AND** the system MUST NOT fan out the same turn to multiple engines in parallel

#### Scenario: in-progress turn does not hand off to another engine

- **WHEN** a `shared session` turn is already running on a selected engine
- **THEN** the system MUST keep that turn bound to the same engine until terminal completion or failure
- **AND** the system MUST NOT hand off the remaining work to another engine mid-turn

### Requirement: Shared Session MUST NOT Auto-Route Or Silently Fallback

In V1, `shared session` dispatch MUST remain user-controlled and MUST NOT silently change the selected engine because of heuristics, availability checks, or runtime failures.

#### Scenario: system does not auto-route based on prompt content

- **WHEN** the user submits a turn in a `shared session`
- **THEN** the system MUST use the user-selected engine rather than auto-routing based on message content or task category
- **AND** the system MUST NOT replace manual choice with a heuristic engine decision

#### Scenario: selected engine failure does not trigger silent reroute

- **WHEN** the selected engine is unavailable or the turn fails during execution
- **THEN** the system MUST surface the error or recoverable failure state for that selected engine
- **AND** the system MUST NOT silently reroute the same turn to another engine

