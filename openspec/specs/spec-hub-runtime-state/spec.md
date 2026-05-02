# spec-hub-runtime-state Specification

## Purpose

TBD - created by archiving change codemoss-spec-hub-mvp-2026-02-23. Update Purpose after archive.
## Requirements
### Requirement: Unified Change Runtime Model

The system SHALL build a unified runtime model for each spec change, including provider type, artifacts completeness,
action availability, blockers, and lifecycle status.

#### Scenario: Build runtime state from workspace files

- **WHEN** Spec Hub loads a workspace
- **THEN** runtime SHALL parse change directories and artifact presence into a normalized model
- **AND** each change SHALL have a deterministic status value (`draft`, `ready`, `implementing`, `verified`, `archived`,
  `blocked`)

### Requirement: Deterministic Status Derivation

The system SHALL derive change status from artifact and validation evidence instead of free text metadata.

#### Scenario: Strategy or tier changes recompute availability

- **WHEN** tier, doctor evidence, or strategy config changes
- **THEN** runtime SHALL recompute action availability deterministically
- **AND** change status SHALL update without page reload

### Requirement: Workspace-Scoped Isolation

The system MUST isolate runtime state by workspace boundary.

#### Scenario: Switching workspace does not leak state

- **WHEN** user switches from workspace A to workspace B
- **THEN** runtime SHALL only expose changes under workspace B
- **AND** action history and blockers from workspace A SHALL NOT appear in workspace B view

### Requirement: Task Checklist Writeback State Synchronization

The runtime SHALL synchronize task completion state and action gates after tasks checklist writeback.

#### Scenario: Rebuild runtime after task checkbox writeback

- **WHEN** Tasks checklist change is persisted to current `tasks.md`
- **THEN** runtime SHALL recompute task progress from updated markdown
- **AND** actions and guards state SHALL reflect the latest completion state without full app restart

#### Scenario: Apply auto-writeback updates tasks deterministically

- **WHEN** apply execution returns explicit completed task indices
- **THEN** runtime SHALL write back matched checkboxes to `tasks.md`
- **AND** runtime SHALL refresh task progress and action availability in-place

#### Scenario: Apply auto-writeback failure rolls back state

- **WHEN** task auto-writeback fails due to IO or permission errors
- **THEN** runtime SHALL rollback optimistic task state to previous snapshot
- **AND** runtime SHALL expose actionable error feedback for manual recovery

### Requirement: Archive Failure Evidence for Takeover

The runtime SHALL expose archive gate evidence for AI takeover, including blockers and latest failed archive output.

#### Scenario: Runtime exposes archive blockers

- **WHEN** archive preflight detects missing target or requirement mismatch
- **THEN** runtime SHALL attach archive-specific blockers to selected change
- **AND** blockers SHALL be consumable by actions tab without re-parsing raw markdown

#### Scenario: Runtime preserves latest failed archive output

- **WHEN** archive command execution fails semantically
- **THEN** runtime timeline SHALL keep failed archive output text
- **AND** actions tab SHALL be able to use this output as AI takeover input context

### Requirement: AI Takeover Run Lifecycle State

The runtime SHALL maintain takeover execution lifecycle state for selected change, including current phase, log entries,
and refresh outcome.

#### Scenario: Runtime enters running lifecycle

- **WHEN** AI takeover is triggered from actions tab
- **THEN** runtime SHALL set takeover status to `running` with initialized phase state
- **AND** runtime SHALL expose start timestamp for elapsed-time rendering

#### Scenario: Runtime appends phase logs during execution

- **WHEN** takeover advances through engine call and finalize steps
- **THEN** runtime SHALL append structured log entries with phase and message
- **AND** UI consumers SHALL be able to render logs incrementally without page reload

#### Scenario: Runtime finalizes with success or failure

- **WHEN** takeover finishes
- **THEN** runtime SHALL set takeover status to `success` or `failed`
- **AND** runtime SHALL preserve latest summary/error for next panel render

#### Scenario: Runtime records refresh outcome

- **WHEN** takeover completion triggers runtime refresh
- **THEN** runtime SHALL persist refresh outcome as `refreshed` or `refresh_failed`
- **AND** UI SHALL be able to display whether manual refresh is needed

### Requirement: Spec-kit Auto Run State Persistence

The runtime SHALL persist latest auto run state for selected spec-kit change in session lifecycle.

#### Scenario: Preserve latest run after refresh

- **WHEN** auto run reaches terminal state
- **THEN** runtime SHALL persist latest `source/phase/status/summary/error`
- **AND** actions panel refresh SHALL keep latest run context visible

#### Scenario: Preserve run state per provider scope

- **WHEN** user switches between OpenSpec and spec-kit scopes
- **THEN** runtime SHALL restore each scope's own latest run state
- **AND** scope switching SHALL NOT overwrite the other provider's run summary

### Requirement: Legacy Runtime Compatibility Boundary

The runtime SHALL integrate spec-kit auto state as additive scope data without changing legacy OpenSpec state contracts.

#### Scenario: Introduce spec-kit auto state fields

- **WHEN** runtime extends state for spec-kit auto execution
- **THEN** extension SHALL be additive and provider-scoped
- **AND** existing OpenSpec runtime consumers SHALL continue to work without contract-breaking changes

### Requirement: Shared Execution Engine State

The runtime SHALL maintain a single execution engine selection for the current Spec Hub page context.

#### Scenario: Engine selection is reused across action families

- **WHEN** user selects one engine (`claude` | `codex` | `opencode`)
- **THEN** runtime SHALL persist the engine as shared execution context
- **AND** apply, AI takeover, and proposal create/append flows SHALL consume the same selected engine by default

#### Scenario: Engine identity is visible in run states

- **WHEN** any execution flow starts
- **THEN** runtime SHALL include selected engine identity in run snapshot
- **AND** UI consumers SHALL be able to render engine label in running and completion states

### Requirement: Proposal Flow Runtime State Machine

The runtime SHALL expose structured lifecycle state for proposal processing (`create` and `append`).

#### Scenario: New proposal flow is observable

- **WHEN** proposal create flow starts
- **THEN** runtime SHALL expose phase-level status (`preflight`, `proposal-input`, `ai-processing`, `artifact-write`,
  `finalize`)
- **AND** runtime SHALL store latest summary/error/log metadata for panel reuse

#### Scenario: Append proposal carries target change context

- **WHEN** proposal append flow starts with selected target change
- **THEN** runtime SHALL persist target change identity in run state
- **AND** completion summary SHALL retain target binding for UI confirmation

### Requirement: Proposal Input Draft State

The runtime SHALL track proposal draft input as multimodal payload for create/append flows.

#### Scenario: Draft stores text and attachment metadata

- **WHEN** user edits proposal modal content
- **THEN** runtime SHALL persist draft text and attachment metadata in modal/session state
- **AND** submit payload SHALL include both content and attachment references when present

#### Scenario: Invalid attachment is rejected before execution

- **WHEN** user attaches unsupported image type or oversized file
- **THEN** runtime SHALL block submission before execution phase starts
- **AND** runtime SHALL expose actionable validation message without mutating run state

### Requirement: Post-Execution Refresh and Re-Anchor

The runtime SHALL refresh workspace-derived state after proposal processing or apply execution completion.

#### Scenario: Runtime refreshes after proposal completion

- **WHEN** proposal processing completes (success/failure/no-change)
- **THEN** runtime SHALL refresh artifacts/actions/gates/timeline in-place
- **AND** runtime SHALL expose resolvable related-change reference for UI navigation when available

#### Scenario: Refresh failure is actionable

- **WHEN** post-run refresh fails due to IO or parsing errors
- **THEN** runtime SHALL keep previous stable snapshot
- **AND** runtime SHALL expose actionable recovery hint for manual retry

### Requirement: Verify Optional Auto-Completion Orchestration State

The runtime SHALL support an opt-in verify orchestration mode that can complete missing verification artifact before
strict validate.

#### Scenario: Runtime executes direct verify when auto-completion is disabled

- **WHEN** verify action is triggered with auto-completion mode disabled
- **THEN** runtime SHALL execute strict validate directly
- **AND** runtime SHALL preserve existing verify success/failure persistence semantics

#### Scenario: Runtime runs completion then strict validate when required

- **WHEN** verify action is triggered with auto-completion mode enabled and `verification` artifact is absent
- **THEN** runtime SHALL execute completion phase first and run strict validate only if completion succeeds
- **AND** runtime SHALL record phase-level state so UI can differentiate completion failure from validate failure

#### Scenario: Completion failure stops verify chain

- **WHEN** completion phase fails or is interrupted
- **THEN** runtime SHALL stop workflow without invoking strict validate
- **AND** runtime SHALL return actionable error details for retry or fallback to direct verify mode

### Requirement: Verify Completion Realtime Feedback State

The runtime SHALL expose structured realtime feedback state for verify auto-completion that is compatible with existing
apply/proposal feedback overlay consumers.

#### Scenario: Verify completion publishes phase-level run state

- **WHEN** verify auto-completion pipeline starts
- **THEN** runtime SHALL emit phase-level state (`completion-dispatch`, `completion-execution`, `completion-finalize`)
- **AND** state SHALL include `status`, `engine`, `output`, and `logs`

#### Scenario: Completion success transitions to verify phases

- **WHEN** completion finishes successfully
- **THEN** runtime SHALL transition to verify phases (`verify-dispatch`, `verify-finalize`)
- **AND** runtime SHALL keep one coherent run snapshot for UI rendering continuity

#### Scenario: Completion failure marks validate as skipped

- **WHEN** completion fails before strict validate
- **THEN** runtime SHALL finalize run state as failed with explicit `validateSkipped=true` semantic
- **AND** runtime SHALL avoid emitting any validate-start signal for that run

### Requirement: Feedback Overlay Position State

The runtime/UI state contract SHALL support draggable feedback overlay positioning without affecting execution state.

#### Scenario: Overlay position updates are isolated from execution state

- **WHEN** user drags feedback overlay
- **THEN** position state SHALL update independently from action/proposal/verify run states
- **AND** execution lifecycle data SHALL remain unchanged

#### Scenario: Overlay close resets position to default anchor

- **WHEN** user closes feedback overlay
- **THEN** runtime/UI state SHALL reset overlay position to default bottom-right anchor
- **AND** next run SHALL start from default position unless explicitly moved again

### Requirement: Continue AI Brief Runtime State

The runtime SHALL support optional continue AI enhancement state and keep enhancement output as structured brief per
change context.

#### Scenario: Runtime executes continue command first and enhancement second

- **WHEN** continue is triggered with AI enhancement enabled
- **THEN** runtime SHALL execute continue command phase before AI enhancement phase
- **AND** enhancement phase SHALL consume continue output as one of its inputs

#### Scenario: Runtime keeps enhancement path read-only

- **WHEN** continue enhancement phase runs
- **THEN** runtime SHALL invoke AI with read-only semantics
- **AND** runtime SHALL NOT invoke any task writeback or file mutation branch for that run

#### Scenario: Runtime stores latest brief by change scope

- **WHEN** continue enhancement succeeds
- **THEN** runtime SHALL store latest brief keyed by current `changeId + specRoot/provider scope`
- **AND** switching change SHALL read corresponding scoped brief without cross-change leakage

### Requirement: Apply Prompt Handoff State

The runtime SHALL allow apply execution to optionally consume latest continue brief as extra prompt context.

#### Scenario: Apply includes continue brief when handoff is enabled

- **WHEN** apply starts and `useContinueBrief=true` with available brief
- **THEN** runtime SHALL include brief section into apply execution prompt
- **AND** run logs/state SHALL expose that brief handoff is enabled

#### Scenario: Apply skips brief when handoff is disabled or brief unavailable

- **WHEN** apply starts with handoff disabled or no available brief
- **THEN** runtime SHALL use existing apply prompt path
- **AND** execution state SHALL remain compatible with pre-handoff behavior

#### Scenario: Stale brief only affects hint level

- **WHEN** brief freshness check marks brief as stale
- **THEN** runtime/UI SHALL surface stale hint metadata
- **AND** runtime SHALL NOT force-disable apply execution

### Requirement: Progressive Action Gate Matrix for Incomplete Changes

The runtime SHALL compute action availability by action responsibility so users can progressively complete artifacts
after proposal creation.

#### Scenario: Continue is not blocked by missing design/specs/tasks

- **WHEN** selected change is in proposal-only or artifact-incomplete stage
- **THEN** runtime SHALL keep `continue` available unless blocked by provider/environment/archived constraints
- **AND** runtime SHALL NOT add missing design/specs/tasks as direct continue blockers

#### Scenario: Apply is not self-blocked by missing tasks

- **WHEN** selected change is missing `tasks.md`
- **THEN** runtime SHALL keep `apply` available when its upstream prerequisites are satisfied
- **AND** runtime SHALL treat `apply` as a task-completion entry rather than a task-existence-dependent action

#### Scenario: Missing specs delta blocks apply with next-step semantics

- **WHEN** selected change is missing specs delta required before apply
- **THEN** runtime SHALL mark apply unavailable with actionable blocker text (run continue first)
- **AND** runtime SHALL keep blocker semantics machine-readable for UI next-step rendering

#### Scenario: Verify and archive gates remain strict

- **WHEN** change artifacts are incomplete for strict validation/archive
- **THEN** runtime SHALL keep `verify` and `archive` gates unchanged
- **AND** progressive-gate relaxation SHALL NOT weaken strict-verify/archive quality constraints

### Requirement: Workspace-Scoped Console Visibility Preference

The runtime SHALL persist execution console visibility per workspace/spec-root scope and expose a deterministic initial
state when no preference exists yet.

#### Scenario: Runtime seeds collapsed default for new scope

- **WHEN** runtime initializes Spec Hub state for a workspace/spec-root scope with no stored console visibility
  preference
- **THEN** runtime SHALL expose `collapsed=true` as the initial execution console state
- **AND** UI consumers SHALL treat it as the default preference for that scope

#### Scenario: Runtime restores explicit console choice

- **WHEN** a stored execution console visibility preference exists for the current workspace/spec-root scope
- **THEN** runtime SHALL restore that stored boolean on load
- **AND** change selection or data refresh SHALL NOT overwrite it unless the user toggles the console again

### Requirement: Workspace-Scoped Backlog Membership Overlay

The runtime SHALL maintain backlog pool membership as a workspace/spec-root scoped organization overlay that is
independent from lifecycle status derivation.

#### Scenario: Backlog membership is persisted as overlay data

- **WHEN** user moves a change into or out of backlog pool
- **THEN** runtime SHALL persist the change id in the current workspace/spec-root backlog overlay
- **AND** the change's lifecycle status in runtime snapshot SHALL remain unchanged

#### Scenario: Refresh prunes stale backlog membership

- **WHEN** runtime refreshes change summaries and a stored backlog id no longer exists in the current scope or is now
  archived
- **THEN** runtime SHALL remove that stale id from backlog membership overlay
- **AND** UI SHALL NOT render orphan backlog entries after the refresh

#### Scenario: Filter derivation combines overlay and lifecycle facts

- **WHEN** runtime builds filter-specific change collections
- **THEN** the `backlog` view SHALL include non-archived backlog members from the overlay
- **AND** the `blocked` view SHALL still include blocked changes regardless of whether they are also backlog members

