# spec-hub-adapter-speckit Specification

## Purpose

Defines the spec-hub-adapter-speckit behavior contract, covering Auto Combo Router for Spec-kit.

## Requirements

### Requirement: Auto Combo Router for Spec-kit

The system SHALL route `/ai-reach:auto` actions in spec-kit by action-level strategy.

#### Scenario: Route action by resolved source

- **WHEN** strategy matrix resolves action source (`native` | `ai` | `passthrough` | `blocked`)
- **THEN** adapter SHALL dispatch only by that source
- **AND** result payload SHALL include resolved source identity

#### Scenario: Blocked action is rejected before dispatch

- **WHEN** action source is `blocked`
- **THEN** adapter SHALL stop execution before route/execute phase
- **AND** payload SHALL include blocker reason and recovery guidance

### Requirement: Five-Phase Result Envelope

The adapter SHALL expose unified five-phase run results for spec-kit auto actions.

#### Scenario: Run emits phase progression

- **WHEN** an auto action is executed
- **THEN** adapter SHALL emit phase progression for `preflight -> route -> execute -> task-writeback -> finalize`
- **AND** each phase SHALL expose status and summary for UI rendering

#### Scenario: Terminal status is structured

- **WHEN** run completes
- **THEN** adapter SHALL return terminal status (`success` | `failed` | `no_change`)
- **AND** payload SHALL include next-step suggestion

### Requirement: Deterministic Fallback Chain

The adapter SHALL apply deterministic fallback when higher-priority source fails.

#### Scenario: Native source fails

- **WHEN** action source is `native` and execution fails
- **THEN** adapter SHALL fallback to `ai` if configured as secondary source
- **AND** fallback reason SHALL be recorded in run output

#### Scenario: AI source fails after fallback

- **WHEN** action source is `ai` and execution fails with passthrough available
- **THEN** adapter SHALL fallback to `passthrough`
- **AND** UI SHALL be able to render fallback trace without parsing raw logs

### Requirement: Explicit Task Writeback Eligibility

The adapter SHALL propose task writeback only from explicit completion evidence.

#### Scenario: Explicit completed task evidence exists

- **WHEN** execution output contains explicit completed task identifiers
- **THEN** adapter SHALL emit deterministic `completedTaskIndices`
- **AND** runtime SHALL be able to write back matching checkboxes

#### Scenario: Completion evidence is ambiguous

- **WHEN** output cannot be mapped to explicit task identifiers
- **THEN** adapter SHALL emit no writeback candidates
- **AND** result summary SHALL instruct manual task update

### Requirement: Provider-Isolated Dispatch Boundary

The adapter SHALL enforce provider-isolated dispatch in coexistence workspaces.

#### Scenario: Workspace has both OpenSpec and spec-kit

- **WHEN** action request is routed to spec-kit adapter with `provider=spec-kit`
- **THEN** adapter SHALL execute only spec-kit route handlers
- **AND** adapter SHALL NOT invoke OpenSpec adapter or mutate OpenSpec run context

#### Scenario: Provider mismatch request

- **WHEN** request provider metadata does not match spec-kit scope
- **THEN** adapter SHALL fail fast with provider-mismatch error
- **AND** execution SHALL stop before any external command or engine dispatch

### Requirement: Cross-Platform Native Dispatch Consistency

The adapter SHALL keep native dispatch strategy semantics consistent across macOS and Windows.

#### Scenario: Resolve native command by platform adapter

- **WHEN** adapter prepares native execution in different OS environments
- **THEN** it SHALL resolve command and path via shared platform adapter abstraction
- **AND** business routing logic SHALL NOT contain scattered OS-specific branch handling

#### Scenario: Preserve strategy and fallback semantics across OS

- **WHEN** same action strategy is evaluated on macOS and Windows
- **THEN** resolved source and fallback order SHALL remain semantically identical
- **AND** OS differences SHALL only affect concrete command invocation details

### Requirement: Non-Intrusive Speckit Module Integration

The spec-kit auto capability SHALL integrate as isolated module code with minimal legacy wiring.

#### Scenario: Spec-kit code remains isolated

- **WHEN** introducing or evolving spec-kit auto execution logic
- **THEN** new implementation SHALL live under dedicated spec-kit module boundaries
- **AND** legacy OpenSpec primary flow SHALL only receive integration wiring changes

#### Scenario: Cross-module mutation protection

- **WHEN** spec-kit adapter processes run state or writeback mutation
- **THEN** mutation SHALL be scoped to spec-kit module contracts only
- **AND** legacy OpenSpec module state SHALL remain unaffected

