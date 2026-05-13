# codex-app-server-wrapper-launch Specification

## Purpose

Define Codex app-server launch behavior for Windows command wrappers, internal launch config injection, compatibility retry, probe/doctor diagnostics, and non-wrapper regression protection.
## Requirements
### Requirement: Codex App Server Launch MUST Preserve Existing Healthy Paths

The system MUST keep the current primary Codex app-server launch behavior for macOS, Linux, Windows direct executables, and Windows wrapper launches that complete successfully, while requiring every Codex launch path to use a Codex app-server capable executable. Project SessionStart hook fallback MUST NOT alter healthy primary launch behavior.

#### Scenario: healthy SessionStart hook does not trigger fallback

- **WHEN** the system launches Codex app-server for a workspace with project `.codex/hooks.json`
- **AND** the primary app-server launch completes initialize
- **AND** `thread/start` returns a parseable `thread.id`
- **THEN** the system MUST keep the primary session
- **AND** it MUST NOT restart runtime in hook-safe fallback mode
- **AND** it MUST NOT show a hook skipped warning

### Requirement: Windows Wrapper Failure MUST Use Bounded Compatibility Retry

When Windows `.cmd/.bat` wrapper launch fails before Codex app-server initialization completes, the system MUST attempt a bounded compatibility retry that avoids known fragile wrapper argument combinations.

#### Scenario: wrapper primary fails before initialize
- **WHEN** the resolved Codex binary is a `.cmd` or `.bat` wrapper on Windows
- **AND** the primary app-server launch exits, closes stdout, or fails initialize before the session becomes connected
- **THEN** the system MUST attempt at most one compatibility retry for that launch request
- **AND** retry diagnostics MUST retain the primary failure summary

#### Scenario: compatibility retry avoids fragile internal quoted config
- **WHEN** compatibility retry is attempted for a Windows wrapper launch
- **THEN** the retry MUST avoid sending the internal `developer_instructions` quoted TOML config argument through `cmd.exe /c <wrapper>`
- **AND** user-provided Codex args MUST still be preserved unless they are invalid

#### Scenario: retry success creates usable session
- **WHEN** primary Windows wrapper launch fails before initialize
- **AND** compatibility retry completes initialize handshake successfully
- **THEN** the system MUST create a usable Codex workspace session
- **AND** runtime diagnostics SHOULD indicate that fallback was retried

#### Scenario: retry success suppresses primary pre-connect failure events
- **WHEN** primary Windows wrapper launch emits startup failure events before initialize completes
- **AND** compatibility retry completes initialize handshake successfully
- **THEN** the system MUST NOT emit the primary attempt's pre-connect `runtime/ended` or stderr events to the user-facing app-server stream
- **AND** the connected retry session MUST remain the only user-visible startup outcome

#### Scenario: retry failure keeps both errors diagnosable
- **WHEN** primary Windows wrapper launch fails
- **AND** compatibility retry also fails
- **THEN** the user-facing error detail MUST include both the primary failure and fallback failure summaries
- **AND** it MUST NOT collapse the result into a generic unknown startup failure

### Requirement: Internal Spec Priority Hint MUST NOT Block Codex Session Creation

The system MUST treat the internally injected external spec priority hint as a launch enhancement, not as a hard dependency that can prevent Codex app-server session creation on Windows wrapper environments.

#### Scenario: internal hint causes wrapper parse failure
- **WHEN** a Windows `.cmd/.bat` wrapper primary launch fails because the internal `developer_instructions` config argument is parsed incorrectly
- **THEN** compatibility retry MUST be allowed to create the session without that fragile internal CLI argument
- **AND** the fallback MUST NOT remove or mutate user-authored `codexArgs`

#### Scenario: user instruction override remains respected
- **WHEN** user-provided `codexArgs` already include `developer_instructions` or `instructions`
- **THEN** the system MUST continue to respect the existing override detection
- **AND** compatibility retry MUST NOT inject a competing internal instructions config

### Requirement: Codex Doctor MUST Align With App Server Launch Compatibility

Codex doctor and app-server probe MUST model the key app-server launch risks closely enough to detect Windows wrapper compatibility failures before or during session creation, and MUST distinguish Codex missing/capability failures from Claude CLI availability.

#### Scenario: doctor reports wrapper launch context
- **WHEN** Codex doctor runs for a Windows wrapper-resolved binary
- **THEN** the result MUST include the resolved binary path and wrapper kind
- **AND** it MUST expose whether app-server probe fallback was retried

#### Scenario: probe covers internal launch suffix risk
- **WHEN** app-server probe evaluates Codex app-server availability
- **THEN** it MUST cover the same internal app-server launch suffix risk that real session creation uses
- **OR** it MUST expose that compatibility fallback was required to make the probe pass

#### Scenario: installation errors remain visible
- **WHEN** Codex CLI is missing, Node is unavailable, PATH resolution fails, or `codex app-server --help` fails independently of wrapper compatibility
- **THEN** doctor MUST expose the underlying failure detail
- **AND** compatibility retry MUST NOT report the environment as healthy solely because a fallback path was attempted

#### Scenario: Claude availability does not satisfy Codex doctor
- **WHEN** Claude Code CLI is installed but Codex CLI is missing or not app-server capable
- **THEN** Codex doctor MUST report Codex as unavailable
- **AND** it MUST NOT mark Codex healthy because Claude Code CLI is launchable

#### Scenario: Windows user-local CLI installs are searched before reporting missing CLI
- **WHEN** Codex app-server discovery runs on Windows
- **AND** the executable is not found through the normal PATH lookup
- **THEN** discovery SHALL inspect supported user-local install locations before reporting Codex as missing
- **AND** diagnostics SHALL identify whether the resolved executable came from PATH or a user-local fallback
- **AND** wrapper compatibility checks SHALL still apply when the fallback resolves to a `.cmd` or `.bat` wrapper

#### Scenario: user-local install fallback remains bounded
- **WHEN** user-local lookup fails or finds an unusable candidate
- **THEN** doctor SHALL preserve the original missing/unusable CLI diagnostic
- **AND** discovery SHALL NOT silently mark the environment healthy

### Requirement: Wrapper Compatibility MUST Be Testable

The system MUST include targeted backend tests that lock the wrapper fallback contract and protect non-wrapper paths from accidental behavior changes.

#### Scenario: wrapper fallback gating is covered
- **WHEN** backend tests exercise Windows wrapper launch planning or equivalent platform-gated helpers
- **THEN** they MUST verify that `.cmd/.bat` wrapper failures are eligible for bounded compatibility retry
- **AND** direct executable launches are not eligible

#### Scenario: internal hint fallback is covered
- **WHEN** backend tests exercise compatibility retry planning
- **THEN** they MUST verify that the retry avoids the fragile internal quoted config argument
- **AND** preserves user-provided Codex args

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
