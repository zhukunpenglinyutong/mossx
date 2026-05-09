# client-ui-visibility-controls Specification

## Purpose
Define how optional client chrome panels and icon buttons can be hidden from appearance settings without disabling the underlying application features or the core conversation path.
## Requirements
### Requirement: User can configure client UI visibility from appearance settings
The system SHALL provide client UI visibility controls in the basic appearance settings surface.

#### Scenario: Visibility controls appear in basic appearance settings
- **WHEN** user opens settings and navigates to basic appearance
- **THEN** system SHALL show controls for configurable panels and icon buttons
- **AND** the controls SHALL be grouped by parent panel

#### Scenario: Global runtime notice dock appears as an independent panel entry
- **WHEN** user opens the client UI visibility list in basic appearance settings
- **THEN** system SHALL show a dedicated panel-level visibility entry for the global runtime notice dock
- **AND** that entry SHALL NOT be merged into the bottom activity panel or any unrelated child-control group

#### Scenario: Default state is fully visible
- **WHEN** no client UI visibility preference exists
- **THEN** system SHALL treat every supported panel and icon button as visible

#### Scenario: Restore default visibility
- **WHEN** user activates the reset visibility action
- **THEN** system SHALL restore every supported panel and icon button to visible

### Requirement: Visibility controls support panel-level hiding
The system SHALL allow supported UI panels to be hidden without changing the underlying feature state.

#### Scenario: Hide a supported panel
- **WHEN** user hides a supported panel from appearance settings
- **THEN** system SHALL remove that panel from the active client UI
- **AND** system SHALL keep the panel's underlying feature state intact

#### Scenario: Show a hidden supported panel
- **WHEN** user shows a previously hidden supported panel
- **THEN** system SHALL render that panel again
- **AND** system SHALL restore the panel using current runtime data rather than resetting it

#### Scenario: Hide the global runtime notice dock
- **WHEN** user hides the global runtime notice dock from appearance settings
- **THEN** system SHALL remove both the minimized dock entry and expanded dock panel from the active client UI
- **AND** system SHALL keep the dock's underlying notice feed and dock mode state intact

#### Scenario: Restore the hidden global runtime notice dock
- **WHEN** user shows the global runtime notice dock again after hiding it
- **THEN** system SHALL render the dock again using current session notice data
- **AND** system SHALL restore the dock using its current minimized or expanded state instead of forcing a default mode

### Requirement: Visibility controls support icon-level hiding
The system SHALL allow supported icon buttons to be hidden independently when their parent panel is visible.

#### Scenario: Hide a single icon button
- **WHEN** user hides one supported icon button from appearance settings
- **THEN** system SHALL remove that icon button from the active client UI
- **AND** system SHALL keep sibling icon buttons visible when their own preference is visible

#### Scenario: Parent panel hidden overrides child icon visibility
- **WHEN** a parent panel is hidden
- **THEN** system SHALL hide all child icon buttons of that panel regardless of each child icon preference

#### Scenario: Child icon preference survives parent panel restore
- **WHEN** user hides a child icon button, hides the parent panel, and later shows the parent panel again
- **THEN** system SHALL keep the child icon button hidden
- **AND** system SHALL show sibling icon buttons that remain visible in preference

### Requirement: Maximum hidden mode preserves normal conversation
The system SHALL preserve the core conversation path even when all supported optional panels and icon buttons are hidden.

#### Scenario: Composer remains usable after maximum hiding
- **WHEN** user hides every supported optional panel and icon button
- **THEN** system SHALL keep the active conversation canvas visible
- **AND** system SHALL keep the composer input visible and usable
- **AND** system SHALL keep message sending available

#### Scenario: Settings remains recoverable after maximum hiding
- **WHEN** user hides every supported optional panel and icon button
- **THEN** system SHALL keep a path to settings available so the user can restore visibility

### Requirement: Hidden UI does not disable existing functionality
The system SHALL treat hidden panels and icon buttons as presentation changes only.

#### Scenario: Runtime state is retained when an activity panel is hidden
- **WHEN** user hides the bottom activity panel
- **THEN** system SHALL NOT clear task, agent, edit, or latest conversation data

#### Scenario: Runtime notices continue collecting when the dock is hidden
- **WHEN** user hides the global runtime notice dock and the app pushes new runtime notices
- **THEN** system SHALL continue recording those notices into the same global notice feed
- **AND** hiding the dock SHALL NOT disable runtime notice producers

#### Scenario: Shortcuts remain valid when an icon is hidden
- **WHEN** user hides an icon button that also has an existing shortcut or alternate command entry
- **THEN** system SHALL keep the shortcut or alternate command behavior unchanged

#### Scenario: Hidden interactive controls are not focusable
- **WHEN** a supported icon button is hidden
- **THEN** system SHALL remove that button from keyboard focus order and the accessibility tree

### Requirement: Visibility preference persists safely
The system SHALL persist client UI visibility preference across application restarts and recover safely from invalid stored data.

#### Scenario: Restore saved visibility preference after restart
- **WHEN** user hides supported panels or icon buttons and restarts the app
- **THEN** system SHALL restore the saved visibility preference after startup

#### Scenario: Invalid preference falls back to visible
- **WHEN** persisted visibility preference is missing, malformed, or contains unsupported values
- **THEN** system SHALL ignore invalid fields
- **AND** system SHALL treat affected panels and icon buttons as visible
- **AND** system SHALL keep the main conversation UI usable

#### Scenario: Unknown future keys are ignored
- **WHEN** persisted visibility preference contains unknown panel or icon ids
- **THEN** system SHALL ignore those unknown ids
- **AND** system SHALL continue applying known ids normally

### Requirement: Bottom Activity Checkpoint Visibility MUST Migrate From Legacy Edits Preference

系统 MUST 将底部活动区的可见性控制从 legacy `Edits` 迁移到新的 `Checkpoint/结果`，同时保持老用户配置可兼容恢复。

#### Scenario: appearance settings shows checkpoint label instead of edits

- **WHEN** 用户打开 basic appearance 中的 client UI visibility controls
- **THEN** 系统 MUST 展示 `Checkpoint/结果` 对应的 child control 文案
- **AND** MUST NOT 继续把该入口对用户展示为 `Edits`

#### Scenario: persisted legacy edits key restores checkpoint visibility

- **WHEN** 已持久化的可见性偏好只包含 legacy `bottomActivity.edits`
- **THEN** 系统 MUST 将其视为 `bottomActivity.checkpoint` 的兼容 alias
- **AND** 老用户原本的显示/隐藏偏好 MUST 在升级后继续生效

#### Scenario: new saves normalize to checkpoint key

- **WHEN** 用户在新版本中修改底部活动区该项可见性
- **THEN** 系统 MUST 将新的持久化写回到 `bottomActivity.checkpoint`
- **AND** 后续读取 SHOULD 优先使用新的 canonical key

#### Scenario: hidden checkpoint keeps underlying result data alive

- **WHEN** 用户隐藏 `Checkpoint/结果` 入口
- **THEN** 系统 MUST 继续保留其底层 facts、verdict 与 summary state
- **AND** 隐藏操作 MUST 仅影响展示，不得清空底层结果判断数据

### Requirement: Claude Thinking Toggle MUST Control Claude Reasoning Presentation

The system MUST treat the Claude thinking toggle as the canonical user intent for whether Claude reasoning content is visible in the conversation canvas.

#### Scenario: Claude thinking disabled hides reasoning presentation
- **WHEN** the active engine is `claude`
- **AND** the resolved Claude `alwaysThinkingEnabled` state is `false`
- **AND** the active conversation contains `reasoning` items from realtime or history
- **THEN** the conversation canvas MUST NOT render visible Claude reasoning body text
- **AND** it MUST NOT render the Claude docked reasoning module for those hidden items

#### Scenario: Claude thinking enabled allows reasoning presentation
- **WHEN** the active engine is `claude`
- **AND** the resolved Claude `alwaysThinkingEnabled` state is `true`
- **AND** the active conversation contains `reasoning` items
- **THEN** the conversation canvas MUST be allowed to render Claude reasoning using the existing reasoning presentation

#### Scenario: legacy hide flag does not override explicit toggle state
- **WHEN** an explicit Claude thinking visibility state is available from the composer or conversation container
- **AND** legacy local storage contains `ccgui.claude.hideReasoningModule`
- **THEN** the system MUST use the explicit Claude thinking visibility state for default product behavior
- **AND** the legacy flag MUST NOT make the visible reasoning state contradict the explicit toggle state

#### Scenario: non-Claude engines are isolated
- **WHEN** the active engine is `codex`, `gemini`, or `opencode`
- **AND** Claude thinking visibility is disabled
- **THEN** the system MUST NOT hide that engine's reasoning presentation solely because of the Claude thinking toggle

### Requirement: Claude Thinking Visibility State MUST Fail Safely

The system MUST recover safely when Claude thinking visibility cannot be read.

#### Scenario: visibility state is unavailable
- **WHEN** the app cannot resolve Claude `alwaysThinkingEnabled` from provider settings or local Claude settings
- **THEN** message sending MUST remain available
- **AND** the conversation canvas MUST use a safe fallback that does not corrupt or delete conversation data

#### Scenario: visibility state changes during an active conversation
- **WHEN** the user changes the Claude thinking toggle while a Claude conversation is open
- **THEN** the conversation canvas MUST re-evaluate Claude reasoning presentation from the latest toggle state
- **AND** already captured reasoning transcript data MUST remain available for presentation if the user re-enables thinking
