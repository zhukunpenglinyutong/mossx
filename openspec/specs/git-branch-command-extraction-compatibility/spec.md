# git-branch-command-extraction-compatibility Specification

## Purpose

Defines the git-branch-command-extraction-compatibility behavior contract, covering Git Branch Command Extraction Compatibility.

## Requirements
### Requirement: Git Branch Command Extraction Compatibility
The system SHALL preserve the effective git branch command contract and command routing when branch lifecycle and compare commands are moved out of `git/commands.rs` into a dedicated submodule.

#### Scenario: Existing branch commands keep the same outward entry points
- **WHEN** branch lifecycle and compare commands are extracted into `commands_branch.rs`
- **THEN** callers through `crate::git::*`, `command_registry.rs`, and daemon dispatch MUST continue using the same effective function names without migration for that extraction batch
- **AND** the extraction MUST NOT change parameter meaning or returned `Result<_, String>` semantics

#### Scenario: Extracted branch commands preserve branch lifecycle behavior
- **WHEN** a caller lists branches, checks out a branch, creates/deletes/renames a branch, or triggers merge/rebase after modularization
- **THEN** the system MUST preserve the same precondition checks, git command execution flow, checkout verification, and error semantics as before extraction
- **AND** failure paths MUST remain deterministic and recoverable

#### Scenario: Extracted compare commands preserve diff semantics
- **WHEN** a caller requests branch compare commits, branch-to-branch diffs, or worktree-against-branch diffs after modularization
- **THEN** the system MUST preserve the same diff parsing, empty-input guards, and returned payload shape as before extraction
- **AND** the extraction MUST NOT alter command registry names or daemon dispatch keys

