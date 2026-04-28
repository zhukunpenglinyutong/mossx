## MODIFIED Requirements

### Requirement: Tiered Refactor Queue Governance
The system SHALL resolve each scanned file against an ordered set of governance policies and use the matched policy to determine thresholds, refactor priority, and staged modularization order.

#### Scenario: Domain-aware policy resolution
- **WHEN** a file is evaluated by the large-file governance scanner
- **THEN** the scanner MUST assign the file to exactly one governance policy based on its repo-relative path
- **AND** the matched policy MUST define warn threshold, fail threshold, and priority tier used in output and gate decisions

#### Scenario: Default policy fallback
- **WHEN** a file does not match any specialized governance policy
- **THEN** the scanner MUST evaluate it using the default governance policy
- **AND** the file MUST still receive a deterministic threshold and priority classification

#### Scenario: P0 and P1 near-threshold staged queue
- **WHEN** a file is classified as P0 or P1 and its line count exceeds the matched warn threshold
- **THEN** the file MUST be eligible for a staged modularization queue before it reaches the fail threshold
- **AND** the queue MUST sort work by priority tier, remaining headroom to fail threshold, and hot-path risk
- **AND** P2 test or i18n files MUST NOT displace P0/P1 runtime, feature-hotpath, or style files unless an explicit deferral rationale is recorded

#### Scenario: Coherent implementation batch scope
- **WHEN** a staged modularization batch is selected from the P0/P1 queue
- **THEN** the batch MUST declare one coherent code area, runtime module, feature surface, or stylesheet cascade area before code is moved
- **AND** unrelated hot paths MUST NOT be combined in the same implementation batch solely because they share near-threshold status
- **AND** TypeScript and CSS files MAY share a batch only when they belong to the same UI surface and the stylesheet cascade order is part of the same compatibility contract

### Requirement: Incremental Modularization with Facade Preservation
The system SHALL require incremental extraction behind compatibility facades for oversized or near-threshold P0/P1 files.

#### Scenario: Feature-preserving extraction
- **WHEN** a queued oversized file is refactored
- **THEN** external imports/command contracts MUST remain compatible for that batch
- **AND** behavior parity checks MUST pass before batch completion

#### Scenario: Compatibility facade preservation
- **WHEN** Rust, TypeScript, or CSS code is extracted from a queued P0/P1 file
- **THEN** the original entry file MUST keep public exports, command registration, hook/component entrypoints, or stylesheet import behavior compatible for the same batch
- **AND** callers MUST NOT be required to change Tauri command names, payload shapes, persisted state fields, CSS selectors, i18n keys, or public import paths solely because of the split

#### Scenario: Cross-platform module extraction
- **WHEN** a queued file is split into new modules or stylesheets
- **THEN** new file names MUST avoid case-only distinctions and MUST follow the existing repo naming style for that directory
- **AND** Rust path handling introduced by the split MUST use `Path`, `PathBuf`, or `join` instead of hard-coded `/` or `\\`
- **AND** runtime behavior introduced by the split MUST NOT depend on POSIX-only shell syntax, platform-specific newline assumptions, or macOS-only filesystem case-insensitivity

#### Scenario: Per-batch validation matrix
- **WHEN** a staged modularization batch is completed
- **THEN** the batch MUST run `npm run check:large-files:gate`
- **AND** the batch MUST run targeted Rust tests, Vitest tests, typecheck, or CSS/UI verification that correspond to the files touched
- **AND** the validation evidence MUST include public symbol or selector checks when a facade is expected to preserve compatibility

### Requirement: Completion Criteria for Governance Milestones
The system SHALL define measurable completion criteria for the Deferred + JIT governance mode and for staged P0/P1 modularization batches.

#### Scenario: Deferred strategy review
- **WHEN** governance review is performed
- **THEN** review MUST include hard-gate violations count, JIT remediation outcomes, and unresolved risk list
- **AND** retained near-threshold files MAY be documented as watchlist items without mandatory decomposition plan

#### Scenario: Staged P0/P1 split completion review
- **WHEN** a P0/P1 modularization batch is marked complete
- **THEN** the review MUST list the original line count, final line count, matched policy, warn threshold, fail threshold, and remaining headroom for each split file
- **AND** each P0 file MUST either be reduced below warn threshold or retain at least 150 lines of fail-threshold headroom with a recorded follow-up split rationale
- **AND** each P1 file MUST retain at least 200 lines of fail-threshold headroom unless an explicit risk acceptance is documented
- **AND** no batch MAY be marked complete if it introduces new large-file hard debt
