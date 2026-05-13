# codex-app-server-wrapper-launch Delta

## MODIFIED Requirements

### Requirement: Codex App Server Launch MUST Preserve Existing Healthy Paths

The system MUST keep the current primary Codex app-server launch behavior for macOS, Linux, Windows direct executables, and Windows wrapper launches that complete successfully, while requiring every Codex launch path to use a Codex app-server capable executable. Project SessionStart hook fallback MUST NOT alter healthy primary launch behavior.

#### Scenario: healthy SessionStart hook does not trigger fallback

- **WHEN** the system launches Codex app-server for a workspace with project `.codex/hooks.json`
- **AND** the primary app-server launch completes initialize
- **AND** `thread/start` returns a parseable `thread.id`
- **THEN** the system MUST keep the primary session
- **AND** it MUST NOT restart runtime in hook-safe fallback mode
- **AND** it MUST NOT show a hook skipped warning

## ADDED Requirements

### Requirement: Codex App Server Creation MUST Treat SessionStart Hook As Recoverable Enhancement

The system MUST treat project SessionStart hook execution as an enhancement to Codex thread context, not as a hard dependency that can permanently block ccgui session creation.

#### Scenario: hook failure triggers bounded hook-safe fallback

- **WHEN** a user creates a Codex session through ccgui
- **AND** the primary `thread/start` fails because project SessionStart hook execution fails, times out, is denied, or otherwise prevents thread creation
- **THEN** the system MUST attempt at most one hook-safe fallback for that create-session request
- **AND** the fallback MUST launch or replace the Codex runtime with project SessionStart hooks disabled or skipped
- **AND** the fallback MUST preserve user-authored Codex binary, args, CODEX_HOME, and workspace cwd unless those values are the source of the failure

#### Scenario: missing thread id triggers hook-safe fallback

- **WHEN** primary `thread/start` returns successfully at the transport layer
- **AND** the response does not contain a parseable thread id in any supported response shape
- **THEN** the system MUST classify the result as `invalid_thread_start_response`
- **AND** it MUST attempt one hook-safe fallback before surfacing the empty-thread-id error to the frontend

#### Scenario: fallback success creates usable session

- **WHEN** primary create-session fails due to hook-related failure or invalid `thread/start` response
- **AND** hook-safe fallback returns a parseable thread id
- **THEN** the system MUST return the fallback thread to the frontend as the created Codex session
- **AND** the user MUST be able to continue using the session normally
- **AND** the system MUST mark the session or runtime diagnostics as created through hook-safe fallback

#### Scenario: fallback failure keeps both attempts diagnosable

- **WHEN** primary create-session fails
- **AND** hook-safe fallback also fails
- **THEN** the final user-facing error MUST include both primary and fallback failure summaries
- **AND** it MUST NOT collapse the result into a generic "runtime did not return a new session id" message alone

### Requirement: Hook-Safe Fallback MUST Be User-Visible

When hook-safe fallback succeeds, the system MUST tell the user and the new Codex session that project hook context was skipped.

#### Scenario: fallback success shows warning

- **WHEN** hook-safe fallback creates a new Codex session
- **THEN** the frontend MUST show a visible warning or runtime notice that project SessionStart hooks were skipped
- **AND** the warning MUST identify `.codex/hooks.json` or project SessionStart hooks as the configuration to inspect

#### Scenario: fallback session receives context warning

- **WHEN** hook-safe fallback creates a new Codex thread
- **THEN** the created session SHOULD receive a short injected notice explaining that project SessionStart hooks were skipped because they blocked session creation
- **AND** the notice MUST avoid exposing internal debug details unless the user asks for them

### Requirement: Hook-Safe Fallback MUST Be Testable

The system MUST include targeted tests that lock hook-safe fallback behavior and protect healthy Codex app-server paths from regression.

#### Scenario: backend tests cover invalid thread start response

- **WHEN** backend tests simulate `thread/start` returning without a parseable thread id
- **THEN** they MUST verify one hook-safe fallback attempt is made
- **AND** they MUST verify fallback is not retried unboundedly

#### Scenario: backend tests cover healthy path

- **WHEN** backend tests simulate primary `thread/start` returning a parseable thread id
- **THEN** they MUST verify hook-safe fallback is not attempted

#### Scenario: frontend tests cover fallback notice

- **WHEN** frontend tests simulate a fallback-created Codex session or equivalent backend notice
- **THEN** they MUST verify the user sees a warning that SessionStart hooks were skipped
