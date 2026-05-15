# spec-hub-adapter-openspec Specification

## Purpose

Defines the spec-hub-adapter-openspec behavior contract, covering OpenSpec Command Adapter.

## Requirements
### Requirement: OpenSpec Command Adapter

The system SHALL provide an OpenSpec adapter that maps Spec Hub actions to OpenSpec CLI commands with structured
results.

#### Scenario: Execute mapped action successfully

- **WHEN** user triggers `continue`, `apply`, `verify`, or `archive` for a selected change
- **THEN** adapter SHALL invoke the mapped OpenSpec command in workspace context
- **AND** adapter SHALL return structured payload (`success`, `stdout`, `stderr`, `exitCode`)

### Requirement: Preflight Preconditions Check

The adapter SHALL perform preflight checks before action execution.

#### Scenario: Missing tasks before apply

- **WHEN** user triggers `apply` while required tasks context is missing
- **THEN** adapter SHALL reject command execution
- **AND** adapter SHALL return blocker details consumable by execution console actions tab

### Requirement: Strict Validation Structuring

The adapter SHALL transform strict validation output into UI-consumable structured diagnostics.

#### Scenario: Strict validation fails

- **WHEN** `openspec validate <change> --strict` reports failures
- **THEN** adapter SHALL emit diagnostics including failed entity and reason
- **AND** diagnostics SHALL include actionable hint text for remediation

### Requirement: Error Context Enrichment

The adapter MUST preserve execution context for all failures.

#### Scenario: Command execution error

- **WHEN** CLI invocation fails due to environment or command error
- **THEN** adapter SHALL include command, provider, workspace, and error summary in result metadata
- **AND** UI SHALL be able to surface the failure without parsing raw terminal output

### Requirement: Archive Semantic Failure Recognition

The adapter SHALL classify archive semantic-abort outputs as failed actions even when process exit code is zero.

#### Scenario: Archive abort text indicates failure

- **WHEN** archive output contains semantic abort signals (for example `failed for header` or
  `Aborted. No files were changed.`)
- **THEN** adapter SHALL mark action result as failed
- **AND** failure output SHALL be preserved for UI blocker/takeover context

### Requirement: Shared Engine Routing Contract

The adapter SHALL accept page-level selected engine context and apply it consistently across executable flows.

#### Scenario: Apply uses selected shared engine

- **WHEN** user triggers `apply` in execute mode
- **THEN** adapter SHALL route execution to the selected shared engine only
- **AND** apply result envelope SHALL include engine identity for UI feedback

#### Scenario: Proposal flows use same shared engine

- **WHEN** user triggers proposal create or append processing
- **THEN** adapter SHALL consume the same selected shared engine context
- **AND** returned result envelope SHALL include engine identity and flow mode (`create` or `append`)

### Requirement: Proposal Processing Adapter Capability

The adapter SHALL support proposal creation and proposal append processing with structured feedback envelopes.

#### Scenario: Create proposal request is processed

- **WHEN** user submits proposal content from `new proposal` modal
- **THEN** adapter SHALL execute proposal-processing pipeline to produce or update change artifacts
- **AND** adapter SHALL return phase-based result envelope (`preflight`, `proposal-input`, `ai-processing`,
  `artifact-write`, `finalize`)

#### Scenario: Append proposal request binds target change

- **WHEN** user submits append request with target change and extra content
- **THEN** adapter SHALL process append operation against selected target change context
- **AND** result envelope SHALL include target change reference and append outcome summary

#### Scenario: Proposal request carries image attachments

- **WHEN** user submits proposal content with attached images
- **THEN** adapter SHALL accept attachment payload together with text content
- **AND** adapter SHALL pass normalized multimodal context into proposal-processing pipeline

### Requirement: Failure-first Recoverability

The adapter SHALL fail fast on invalid inputs or unavailable engines and return actionable recovery guidance.

#### Scenario: Selected engine is unavailable

- **WHEN** selected engine is unavailable at runtime
- **THEN** adapter SHALL stop before processing phase execution
- **AND** failure payload SHALL include actionable hint (switch engine and retry)

#### Scenario: Proposal request is invalid

- **WHEN** proposal input is empty or target change is missing in append mode
- **THEN** adapter SHALL reject request with explicit validation error
- **AND** failure payload SHALL preserve current runtime state without partial writeback

#### Scenario: Proposal attachment payload is invalid

- **WHEN** attachment metadata/type/size violates accepted constraints
- **THEN** adapter SHALL reject request before AI processing phase
- **AND** failure payload SHALL include attachment-specific correction hint

### Requirement: Verify Auto-Completion Adapter Contract

The adapter SHALL support verify invocation with optional completion-before-validate orchestration.

#### Scenario: Adapter runs strict validate directly when auto-completion is off

- **WHEN** runtime invokes verify with `autoComplete=false`
- **THEN** adapter SHALL execute mapped strict validate command directly
- **AND** returned payload SHALL preserve current validate output semantics

#### Scenario: Adapter completes verification artifact before validate when enabled

- **WHEN** runtime invokes verify with `autoComplete=true` and verification artifact is missing
- **THEN** adapter SHALL execute completion step first and execute strict validate only after completion success
- **AND** payload SHALL include phase result indicating both completion and validate outcomes

#### Scenario: Adapter surfaces completion failure without running validate

- **WHEN** completion step fails
- **THEN** adapter SHALL stop workflow before strict validate
- **AND** failure payload SHALL include explicit reason that validate was skipped due to completion failure

### Requirement: Verify Completion Realtime Envelope Compatibility

The adapter SHALL provide verify auto-completion feedback in the same envelope shape consumed by apply/proposal feedback
overlay rendering.

#### Scenario: Adapter emits overlay-compatible incremental updates

- **WHEN** verify auto-completion pipeline is running
- **THEN** adapter SHALL emit structured updates with phase/status/output/log semantics
- **AND** payload schema SHALL remain compatible with existing feedback overlay renderer

#### Scenario: Adapter emits validate-skipped semantic on completion failure

- **WHEN** completion phase fails
- **THEN** adapter SHALL include explicit `validateSkipped` outcome metadata
- **AND** adapter SHALL NOT emit strict-validate execution payload for that run

### Requirement: Continue AI Enhancement Read-Only Contract

The adapter SHALL support continue AI enhancement analysis in strict read-only mode.

#### Scenario: Adapter generates continue brief after continue command output

- **WHEN** runtime requests continue AI enhancement with valid continue output
- **THEN** adapter SHALL invoke AI analysis step and return structured continue brief payload
- **AND** brief SHALL include next-action and risk-oriented guidance fields for downstream consumption

#### Scenario: Adapter enforces read-only access for continue enhancement

- **WHEN** continue enhancement step is dispatched
- **THEN** adapter SHALL use read-only execution mode
- **AND** adapter SHALL reject any mutation-oriented branch in this flow

#### Scenario: Adapter returns recoverable failure without side effects

- **WHEN** continue enhancement fails (engine unavailable / malformed output / timeout)
- **THEN** adapter SHALL return explicit enhancement error payload
- **AND** adapter SHALL preserve continue command result and leave workspace unchanged

### Requirement: Apply Context Injection Compatibility

The adapter SHALL accept optional continue brief context in apply execution requests.

#### Scenario: Adapter consumes brief context when provided

- **WHEN** apply execution is dispatched with continue brief payload
- **THEN** adapter SHALL include brief context in downstream AI execution prompt assembly
- **AND** adapter SHALL keep existing apply response envelope compatibility

#### Scenario: Adapter remains backward compatible without brief context

- **WHEN** apply execution request has no continue brief
- **THEN** adapter SHALL execute existing apply path unchanged
- **AND** adapter SHALL NOT require new mandatory fields for legacy callers

