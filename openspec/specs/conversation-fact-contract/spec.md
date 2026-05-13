# conversation-fact-contract Specification

## Purpose
TBD - created by archiving change converge-conversation-fact-contract. Update Purpose after archive.
## Requirements
### Requirement: Conversation Surface MUST Consume Classified Conversation Facts

conversation surface MUST consume classified conversation facts instead of raw provider payload semantics when producing durable transcript rows or user-visible message rows.

#### Scenario: dialogue facts render as ordinary bubbles

- **WHEN** a normalized observation represents real user intent or real assistant answer content
- **THEN** the system MUST classify it as `dialogue`
- **AND** the render layer MAY display it as an ordinary user or assistant bubble

#### Scenario: reasoning facts render through reasoning rows

- **WHEN** a normalized observation represents model thinking, reasoning, or summary content
- **THEN** the system MUST classify it as `reasoning`
- **AND** the renderer MUST NOT reinterpret provider-specific raw carrier fields to decide whether it is reasoning

#### Scenario: tool facts render through tool cards

- **WHEN** a normalized observation represents tool execution, file changes, command output, or structured tool result
- **THEN** the system MUST classify it as `tool`
- **AND** tool presentation components MUST consume the classified tool fact instead of inferring fact identity from raw provider payload

#### Scenario: hidden control-plane facts do not enter visible transcript

- **WHEN** a normalized observation represents internal bookkeeping such as synthetic approval resume marker, queue bookkeeping, permission-mode wrapper, or `No response requested`
- **THEN** the system MUST classify it as `hidden-control-plane`
- **AND** it MUST NOT appear as an ordinary user or assistant message

#### Scenario: user-readable control events render compactly

- **WHEN** a normalized observation represents a user-actionable control event such as `modeBlocked`, resume failure, interruption, runtime recovery, or model switch
- **THEN** the system MUST classify it as `control-event`
- **AND** it MUST render as a compact status/control row rather than assistant prose

### Requirement: Message Text Normalization MUST Strip Source-Specific Wrappers Conservatively

message text normalization MUST remove known source-specific wrappers before semantic comparison, while preserving ordinary user and assistant content.

#### Scenario: user visible intent excludes injected context wrappers

- **WHEN** a user message contains project memory, selected-agent prompt, shared-session sync, note-card context, or mode fallback wrappers
- **THEN** normalization MUST strip those wrappers for user-visible semantic comparison
- **AND** the user bubble MUST preserve the actual user-authored intent

#### Scenario: ordinary user text that resembles a marker is preserved

- **WHEN** user-authored text merely mentions marker-like words without matching a known injected wrapper contract
- **THEN** normalization MUST NOT remove that text
- **AND** the visible transcript MUST preserve the user-authored content

#### Scenario: assistant visible text excludes synthetic resume bookkeeping

- **WHEN** assistant or history text contains Claude approval resume markers, permission bookkeeping, file-history snapshot markers, or `No response requested`
- **THEN** normalization MUST remove those internal control-plane fragments from assistant visible text
- **AND** the removed fragments MUST NOT appear as ordinary assistant prose

#### Scenario: assistant duplicate replay is collapsed without deleting distinct answers

- **WHEN** stream delta, completed snapshot, or history hydrate provide equivalent assistant text for the same turn
- **THEN** normalization and semantic equivalence MUST collapse them into one assistant fact
- **AND** different turns with similar text MUST remain distinct

### Requirement: Control-Plane Filtering MUST Be Explicit And Auditable

control-plane filtering MUST use explicit fact classification and MUST avoid renderer-local string guessing.

#### Scenario: renderer consumes visibility decisions

- **WHEN** `Messages` or `MessagesRows` receives conversation items
- **THEN** those items MUST already carry visibility semantics such as visible, hidden, compact, or presentation-only
- **AND** the renderer MUST NOT independently parse raw provider markers to decide transcript truth

#### Scenario: unknown payload uses legacy-safe fallback

- **WHEN** a provider payload cannot be classified with enough confidence
- **THEN** the system MUST preserve it through a legacy-safe visible or diagnostic path
- **AND** MUST NOT silently drop it as hidden control-plane

#### Scenario: debug evidence exists for hidden control-plane

- **WHEN** a payload is hidden as internal control-plane
- **THEN** the classification path SHOULD retain debug evidence sufficient for focused tests or diagnostics
- **AND** user-visible transcript MUST remain free of the hidden marker

### Requirement: request_user_input MUST Have A Settled Lifecycle

`request_user_input` facts MUST use an explicit lifecycle and settled requests MUST NOT block later conversation turns.

#### Scenario: active request remains pending until user or system settlement

- **WHEN** an agent asks for user input and the request is still actionable
- **THEN** the request MUST be represented as pending
- **AND** the message surface MAY show the interactive request card

#### Scenario: submitted request stops blocking input

- **WHEN** the user submits a response to `request_user_input`
- **THEN** the request MUST transition to submitted
- **AND** it MUST NOT continue blocking Composer or later sends

#### Scenario: timeout request stops blocking input

- **WHEN** a pending `request_user_input` expires
- **THEN** the request MUST transition to timeout or stale
- **AND** it MUST NOT continue blocking Composer or later sends

#### Scenario: dismissed request preserves transcript evidence

- **WHEN** the user dismisses a stale or obsolete request card
- **THEN** the request MUST transition to dismissed
- **AND** dismissing it MUST NOT delete durable transcript facts that already occurred

#### Scenario: cancelled request is settled

- **WHEN** runtime cancellation or turn termination cancels a pending request
- **THEN** the request MUST transition to cancelled
- **AND** it MUST NOT remain as an actionable request card

### Requirement: Messages Render Boundary MUST Stay Presentation-Focused

message render components MUST consume normalized conversation facts and MUST NOT become a second provider payload interpretation layer.

#### Scenario: MessagesRows renders by normalized item type

- **WHEN** `MessagesRows` renders conversation rows
- **THEN** it MUST choose row components from normalized fact or item type
- **AND** it MUST NOT introduce new provider raw payload parsing branches

#### Scenario: Messages owns layout state but not fact classification

- **WHEN** `Messages` manages scroll, sticky behavior, live controls, approval slots, or input request slots
- **THEN** it MAY own presentation state
- **AND** it MUST NOT own canonical provider payload classification rules

#### Scenario: tool grouping does not decide transcript truth

- **WHEN** tool grouping or tool block presentation processes conversation items
- **THEN** it MAY group or format already-classified tool facts
- **AND** it MUST NOT decide whether raw provider payload is dialogue, tool, or hidden control-plane

