## ADDED Requirements

### Requirement: Windows OpenCode Resolution MUST Avoid Foreground-Activating Candidates

On Windows, the system MUST distinguish a background-safe OpenCode CLI candidate from launcher-like candidates that can activate a foreground desktop window.

#### Scenario: safe Windows CLI candidate is allowed

- **WHEN** OpenCode discovery runs on Windows
- **AND** the resolved candidate can be probed through a background-safe CLI path
- **THEN** the system MUST allow installation detection and subsequent OpenCode command construction to use that candidate

#### Scenario: launcher-like Windows candidate is rejected before probe

- **WHEN** OpenCode discovery or readiness probe runs on Windows
- **AND** the resolved candidate is identified as launcher-like or otherwise unsafe for background probing
- **THEN** the system MUST reject that candidate before running the high-risk probe or readiness command
- **AND** the system MUST NOT activate an external foreground OpenCode window as part of that detection path

### Requirement: Unsafe Windows OpenCode Candidate MUST Return Stable Diagnostics

When Windows resolves an OpenCode candidate that is not safe for CLI probing, the system MUST return a stable and diagnosable failure instead of silently treating it as a healthy CLI.

#### Scenario: unsafe candidate returns explicit diagnostic

- **WHEN** Windows OpenCode status detection encounters an unsafe candidate
- **THEN** the system MUST return a readable diagnostic describing that the resolved OpenCode binary is not safe for background CLI probing
- **AND** the result MUST remain distinguishable from a plain "not installed" state

#### Scenario: manual refresh preserves diagnosability

- **WHEN** the user explicitly triggers an OpenCode refresh on Windows
- **AND** the resolved candidate is unsafe
- **THEN** the system MUST return the same stable diagnostic contract
- **AND** it MUST NOT fall through to launcher execution as a fallback

### Requirement: Windows OpenCode Guard MUST NOT Change Healthy Non-Target Paths

The Windows OpenCode safety guard MUST be isolated so that healthy paths for other platforms and other engines remain unchanged.

#### Scenario: non-Windows OpenCode path stays unchanged

- **WHEN** OpenCode discovery or readiness runs on macOS or Linux
- **THEN** the system MUST continue using the existing healthy OpenCode path
- **AND** it MUST NOT apply the Windows launcher safety guard

#### Scenario: non-OpenCode engines stay unchanged

- **WHEN** Claude, Codex, or Gemini detection and readiness paths run on any platform
- **THEN** the system MUST continue using their existing discovery and launch behavior
- **AND** OpenCode-specific Windows safety logic MUST NOT alter their result
