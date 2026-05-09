## MODIFIED Requirements

### Requirement: Codex App Server Launch MUST Preserve Existing Healthy Paths

The system MUST keep the current primary Codex app-server launch behavior for macOS, Linux, Windows direct executables, and Windows wrapper launches that complete successfully, while requiring every Codex launch path to use a Codex app-server capable executable.

#### Scenario: macOS and Linux use primary launch only
- **WHEN** the system launches Codex app-server on macOS or Linux
- **AND** the resolved executable proves Codex app-server capability
- **THEN** it MUST use the existing primary launch path
- **AND** it MUST NOT trigger Windows wrapper compatibility retry

#### Scenario: macOS and Linux do not fallback to Claude
- **WHEN** the system cannot resolve a Codex app-server capable executable on macOS or Linux
- **THEN** it MUST return a Codex-specific launch error
- **AND** it MUST NOT fallback to Claude Code CLI

#### Scenario: Windows direct executable uses primary launch only
- **WHEN** the resolved Codex binary is not a `.cmd` or `.bat` wrapper on Windows
- **AND** the resolved executable proves Codex app-server capability
- **THEN** the system MUST use the existing primary launch path
- **AND** it MUST NOT trigger wrapper compatibility retry

#### Scenario: healthy Windows wrapper does not retry
- **WHEN** the resolved Codex binary is a `.cmd` or `.bat` wrapper on Windows
- **AND** the resolved executable proves Codex app-server capability
- **AND** the primary app-server launch completes initialize handshake successfully
- **THEN** the system MUST keep that primary session
- **AND** it MUST NOT perform compatibility retry

#### Scenario: non-Codex wrapper is rejected before compatibility retry
- **WHEN** the resolved Windows wrapper points to Claude Code or another non-Codex protocol
- **THEN** the system MUST reject it as not Codex app-server capable
- **AND** it MUST NOT run Codex wrapper compatibility retry against that executable

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
