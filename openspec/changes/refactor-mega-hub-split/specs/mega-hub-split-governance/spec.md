## ADDED Requirements

### Requirement: Mega Hub Split MUST Target One Primary Hub Per Change

The system MUST split only one primary hub in the first implementation slice of this change.

#### Scenario: one hub target is selected before implementation

- **WHEN** implementation begins
- **THEN** the change MUST identify exactly one primary target file
- **AND** the target MUST be justified by perf baseline, large-file governance, or event propagation risk

### Requirement: Splits MUST Follow Responsibility Boundaries

Mega hub extraction MUST separate pure calculation, side-effect orchestration, render adapter/presenter, and test fixtures where applicable.

#### Scenario: extracted modules have explicit responsibilities

- **WHEN** a module is extracted from the hub
- **THEN** its responsibility MUST be named and covered by targeted tests or existing tests
- **AND** extraction MUST NOT be based only on line count

### Requirement: Public Hook And Component Contracts MUST Remain Stable

The split MUST preserve existing public imports and caller-facing hook/component contracts unless an explicit migration plan is included.

#### Scenario: existing callers continue to compile

- **WHEN** the split is complete
- **THEN** `npm run typecheck` MUST pass without requiring broad caller rewrites

### Requirement: Large-File Governance MUST Improve Or Be Explained

The selected hub MUST move toward large-file policy thresholds, and extracted modules MUST NOT introduce new near-threshold files.

#### Scenario: large-file gate validates the split

- **WHEN** validation runs
- **THEN** `npm run check:large-files:gate` MUST pass
- **AND** any remaining oversized file MUST have a documented follow-up reason

### Requirement: Perf Baseline MUST Not Regress For The Selected Path

The system MUST rerun the perf baseline relevant to the selected hub and document the before/after result.

#### Scenario: selected hub baseline is rerun

- **WHEN** the selected hub affects long-list, realtime, or composer behavior
- **THEN** the corresponding perf baseline MUST be rerun
- **AND** `openspec validate refactor-mega-hub-split --strict --no-interactive` MUST pass
