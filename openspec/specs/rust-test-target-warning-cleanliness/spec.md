# rust-test-target-warning-cleanliness Specification

## Purpose

Defines the rust-test-target-warning-cleanliness behavior contract, covering Rust test-target warning baseline MUST stay explicit.

## Requirements
### Requirement: Rust test-target warning baseline MUST stay explicit

The repository MUST track warnings emitted specifically by `cargo test --manifest-path src-tauri/Cargo.toml --message-format short` test targets, and MUST distinguish them from runtime or startup warning surfaces.

#### Scenario: Test-target warnings are classified separately

- **WHEN** contributors review Rust warning cleanup progress
- **THEN** they MUST be able to distinguish `lib test` and `bin "cc_gui_daemon" test` warnings from non-test Rust targets
- **AND** the change artifacts SHALL record the current test-target warning baseline

### Requirement: Test-target warning cleanup MUST prefer direct source fixes

Rust test-target warning cleanup MUST first remove unused imports, delete orphaned helpers, or narrow compile boundaries before considering any suppression.

#### Scenario: Unused import warning is removed at source

- **WHEN** a warning is caused by a test-target-only unused import
- **THEN** the cleanup SHALL remove the import instead of suppressing it globally

#### Scenario: Dead code warning is kept only with explicit justification

- **WHEN** a test-target warning cannot be removed without breaking an intentional compatibility boundary
- **THEN** any retention MUST use the narrowest possible scope
- **AND** the reason MUST be documented in the change artifacts

### Requirement: Test-target warning cleanup MUST preserve runtime behavior

Cleaning Rust test-target warnings MUST NOT change user-visible runtime behavior or break existing Rust tests.

#### Scenario: Cleanup is verified against full Rust tests

- **WHEN** a test-target warning cleanup batch is completed
- **THEN** contributors MUST be able to rerun `cargo test --manifest-path src-tauri/Cargo.toml`
- **AND** the repository SHALL pass the Rust test suite without introducing new failures

