# exhaustive-deps-warning-governance Specification

## Purpose
TBD - created by archiving change triage-exhaustive-deps-warning-batches. Update Purpose after archive.
## Requirements
### Requirement: Exhaustive deps warnings must be triaged before remediation

The repository SHALL classify `react-hooks/exhaustive-deps` warnings into explicit remediation buckets before implementation begins. The classification MUST record warning counts, owning files, remediation shape, and whether the warning is safe for immediate execution or deferred for a dedicated batch.

#### Scenario: Building the current warning inventory

- **WHEN** the team captures a fresh `react-hooks/exhaustive-deps` lint snapshot
- **THEN** the change artifacts SHALL publish a complete table of immediately actionable warnings
- **AND** the change artifacts SHALL publish a complete table of deferred warnings
- **AND** the two tables combined SHALL account for the full warning count in the snapshot

### Requirement: Immediate remediation batches must stay within bounded risk

An immediate remediation batch SHALL only include warnings whose fixes are mechanically verifiable and bounded to leaf or medium-risk modules. Immediate batches MUST exclude orchestration hotspots whose fixes can change effect timing, listener cleanup, or parent callback contracts without prior module-level design review.

#### Scenario: Selecting a P0 remediation batch

- **WHEN** a warning batch is prepared for execution
- **THEN** the batch SHALL include only warnings with clear remediation shapes such as removing unnecessary dependencies, stabilizing local helpers, or adding narrowly scoped dependencies in leaf modules
- **AND** the batch SHALL exclude hotspot modules such as `git-history`, `threads`, and `app-shell` unless a dedicated design review has been completed first
- **AND** the batch size SHALL remain small enough to validate in a single implementation session

### Requirement: Each remediation batch must define validation and defer gates

Every remediation batch SHALL declare its verification commands and SHALL explicitly state which warning groups are deferred, why they are deferred, and what condition must be satisfied before they can enter implementation.

#### Scenario: Preparing the executable task list

- **WHEN** tasks are generated from the warning triage
- **THEN** the tasks SHALL name the immediate warning batch and its validation commands
- **AND** the tasks SHALL record deferred hotspots with the gating condition required for future remediation
- **AND** the implementation plan SHALL prevent deferred warnings from being silently bundled into the immediate batch

