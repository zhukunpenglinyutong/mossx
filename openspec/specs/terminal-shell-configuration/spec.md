# terminal-shell-configuration Specification

## Purpose

Define the built-in terminal shell path override contract across settings UI, persisted app settings, and backend terminal launch fallback.
## Requirements
### Requirement: Built-In Terminal MUST Support Optional Shell Path Override

系统 MUST allow users to configure an optional executable path used when opening the built-in terminal. The override MUST be app-level and MUST NOT require changing workspace settings.

#### Scenario: configured shell path is used for new terminals

- **WHEN** `terminalShellPath` is a non-empty value after trimming
- **AND** the user opens a built-in terminal
- **THEN** the backend MUST spawn the PTY command with that trimmed shell path
- **AND** the configured path MUST be allowed to contain spaces

#### Scenario: blank shell path preserves platform fallback

- **WHEN** `terminalShellPath` is missing, null, or blank after trimming
- **AND** the user opens a built-in terminal
- **THEN** the backend MUST use the existing platform fallback
- **AND** Windows MUST continue to prefer `COMSPEC` before `cmd.exe`
- **AND** non-Windows platforms MUST continue to prefer `SHELL` before `/bin/zsh`

#### Scenario: settings UI persists trimmed shell path

- **WHEN** the user enters a terminal shell path with leading or trailing whitespace and saves
- **THEN** app settings MUST persist the trimmed path
- **AND** clearing the input MUST persist an empty override rather than an empty executable command

#### Scenario: settings copy includes concrete shell path examples

- **WHEN** the terminal shell path setting is shown
- **THEN** user-facing helper copy SHALL include concrete examples for common shells where appropriate
- **AND** the examples SHALL remain guidance only, not validation requirements

#### Scenario: example copy does not change fallback semantics

- **WHEN** a user leaves the setting blank after reading examples
- **THEN** terminal launch SHALL continue to use platform fallback behavior
- **AND** no example path SHALL be implicitly persisted

### Requirement: Terminal Shell Extraction MUST Preserve Platform Fallback Semantics
第一阶段涉及 terminal shell path 或 launch helper 的抽取 MUST 保持既有平台 fallback 行为稳定。

#### Scenario: extraction preserves blank-path platform fallback
- **WHEN** terminal shell path helper、settings adapter 或 terminal launch path 被拆分到新模块
- **THEN** 空 shell path 时的 Windows 与非 Windows fallback MUST 保持不变
- **AND** 抽取 MUST NOT 隐式持久化示例路径或 platform-specific default path

#### Scenario: extraction preserves path-with-spaces behavior
- **WHEN** terminal shell 相关实现被 facade 或 adapter 收敛
- **THEN** 含空格的 shell path MUST 继续可用
- **AND** Windows 与 macOS 的 quoting / spawn 语义 MUST 保持兼容

