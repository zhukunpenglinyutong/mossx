## ADDED Requirements

### Requirement: Bundle Chunking MUST Preserve Tauri Startup Semantics

The system MUST optimize bundle composition without delaying the desktop startup critical path: app shell initialization, workspace/session restore, active thread rendering, and composer basic input readiness.

#### Scenario: critical startup modules remain eagerly reachable

- **WHEN** bundle chunking is changed
- **THEN** startup-critical modules MUST remain reachable without user-visible lazy loading stalls
- **AND** any lazy boundary added by this change MUST be documented as non-critical-path

### Requirement: Bundle Size Changes MUST Be Compared Against S-CS-COLD Baseline

The system MUST compare bundle output against the recorded `S-CS-COLD` baseline (`bundleSizeMain = 1858800 bytes`, `bundleSizeVendor = 163595 bytes`).

#### Scenario: main bundle reduction is measured or explained

- **WHEN** cold-start baseline is rerun
- **THEN** `bundleSizeMain` MUST either decrease versus `1858800 bytes` or the change MUST document why no decrease is achievable
- **AND** `bundleSizeVendor` MUST NOT grow substantially without an explicit explanation

### Requirement: Unsupported Webview Timing MUST Remain Explicit

The system MUST NOT invent `firstPaintMs` or `firstInteractiveMs` values while the current instrumentation reports them as unsupported.

#### Scenario: unsupported timing is not silently replaced

- **WHEN** perf baselines are updated
- **THEN** unsupported timing fields MUST remain explicitly marked unsupported unless a real Tauri/webview timing source is introduced

### Requirement: Domain Chunks MUST Be Explainable

Manual chunks and lazy imports introduced by this capability MUST be organized around low-frequency domains or heavy optional surfaces, not arbitrary dependency names.

#### Scenario: chunk rationale is reviewable

- **WHEN** a new chunk boundary is introduced
- **THEN** the implementation notes or PR description MUST identify its domain, why it is low-frequency, and how to rollback it

### Requirement: Bundle Chunking MUST Be Validated By Existing Perf Gates

The system MUST use existing perf scripts rather than adding new external browser tooling in this change.

#### Scenario: existing cold-start scripts validate the change

- **WHEN** validation runs
- **THEN** `npm run perf:cold-start:baseline` and `npm run perf:baseline:aggregate` MUST complete successfully
- **AND** `openspec validate optimize-bundle-chunking --strict --no-interactive` MUST pass
