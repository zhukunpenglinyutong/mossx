# composer-context-dual-view Specification

## Purpose
TBD - created by archiving change composer-context-dual-view-preserve-legacy. Update Purpose after archive.
## Requirements
### Requirement: Dual-View Coexistence in Composer
The system SHALL support rendering a new context view alongside the legacy context view within Composer.

#### Scenario: Enable dual-view mode
- **WHEN** dual-view capability is enabled for the current conversation context
- **THEN** Composer SHALL render legacy view and new view in the same footer/status region
- **AND** both views SHALL be visible without replacing legacy view content

#### Scenario: Disable dual-view mode
- **WHEN** dual-view capability is disabled
- **THEN** Composer SHALL render only legacy view path
- **AND** user-facing behavior SHALL remain equivalent to pre-change legacy behavior

### Requirement: Legacy View Compatibility Guarantee
The system MUST preserve legacy view behavior when introducing dual-view layout.

#### Scenario: Legacy interaction remains unchanged
- **WHEN** user interacts with legacy view controls under dual-view enabled state
- **THEN** legacy control semantics SHALL remain unchanged
- **AND** no new side effects SHALL be introduced into legacy-only state updates

#### Scenario: Legacy rendering contract is preserved
- **WHEN** legacy view receives the same input state as before this change
- **THEN** legacy view SHALL produce equivalent status/tooltip semantics
- **AND** existing legacy regression tests SHALL remain valid

### Requirement: Shared State Source Consistency
Both views MUST read context usage and compaction signals from the same conversation state source.

#### Scenario: Token usage consistency across two views
- **WHEN** `thread/tokenUsage/updated` updates `latestTokenUsageInfo`
- **THEN** legacy view and new view SHALL reflect the same token usage snapshot
- **AND** neither view SHALL introduce an alternative token calculation source

#### Scenario: Compaction status consistency across two views
- **WHEN** conversation enters compacting or freshly completed compaction states
- **THEN** both views SHALL present state-consistent messaging
- **AND** state transitions SHALL be derived from explicit thread lifecycle state rather than preserved historical compaction messages alone

### Requirement: View Visibility Control and Safe Rollback
The system SHALL provide a runtime-controllable visibility strategy for the new view.

#### Scenario: New view gated by control flag
- **WHEN** no explicit enable signal is present
- **THEN** system SHALL keep legacy view active as baseline
- **AND** new view SHALL remain hidden by default

#### Scenario: Rollback by disabling new view
- **WHEN** operators disable the dual-view capability flag
- **THEN** system SHALL return to legacy-only rendering without data migration
- **AND** rollback SHALL NOT require backend protocol changes

### Requirement: Responsive Layout Degradation
Dual-view layout MUST remain usable on narrow viewports.

#### Scenario: Narrow viewport fallback
- **WHEN** available footer/status width cannot accommodate side-by-side content
- **THEN** system SHALL degrade to a non-overlapping fallback layout (single-column or legacy-priority)
- **AND** primary composer actions SHALL remain operable

#### Scenario: Wide viewport side-by-side rendering
- **WHEN** viewport width is sufficient
- **THEN** system SHALL render both views side by side
- **AND** no horizontal clipping SHALL obscure critical status text

### Requirement: Codex-Only Visibility Boundary
The dual context usage view MUST only be active in Codex engine sessions.

#### Scenario: Codex engine enables new view behavior
- **WHEN** current engine/provider is `codex` and dual-view capability is enabled
- **THEN** Composer SHALL render the new codex context summary view
- **AND** codex legacy token indicator SHALL be hidden in the same slot

#### Scenario: Non-codex engines keep legacy-only behavior
- **WHEN** current engine/provider is not `codex`
- **THEN** system SHALL NOT render the new dual context usage view
- **AND** existing legacy token indicator behavior SHALL remain unchanged

### Requirement: Tooltip Detail Format For Codex Summary
The codex summary tooltip MUST present textual details without an extra progress bar, and MUST distinguish lifecycle status from usage snapshot freshness.

#### Scenario: Tooltip displays required details
- **WHEN** user hovers the codex context summary indicator
- **THEN** tooltip SHALL show total token consumption
- **AND** tooltip SHALL show context usage ratio as percent and used/window
- **AND** tooltip SHALL show compaction status text when available

#### Scenario: Completed compaction with stale usage snapshot stays truthful
- **WHEN** the current Codex thread has just completed compaction
- **AND** the latest background-information usage snapshot has not yet refreshed to the post-compaction value
- **THEN** tooltip SHALL keep showing the latest available usage snapshot
- **AND** tooltip SHALL present an explicit sync-pending completion hint instead of implying that compaction failed or never happened

#### Scenario: Historical compaction messages do not pin current tooltip state
- **WHEN** thread history restore includes preserved compaction messages from earlier lifecycles
- **AND** the current thread is no longer compacting or freshly completing compaction
- **THEN** tooltip SHALL return to neutral current-state messaging
- **AND** the system SHALL NOT mark the current tooltip state as completed solely because historical compaction messages still exist

#### Scenario: No redundant progress bar in tooltip
- **WHEN** tooltip is rendered for codex summary
- **THEN** tooltip SHALL NOT render an additional bar-style progress indicator

### Requirement: Context Ledger And Dual View SHALL Read One Shared Snapshot

Context Ledger 与 Codex dual-view MUST 读取同一份 usage / compaction snapshot。

#### Scenario: ledger summary matches codex dual-view totals

- **WHEN** Codex dual-view 正在展示当前 background-info used/context-window/percent
- **THEN** ledger summary SHALL 使用同一份 used/context-window/percent snapshot
- **AND** 两个 surface SHALL NOT 出现互相矛盾的总量信息

#### Scenario: non-codex dual-view boundary remains unchanged

- **WHEN** 当前引擎不是 Codex
- **THEN** 既有 dual-view codex-only visibility boundary SHALL 保持不变
- **AND** ledger 的存在 SHALL NOT 改写 legacy-only usage render path

