# tauri-dev-warning-cleanliness Specification

## Purpose

Defines the tauri-dev-warning-cleanliness behavior contract, covering Repo-owned startup warnings are governed separately from environment-owned warnings.

## Requirements
### Requirement: Repo-owned startup warnings are governed separately from environment-owned warnings

The system SHALL distinguish between warnings emitted by repository-owned startup code and warnings emitted by user-local tooling configuration when developers run `npm run tauri dev`.

#### Scenario: startup warnings are classified by ownership

- **WHEN** a developer captures `npm run tauri dev` startup logs
- **THEN** the warning inventory MUST distinguish `repo-owned` warnings from `environment-owned` warnings
- **AND** only `repo-owned` warnings SHALL count as repository warning debt

### Requirement: Tauri frontend bootstrap avoids repository-owned duplicate npm warning amplification

The system SHALL start the frontend dev server for `tauri dev` without introducing extra nested `npm run ...` layers that duplicate the same npm config warning multiple times.

#### Scenario: before-dev frontend bootstrap runs

- **WHEN** Tauri executes its frontend bootstrap before launching the Rust app
- **THEN** the bootstrap path MUST avoid repository-owned repeated npm warning amplification
- **AND** the Vite dev server MUST still be reachable through the configured `devUrl`

### Requirement: Repo-owned Rust startup warnings are reduced through code cleanup or tighter compile boundaries

The system SHALL reduce Rust `dead_code` / `unused` warnings surfaced during default `tauri dev` startup by removing orphaned code, reconnecting active code paths, or narrowing compile boundaries.

#### Scenario: Rust startup warning groups are remediated

- **WHEN** a warning group in `src-tauri/src/**` is selected for cleanup
- **THEN** the repository MUST prefer remove / reconnect / split-by-platform fixes over blanket module-level `#[allow(dead_code)]`
- **AND** any residual narrow `allow` MUST be justified as an intentional compatibility boundary

### Requirement: Residual environment-owned warning expectations remain explicit

The system SHALL document or report when a warning can only be cleared from the developer's local environment rather than from repository code.

#### Scenario: top-level npm config warning persists after repo cleanup

- **WHEN** `npm run tauri dev` still shows a top-level npm unknown-config warning sourced from local user configuration
- **THEN** the repository validation guidance MUST mark that warning as environment-owned
- **AND** the repo cleanup status MUST not treat it as an unresolved code regression

