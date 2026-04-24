# large-file-modularization-governance Specification

## Purpose
TBD - created by archiving change bridge-cleanup-and-large-file-modularization. Update Purpose after archive.
## Requirements
### Requirement: Oversized File Detection Baseline
The system SHALL maintain version-traceable baseline artifacts for large-file governance, including a human-readable report and a machine-readable debt ledger keyed by the matched governance policy.

#### Scenario: Hard-debt baseline capture
- **WHEN** the large-file governance baseline scan runs for hard-debt tracking
- **THEN** every file whose line count exceeds its matched policy fail threshold MUST be recorded with path, line count, matched policy id, warn threshold, fail threshold, and priority tier
- **AND** the machine-readable baseline output MUST be committed in version control so later scans can compare debt growth

#### Scenario: Watchlist report generation
- **WHEN** the large-file governance watchlist scan runs
- **THEN** every file whose line count exceeds its matched policy warn threshold MUST be listed in the human-readable report
- **AND** the report MUST include the matched policy id and active threshold information for triage

### Requirement: Tiered Refactor Queue Governance
The system SHALL resolve each scanned file against an ordered set of governance policies and use the matched policy to determine thresholds and refactor priority.

#### Scenario: Domain-aware policy resolution
- **WHEN** a file is evaluated by the large-file governance scanner
- **THEN** the scanner MUST assign the file to exactly one governance policy based on its repo-relative path
- **AND** the matched policy MUST define warn threshold, fail threshold, and priority tier used in output and gate decisions

#### Scenario: Default policy fallback
- **WHEN** a file does not match any specialized governance policy
- **THEN** the scanner MUST evaluate it using the default governance policy
- **AND** the file MUST still receive a deterministic threshold and priority classification

### Requirement: Incremental Modularization with Facade Preservation
The system SHALL require incremental extraction behind compatibility facades for oversized files.

#### Scenario: Feature-preserving extraction
- **WHEN** a queued oversized file is refactored
- **THEN** external imports/command contracts MUST remain compatible for that batch
- **AND** behavior parity checks MUST pass before batch completion

### Requirement: Large-File Regression Sentry
The system SHALL provide CI sentry checks that enforce domain-aware hard gates and baseline-aware debt growth controls, while keeping near-threshold watch output non-blocking.

#### Scenario: Hard gate for new oversized debt
- **WHEN** a pull request introduces a new file whose line count exceeds the matched policy fail threshold
- **THEN** CI sentry MUST fail the check
- **AND** remediation guidance MUST be shown in logs

#### Scenario: Hard gate for growing legacy debt
- **WHEN** a file already tracked in the baseline exceeds the matched policy fail threshold and its current line count is greater than the baseline line count
- **THEN** CI sentry MUST fail the check
- **AND** the failure output MUST show both the baseline line count and the current line count

#### Scenario: Legacy debt at or below baseline is visible but non-blocking
- **WHEN** a file exceeds the matched policy fail threshold but its current line count is equal to or lower than the recorded baseline
- **THEN** CI sentry MUST NOT fail solely because of that retained debt
- **AND** the scan output MUST still report the file as retained hard debt

#### Scenario: Near-threshold observation is non-blocking
- **WHEN** a pull request introduces or grows a file beyond the matched policy warn threshold but not beyond its fail threshold
- **THEN** CI sentry MAY emit informational warning/report
- **AND** the merge decision MUST NOT be blocked solely by near-threshold status

### Requirement: Completion Criteria for Governance Milestones
The system SHALL define measurable completion criteria for the Deferred + JIT governance mode.

#### Scenario: Deferred strategy review
- **WHEN** governance review is performed
- **THEN** review MUST include hard-gate violations count, JIT remediation outcomes, and unresolved risk list
- **AND** retained near-threshold files MAY be documented as watchlist items without mandatory decomposition plan

