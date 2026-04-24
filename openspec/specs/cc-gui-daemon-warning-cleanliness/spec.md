# cc-gui-daemon-warning-cleanliness Specification

## Purpose
Define how the repository tracks, reduces, and verifies `cc_gui_daemon` target warning debt without conflating it with GUI startup warning surfaces.
## Requirements
### Requirement: Daemon warning ownership baseline MUST be explicit

The repository MUST classify warnings emitted by `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short` before cleanup starts. Each warning family MUST be assigned to one of three ownership classes: `daemon-owned`, `shared-module warning debt`, or `intentional compatibility shim`.

#### Scenario: Baseline snapshot is captured before cleanup

- **WHEN** a new `cc_gui_daemon` warning-cleanup batch is proposed
- **THEN** the change artifacts SHALL record the current warning count and family distribution for that target
- **AND** the artifacts SHALL document which warning families are daemon-owned vs shared-module debt

#### Scenario: Ownership remains separate from GUI startup warning policy

- **WHEN** contributors review daemon warning cleanup status
- **THEN** they MUST be able to distinguish `cc_gui_daemon` warning debt from GUI `tauri dev` startup warnings
- **AND** daemon warning counts MUST NOT be reported as part of GUI startup cleanliness unless the same target is explicitly checked

### Requirement: Daemon warning cleanup MUST prefer reachability fixes over blanket allows

`cc_gui_daemon` warning remediation MUST first use one of the following strategies: remove orphaned daemon symbols, reconnect real callsites, or split desktop-only code behind a narrower compile boundary. Blanket module-level `#[allow(dead_code)]` MUST NOT be used as the default cleanup strategy.

#### Scenario: Daemon-owned warning is removed at the target boundary

- **WHEN** a warning comes from `src-tauri/src/bin/cc_gui_daemon.rs` or `src-tauri/src/bin/cc_gui_daemon/*`
- **THEN** the cleanup SHALL prefer deleting or reconnecting the unused daemon symbol
- **AND** it SHALL avoid keeping unreachable stubs unless they are part of an explicitly documented compatibility contract

#### Scenario: Shared module warning is reduced by shrinking daemon import surface

- **WHEN** a warning originates from a shared module pulled into the daemon via `#[path = ...]`
- **THEN** the cleanup SHALL first evaluate whether the daemon can import a narrower helper/core surface instead of the full desktop-oriented module
- **AND** any remaining shim MUST be justified as an intentional compatibility boundary

### Requirement: Residual daemon warnings MUST be documented and re-verifiable

If any `cc_gui_daemon` warnings remain after a cleanup batch, the residual warning set MUST be documented with its ownership, reason for retention, and validation command.

#### Scenario: Residual compatibility shim is kept intentionally

- **WHEN** the implementation retains a warning because removing it would break a required shared compatibility shim
- **THEN** the change tasks or verification notes MUST state why the shim still exists
- **AND** the retention MUST use the narrowest possible scope instead of a blanket module allow

#### Scenario: Cleanup batch verification is rerunnable

- **WHEN** a contributor wants to verify the post-cleanup daemon warning surface
- **THEN** they MUST be able to rerun `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short`
- **AND** compare the result against the documented baseline and residual-warning policy
