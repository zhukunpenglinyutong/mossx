## ADDED Requirements

### Requirement: Tauri Bridge Contract Changes MUST Be Checklist-Gated

Any implementation batch in this change that touches frontend Tauri facades, Rust command handlers, command registration, or command payloads MUST record a bridge contract checklist.

#### Scenario: touched command keeps frontend facade compatibility

- **WHEN** a touched command is invoked through `src/services/tauri.ts` or a domain submodule re-exported by that facade
- **THEN** existing exported function and type names MUST remain available unless the proposal explicitly authorizes migration
- **AND** callers MUST NOT be required to change import paths as part of this stabilization batch

#### Scenario: touched command preserves command registration semantics

- **WHEN** a Rust command handler or `command_registry.rs` entry is moved, wrapped, or refactored
- **THEN** the registered Tauri command name MUST remain available
- **AND** argument names and successful response semantics MUST remain backward-compatible

#### Scenario: touched command records error contract impact

- **WHEN** bridge error propagation changes for a touched command
- **THEN** the implementation MUST record whether existing frontend error mapping remains valid
- **AND** user-facing behavior MUST NOT regress from structured or recoverable diagnostics to raw unclassified text
