## ADDED Requirements

### Requirement: First-Turn Stale Codex Drafts MUST Use Fresh Continuation Semantics

Codex stale-thread recovery MUST distinguish durable stale conversation identities from first-turn drafts that never accepted user work.

#### Scenario: empty stale draft can be replaced without manual recovery card
- **WHEN** a Codex thread identity fails with `thread not found`
- **AND** canonical accepted-turn / durable-activity facts prove the identity has no accepted user turn, no completed assistant response, and no persisted durable activity
- **THEN** the system MAY replace the stale draft with a fresh Codex thread for the current first prompt
- **AND** the primary user path MUST continue the prompt in the fresh thread rather than asking the user to recover the old empty identity

#### Scenario: unknown draft boundary stays durable-safe
- **WHEN** a Codex thread identity fails with `thread not found`
- **AND** the system cannot determine whether the identity accepted user work
- **AND** the failure is not the current pre-accept first-send prompt on a locally empty draft surface
- **THEN** the system MUST use durable stale-thread recovery semantics
- **AND** it MUST NOT silently classify the source as an empty disposable draft based only on missing frontend-rendered items

#### Scenario: current first-send prompt can recover a lost empty-draft marker
- **WHEN** a Codex thread identity fails with `thread not found` before `turn/start` accepts the current prompt
- **AND** the empty-draft lifecycle marker is missing
- **AND** local activity contains no durable user, assistant, tool, approval, or completed generated-image evidence
- **THEN** the system MAY create a fresh Codex thread and resend the current prompt there
- **AND** malformed identity errors such as `invalid thread id` MUST still require verified rebind or explicit user recovery rather than automatic fresh replacement

#### Scenario: durable stale thread still requires verified rebind or explicit fresh continuation
- **WHEN** a Codex thread identity fails after one or more accepted user turns or durable activity facts exist
- **THEN** the system MUST first attempt verified rebind through the existing stale-thread recovery contract
- **AND** fresh continuation MUST be explicit and user-visible rather than silently replacing the old thread

#### Scenario: first-turn fresh replacement records alias only when safe
- **WHEN** a first-turn stale draft is replaced by a fresh thread
- **THEN** the system MUST NOT persist an alias that claims the old durable conversation was recovered unless the old identity was verified
- **AND** any stored mapping MUST be marked or treated as draft replacement rather than durable rebind

### Requirement: Fresh Continuation MUST Preserve User Intent Visibility

When stale Codex recovery falls back to a fresh thread, the user's immediate intent MUST remain visible and target the new active identity.

#### Scenario: fresh continuation renders the replayed prompt
- **WHEN** a recover-and-resend or first-turn fallback sends a prompt to a fresh Codex thread
- **THEN** the user prompt MUST be rendered or otherwise visibly represented in the fresh thread
- **AND** duplicate suppression MUST NOT hide the prompt merely because the action originated from a stale source thread

#### Scenario: fresh continuation keeps old thread explainable
- **WHEN** a fresh continuation replaces or supersedes a stale Codex source identity
- **THEN** the old thread surface MUST remain explainable as stale, abandoned, or replaced when visible
- **AND** the UI MUST NOT imply that old context was fully preserved unless verified rebind occurred
