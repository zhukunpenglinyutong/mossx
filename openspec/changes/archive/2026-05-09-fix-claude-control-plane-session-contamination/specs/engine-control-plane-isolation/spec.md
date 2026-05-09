## ADDED Requirements

### Requirement: Engine Control Plane MUST Be Isolated By Runtime Capability

The system MUST route each engine's control-plane protocol only to a runtime that proves the required capability for that engine.

#### Scenario: Codex app-server payload is sent only to Codex app-server capable runtime
- **WHEN** the system starts a Codex workspace session
- **THEN** it MUST verify that the resolved executable supports Codex `app-server`
- **AND** it MUST NOT send Codex JSON-RPC `initialize` payloads to a Claude Code CLI process

#### Scenario: Claude CLI is not a Codex fallback
- **WHEN** the Codex executable is missing or unusable
- **THEN** the system MUST return a Codex-specific launch error
- **AND** it MUST NOT fallback to `claude`, Claude Code CLI, or another non-Codex engine executable

#### Scenario: custom binary must prove Codex app-server capability
- **WHEN** a user configures a custom Codex executable
- **THEN** the system MUST validate Codex app-server capability on that executable before using it for a Codex session
- **AND** a custom executable that only supports Claude Code behavior MUST be rejected for Codex launch

### Requirement: Platform Boundary MUST Preserve The Same Engine Identity Rules

The system MUST apply the same engine identity rules on Windows, macOS, and Linux while keeping platform-specific launch mechanics isolated.

#### Scenario: macOS and Linux direct binaries still require Codex capability
- **WHEN** the system resolves a direct Codex binary on macOS or Linux
- **THEN** it MUST still verify Codex app-server capability before launch
- **AND** it MUST NOT skip identity validation because the platform does not use `.cmd` or `.bat` wrappers

#### Scenario: Windows wrapper compatibility remains Codex-only
- **WHEN** the resolved executable is a Windows `.cmd` or `.bat` wrapper
- **THEN** wrapper compatibility retry MUST only apply after the executable is accepted as Codex app-server capable
- **AND** a Claude wrapper MUST NOT be treated as a Codex wrapper solely because it is launchable

#### Scenario: proxy or PATH hijack is handled by capability rather than name guessing
- **WHEN** PATH or a custom binary resolves to a proxy executable
- **THEN** the proxy MUST be accepted only if it supports Codex app-server behavior
- **AND** it MUST be rejected for Codex launch if it forwards to Claude Code or another non-Codex protocol

### Requirement: Contaminated Control Plane Transcripts MUST Be Classified And Contained

The system MUST classify Codex control-plane payloads that appear in Claude history as contamination and contain them without deleting user files.

#### Scenario: control-plane-only Claude transcript is hidden
- **WHEN** a Claude history transcript contains only Codex or GUI control-plane payloads such as JSON-RPC `initialize`, `clientInfo.name=ccgui`, `capabilities.experimentalApi`, `developer_instructions`, or Codex `app-server` launch text
- **THEN** the system MUST NOT expose that transcript as a user-visible conversation
- **AND** it MUST NOT use those payloads as a session title or first user message

#### Scenario: mixed transcript preserves real conversation
- **WHEN** a Claude history transcript contains both real user conversation content and control-plane contamination
- **THEN** the system MUST filter the contaminated payloads
- **AND** it MUST preserve the real user and assistant messages

#### Scenario: contamination handling is non-destructive
- **WHEN** the system detects control-plane contamination in Claude history
- **THEN** it MUST hide or filter the contaminated entries at read time
- **AND** it MUST NOT delete or rewrite the user's original Claude JSONL transcript as part of this fix

### Requirement: Control Plane Isolation MUST Be Protected By CI Gates

The system MUST include focused validation that prevents reintroducing cross-engine control-plane contamination.

#### Scenario: backend gate covers launch identity and history contamination
- **WHEN** backend CI or release validation runs for this change
- **THEN** it MUST include focused Rust tests proving Codex launch does not fallback to Claude
- **AND** it MUST include focused Rust tests proving control-plane-only Claude transcripts are not listed as user conversations

#### Scenario: frontend gate covers loader fallback filtering
- **WHEN** frontend CI or release validation runs for this change
- **THEN** it MUST include focused TypeScript tests proving Claude history loader filters control-plane payloads
- **AND** it MUST prove normal Claude user messages remain visible

#### Scenario: OpenSpec strict validation is required
- **WHEN** the change is considered ready for merge or release
- **THEN** `openspec validate --change fix-claude-control-plane-session-contamination --strict` MUST pass
- **AND** the validation result MUST be reported with the implementation evidence
