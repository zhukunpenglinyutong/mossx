# engine-opencode-command-surface-compatibility Specification

## Purpose

Defines the engine-opencode-command-surface-compatibility behavior contract, covering Engine OpenCode Command Surface Extraction Compatibility.

## Requirements
### Requirement: Engine OpenCode Command Surface Extraction Compatibility
The system SHALL preserve the effective OpenCode engine command contract and cleanup behavior when the OpenCode command surface is moved out of `engine/commands.rs` into a dedicated submodule.

#### Scenario: Existing OpenCode commands keep the same outward entry points
- **WHEN** OpenCode commands are extracted into `commands_opencode.rs`
- **THEN** callers through `crate::engine::*` and `command_registry.rs` MUST continue using the same effective function names without migration for that extraction batch
- **AND** the extraction MUST NOT change parameter meaning or returned `Result<_, String>` semantics

#### Scenario: Extracted OpenCode commands preserve command behavior
- **WHEN** a caller lists OpenCode commands or agents, manages sessions, reads provider health, toggles MCP state, or requests OpenCode LSP data after modularization
- **THEN** the system MUST preserve the same CLI invocation flow, parsing behavior, fallback handling, and error semantics as before extraction
- **AND** failure paths MUST remain deterministic and recoverable

#### Scenario: Workspace cleanup can still clear OpenCode MCP toggle state
- **WHEN** workspace lifecycle code clears OpenCode auxiliary state after modularization
- **THEN** the system MUST continue clearing the per-workspace MCP toggle cache without requiring caller migration
- **AND** the extraction MUST NOT leave stale MCP toggle state for disconnected workspaces

