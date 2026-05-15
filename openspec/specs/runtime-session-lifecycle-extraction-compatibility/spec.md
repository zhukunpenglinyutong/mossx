# runtime-session-lifecycle-extraction-compatibility Specification

## Purpose

Defines the runtime-session-lifecycle-extraction-compatibility behavior contract, covering Runtime Session Lifecycle Extraction Compatibility.

## Requirements
### Requirement: Runtime Session Lifecycle Extraction Compatibility
The system SHALL preserve the effective workspace session lifecycle behavior and outward runtime helper surface when lifecycle helpers are moved out of `runtime/mod.rs` into a dedicated submodule.

#### Scenario: Existing runtime callers keep the same helper entry points
- **WHEN** runtime session lifecycle helpers are extracted into `session_lifecycle.rs`
- **THEN** callers such as `settings/mod.rs`, `shared/workspaces_core.rs`, `codex/session_runtime.rs`, and `engine/opencode.rs` MUST continue using the same effective `crate::runtime::*` helper names without import migration for that extraction batch
- **AND** the extraction MUST NOT change helper parameter meaning or returned `Result<_, String>` semantics

#### Scenario: Extracted lifecycle helpers preserve close, evict, and replacement behavior
- **WHEN** a workspace session is closed, evicted, terminated, replaced, or rolled back after modularization
- **THEN** the system MUST preserve the same runtime manager bookkeeping, replacement gate behavior, process termination path, and rollback semantics as before extraction
- **AND** failure paths MUST remain recoverable without introducing new partial-success states

#### Scenario: Extraction does not alter command or frontend contract
- **WHEN** lifecycle helpers move into a backend-local submodule
- **THEN** `#[tauri::command]` names, payload shapes, and frontend runtime mapping MUST remain unchanged
- **AND** the extraction MUST only reduce module complexity, not introduce cross-layer contract drift

