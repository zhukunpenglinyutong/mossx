# composer-send-readiness-ux Specification

## Purpose
TBD - created by archiving change improve-composer-send-readiness-ux. Update Purpose after archive.
## Requirements
### Requirement: Composer MUST Derive Send Readiness Through A View Model

Composer MUST derive user-visible send readiness through a dedicated view model or equivalent pure selector layer instead of scattering readiness decisions across presentation components.

#### Scenario: readiness view model includes target context and activity

- **WHEN** Composer renders an input area for a thread
- **THEN** the system MUST derive a readiness view model containing target, context summary, readiness, activity, and explainability fields
- **AND** presentation components SHOULD consume that view model rather than recomputing engine, model, mode, queue, or disabled semantics independently

#### Scenario: view model consumes runtime and conversation truth without redefining it

- **WHEN** runtime recovery, modeBlocked, request_user_input, or queue state affects sending
- **THEN** Composer readiness MUST consume the already-classified state from runtime, conversation, or queue layers
- **AND** it MUST NOT independently parse provider payload, settle request_user_input, or initiate stale-thread recovery

#### Scenario: unknown state degrades conservatively

- **WHEN** Composer cannot confidently determine a readiness dimension
- **THEN** it MUST degrade to a conservative label such as loading, unknown, blocked, or unavailable
- **AND** it MUST NOT present unsupported send, queue, fuse, or recovery actions as available

### Requirement: Composer MUST Explain The Effective Send Target Before Submission

Composer MUST expose a concise pre-send summary of the effective target and key context that will be attached to the next send.

#### Scenario: target summary shows engine model and mode

- **WHEN** the user is preparing a message
- **THEN** Composer MUST show or make immediately available the current engine/provider, model, and mode labels
- **AND** the summary MUST reflect the same selection used by the send path

#### Scenario: context summary includes high-impact attachments and injected context

- **WHEN** skills, commands, manual memory, note cards, file references, images, or code annotations are selected
- **THEN** Composer MUST summarize those inputs in a compact context summary
- **AND** detailed disclosure MAY be collapsed behind a tooltip, popover, or expandable area

#### Scenario: mode impact is visible for high-risk or constrained modes

- **WHEN** the selected mode constrains or expands execution such as Plan, Default, or Full access
- **THEN** Composer MUST provide a short explanation of the mode impact
- **AND** it MUST avoid implying write access in read-only or planning modes

### Requirement: Disabled Composer State MUST Include An Actionable Reason

Composer MUST display a user-understandable reason when the primary send action is disabled or replaced.

#### Scenario: disabled send explains runtime recovery

- **WHEN** the current runtime is recovering, quarantined, ended, or otherwise unavailable
- **THEN** Composer MUST explain that sending is blocked or delayed by runtime state
- **AND** it SHOULD surface the recommended action from runtime diagnostics when available

#### Scenario: disabled send explains modeBlocked

- **WHEN** the current turn is blocked by access mode, collaboration mode, or provider permission constraints
- **THEN** Composer MUST show a modeBlocked explanation rather than only disabling the button
- **AND** it SHOULD point to the available next action such as switching mode or revising the request

#### Scenario: disabled send explains configuration loading

- **WHEN** model, provider, workspace, or selection configuration is still loading or invalid
- **THEN** Composer MUST display that configuration state as the disabled reason
- **AND** it MUST NOT send using stale or mismatched target labels

### Requirement: request_user_input Composer Pointer MUST Stay Lightweight

Composer MAY display request_user_input status, but it MUST remain a pointer to the message-surface card rather than a second form implementation.

#### Scenario: pending request shows jump action

- **WHEN** an actionable request_user_input is pending
- **THEN** Composer MUST indicate that the agent is waiting for user input
- **AND** it SHOULD provide a jump, focus, or locate action for the message-surface request card

#### Scenario: settled request does not block send

- **WHEN** request_user_input is submitted, timed out, dismissed, cancelled, or stale
- **THEN** Composer MUST NOT continue blocking normal input because of that request
- **AND** any Composer hint MUST describe it as settled or obsolete

#### Scenario: Composer does not duplicate request form semantics

- **WHEN** request_user_input requires a structured response
- **THEN** the message surface MUST remain the primary form interaction
- **AND** Composer MUST NOT create a second independent submission path for the same request

### Requirement: Composer Readiness UI MUST Respect Component Responsibility Boundaries

Composer readiness UX MUST avoid adding new large business-logic branches to existing presentation-heavy components.

#### Scenario: large components consume derived props

- **WHEN** `Composer`, `ChatInputBox`, `ChatInputBoxAdapter`, `ButtonArea`, or `ContextBar` renders readiness information
- **THEN** it SHOULD receive derived props or a readiness view model
- **AND** it SHOULD NOT introduce large new branches that recompute queue, runtime, request, or target semantics

#### Scenario: focused tests cover derived helpers

- **WHEN** new readiness, context summary, disabled reason, or request pointer logic is introduced
- **THEN** focused tests MUST cover the derived helper or selector
- **AND** UI tests SHOULD verify that presentation components render the derived result without duplicating business rules

