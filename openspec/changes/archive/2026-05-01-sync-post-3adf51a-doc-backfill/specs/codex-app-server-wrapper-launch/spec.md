## MODIFIED Requirements

### Requirement: Codex Doctor MUST Align With App Server Launch Compatibility

Codex doctor and app-server launch discovery MUST include bounded Windows user-local CLI fallback before reporting Codex as unavailable.

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
