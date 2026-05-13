# composer-queue-input-state Specification

## Purpose
TBD - created by archiving change improve-composer-send-readiness-ux. Update Purpose after archive.
## Requirements
### Requirement: Composer MUST Present A Unified Input Activity State

Composer MUST present current input activity through a unified state vocabulary so users can distinguish running, waiting, streaming, queued, fusing, blocked, and user-input-waiting states.

#### Scenario: processing state indicates an active turn

- **WHEN** a turn is executing and can be stopped or queued behind
- **THEN** Composer MUST present `processing` or an equivalent active-running state
- **AND** the primary or secondary action MUST match the actual stop/queue capability

#### Scenario: waiting state differs from ingress state

- **WHEN** the request has been accepted but no stream output is visible yet
- **THEN** Composer SHOULD present a waiting state
- **AND** once output is actively streaming into the conversation, Composer SHOULD present an ingress or streaming state when this distinction is available

#### Scenario: blocked state includes next action

- **WHEN** input is blocked by runtime lifecycle, modeBlocked, pending configuration, or request constraints
- **THEN** Composer MUST present `blocked` or equivalent activity
- **AND** it MUST include a next-action hint when one is available

#### Scenario: awaitingUserInput points to the active request

- **WHEN** the agent is waiting on an active request_user_input
- **THEN** Composer MUST present `awaitingUserInput` or equivalent activity
- **AND** it SHOULD provide a jump or focus action for the relevant request card

### Requirement: Queue And Fuse Status MUST Match Actual Send Semantics

Composer MUST describe queued and fusing messages according to actual queued-send semantics, not optimistic UI guesses.

#### Scenario: queued message is visible as queued

- **WHEN** the user submits a follow-up while the current turn cannot immediately accept it
- **AND** the message is accepted into the queue
- **THEN** Composer MUST present a queued state or queue item
- **AND** it MUST NOT imply the message has already been processed by the provider

#### Scenario: fusing state is only shown during a real fusion attempt

- **WHEN** the system is actively attempting to fuse a queued message into the active turn
- **THEN** Composer MAY present a fusing state
- **AND** it MUST NOT show fusing when the system is merely queued, waiting, or unable to fuse

#### Scenario: cannot-fuse explains fallback behavior

- **WHEN** a queued message cannot be fused because the engine, mode, runtime, or timing does not support it
- **THEN** Composer SHOULD explain that the message will remain queued, send later, or require user action
- **AND** it MUST NOT promise interruption or fusion that will not occur

#### Scenario: fusion timeout settles visibly

- **WHEN** a fusion attempt times out or fails
- **THEN** Composer MUST settle the visible state to queued, failed, blocked, or sent-later according to actual outcome
- **AND** it MUST NOT remain indefinitely in fusing

### Requirement: Composer Primary Actions MUST Be Consistent With Activity State

Composer primary and secondary actions MUST align with the derived activity state and must not expose contradictory actions.

#### Scenario: idle uses send as primary action

- **WHEN** Composer is idle and the draft is valid
- **THEN** the primary action MUST be send
- **AND** stop or queue actions MUST NOT appear as primary unless the state changes

#### Scenario: active turn uses stop or queue according to capability

- **WHEN** a turn is processing, waiting, or ingressing
- **THEN** Composer MUST expose stop only if stopping is available
- **AND** it MUST expose queue only if queueing is available

#### Scenario: blocked state avoids misleading send action

- **WHEN** Composer activity is blocked
- **THEN** Composer MUST NOT present send as an available primary action
- **AND** it SHOULD present the recommended unblock action or explanation instead

