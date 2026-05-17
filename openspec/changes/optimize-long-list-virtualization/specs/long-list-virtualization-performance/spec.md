## ADDED Requirements

### Requirement: Long Message Lists MUST Use A Viewport Projection Boundary

Long-list optimization MUST be implemented as a render-layer viewport projection and MUST NOT change reducer state shape, message identity, or conversation ordering.

#### Scenario: virtualization preserves message identity and order

- **WHEN** a 1000-row conversation is rendered through virtualization
- **THEN** visible rows MUST preserve the same message ids and ordering as the underlying conversation state
- **AND** reducer state MUST remain unchanged by viewport calculations

### Requirement: Streaming Row MUST Remain Stable During Virtualization

Virtualization MUST preserve live streaming semantics for the active assistant row.

#### Scenario: active streaming row receives deltas without visual reset

- **WHEN** assistant text deltas append to the active row
- **THEN** virtualization MUST NOT lose the row's live content, scroll intent, or selection state

### Requirement: Scroll Restoration MUST Preserve Existing User Semantics

The system MUST preserve existing scroll position restoration and initial visible row semantics after virtualization.

#### Scenario: restored session opens at the expected scroll position

- **WHEN** a long restored session is opened
- **THEN** the visible position MUST match the pre-change behavior or be explicitly documented as an intentional improvement

### Requirement: S-LL-1000 MUST Have Browser-Level Scroll Verification

The `S-LL-1000` scenario MUST move beyond jsdom-only proxy confidence by adding a browser-level scroll verification gate or a documented environment limitation.

#### Scenario: browser scroll gate records long-list behavior

- **WHEN** long-list perf validation runs
- **THEN** `S-LL-1000` MUST include browser-level scroll evidence or an explicit unsupported marker with rationale

### Requirement: Long-List Metrics MUST Not Regress Against v0.4.18 Baseline

The system MUST compare long-list metrics against the v0.4.18 baseline and prevent unbounded regressions.

#### Scenario: commit and scroll metrics are compared

- **WHEN** `npm run perf:long-list:baseline` runs
- **THEN** `S-LL-1000` commit / scroll metrics MUST not be worse than baseline without a documented reason
- **AND** `openspec validate optimize-long-list-virtualization --strict --no-interactive` MUST pass
