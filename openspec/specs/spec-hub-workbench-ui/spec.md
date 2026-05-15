# spec-hub-workbench-ui Specification

## Purpose

Defines the spec-hub-workbench-ui behavior contract, covering Spec Hub Three-Column Layout with Execution Console.

## Requirements
### Requirement: Spec Hub Three-Column Layout with Execution Console

The system SHALL provide a Spec Hub workbench with three coordinated columns: change list, artifact panel, and execution
console.

#### Scenario: Open Spec Hub main workspace

- **WHEN** user enters Spec Hub
- **THEN** UI SHALL render change list, artifact panel, and execution console in one screen context
- **AND** selected change context SHALL remain synchronized across all columns

#### Scenario: Execution console tabs are available

- **WHEN** execution console is rendered
- **THEN** UI SHALL expose tabs for actions, guards, timeline, and environment diagnostics
- **AND** tab switching SHALL keep current change context unchanged

### Requirement: Execution Console Blocker Visibility

The system SHALL show preflight blockers before users trigger actions.

#### Scenario: Blocked strategy is visible in actions tab

- **WHEN** selected spec-kit action source resolves to `blocked`
- **THEN** actions tab SHALL display blocker reason and severity
- **AND** action trigger SHALL remain disabled until blocker is cleared

### Requirement: Structured Validation Feedback in Execution Console

The system SHALL present validation outcomes in a structured and locatable form.

#### Scenario: Validation failure rendering

- **WHEN** validation returns one or more failures
- **THEN** execution console SHALL display failed target, reason, and remediation hint
- **AND** user SHALL be able to navigate directly to the affected change/spec context

### Requirement: Icon-Plus-Label Semantic Consistency

The system MUST use consistent icon-plus-label semantics for status, risk, and action outcome in Spec Hub.

#### Scenario: Status badge rendering

- **WHEN** a change status is shown in list or detail panel
- **THEN** UI SHALL render status icon and text label together
- **AND** the same status SHALL use the same icon mapping across all Spec Hub surfaces

### Requirement: Interactive Tasks Checklist Writeback

The system SHALL allow users to toggle tasks checkboxes in Tasks artifact view and persist the result to `tasks.md`.

#### Scenario: Toggle task checkbox successfully

- **WHEN** user clicks an unchecked or checked task item in Tasks tab
- **THEN** UI SHALL update the checkbox state and persist markdown change to current change `tasks.md`
- **AND** task progress summary and action availability SHALL refresh in-place after writeback success

#### Scenario: Task writeback fails

- **WHEN** checkbox writeback fails due to IO or permission errors
- **THEN** UI SHALL rollback checkbox to previous state
- **AND** UI SHALL display actionable error feedback without requiring page reload

### Requirement: Verify-Task Decoupling and Archive Gate Clarity

The system MUST keep verification result decoupled from manual task completion state and enforce explicit archive gates.

#### Scenario: Verify passes without mutating tasks

- **WHEN** user runs strict verify and validation passes
- **THEN** system SHALL NOT auto-check unchecked task items in Tasks artifact
- **AND** Tasks checklist SHALL remain user-confirmed state only

#### Scenario: Archive blocked by incomplete required tasks

- **WHEN** latest verify passes but required tasks are still incomplete
- **THEN** archive action SHALL remain disabled
- **AND** guards panel SHALL show blocker details for incomplete required tasks

### Requirement: Archive Blocked AI Takeover Entry

The system SHALL provide an AI takeover entry in execution console actions when archive is blocked or recently failed.

#### Scenario: Show takeover entry on archive blockers

- **WHEN** archive action has one or more blockers
- **THEN** actions tab SHALL render AI takeover entry with blocker details
- **AND** user SHALL be able to choose available engine before triggering takeover

#### Scenario: Show takeover entry on latest archive failure

- **WHEN** latest archive event is failed in timeline
- **THEN** actions tab SHALL show latest archive output as takeover context
- **AND** user SHALL be able to trigger AI takeover without leaving Spec Hub

#### Scenario: Takeover result is visible

- **WHEN** AI takeover run finishes
- **THEN** actions tab SHALL display returned summary/output
- **AND** Spec Hub SHALL refresh runtime state automatically

### Requirement: AI Takeover Execution Visibility

The system SHALL provide explicit execution visibility for archive AI takeover, including running status, phase
progress,
log stream, and completion outcome.

#### Scenario: Running state appears immediately after trigger

- **WHEN** user clicks AI takeover trigger in actions tab
- **THEN** UI SHALL show running state within an interaction-safe delay window
- **AND** trigger button SHALL enter loading/disabled state to prevent duplicate runs

#### Scenario: Phase progress is visible during takeover

- **WHEN** takeover run is in progress
- **THEN** UI SHALL show phase progress for kickoff, agent execution, and finalize steps
- **AND** completed/current/failed phase state SHALL be visually distinguishable

#### Scenario: Failure summary is structured

- **WHEN** takeover run fails
- **THEN** UI SHALL show failed phase, error summary, and suggested next action
- **AND** user SHALL be able to inspect latest run logs in the same panel

#### Scenario: Refresh outcome is explicit after completion

- **WHEN** takeover run finishes and runtime refresh is attempted
- **THEN** UI SHALL show refresh success or refresh failed outcome explicitly
- **AND** user SHALL know whether manual refresh is still required

### Requirement: Spec-kit Strategy Visibility in Actions Panel

The system SHALL explicitly expose spec-kit tier and action sources in actions panel.

#### Scenario: Strategy strip is rendered

- **WHEN** actions tab opens for spec-kit workspace
- **THEN** UI SHALL show current tier (`minimal`/`guided`/`bridge`) and active route summary
- **AND** user SHALL be able to see effective route without opening raw logs

#### Scenario: Action source tags are consistent

- **WHEN** action list is rendered
- **THEN** each action SHALL display source tag (`native` | `ai` | `passthrough` | `blocked`)
- **AND** source tags SHALL match runtime strategy matrix

### Requirement: Provider Context Isolation in Coexistence Workspace

The UI SHALL isolate action panels by provider context when OpenSpec and spec-kit coexist.

#### Scenario: Switch provider context in same workspace

- **WHEN** user switches actions panel context from OpenSpec to spec-kit (or reverse)
- **THEN** UI SHALL render actions/timeline/guards from selected provider scope only
- **AND** unselected provider temporary run state SHALL remain unchanged

### Requirement: Five-Phase Feedback Card for Auto Runs

The system SHALL provide explicit phase feedback for spec-kit auto runs.

#### Scenario: Running state appears quickly

- **WHEN** user triggers auto run action
- **THEN** running feedback SHALL appear within interaction-safe delay
- **AND** current phase SHALL be visible on feedback card

#### Scenario: Completion state is actionable

- **WHEN** run completes
- **THEN** feedback card SHALL show structured terminal state (`success` | `failed` | `no_change`) and source identity
- **AND** card SHALL provide next-step actions (retry, switch source, manual passthrough)

### Requirement: Fallback Trace Visibility

The system MUST expose fallback transitions to avoid silent route switching.

#### Scenario: Native falls back to AI

- **WHEN** run transitions from native source to ai source
- **THEN** UI SHALL display fallback trace with failure reason
- **AND** timeline SHALL include corresponding fallback event

### Requirement: Execution Console Control IA

The system SHALL render execution console control tabs in `project-first` order and open `project` by default.

#### Scenario: Default tab and order follow project-first IA

- **WHEN** execution console is first rendered for a selected change
- **THEN** control tab order SHALL be `project` before `actions`
- **AND** default active tab SHALL be `project`

#### Scenario: Tab switching keeps change context stable

- **WHEN** user switches between `project` and `actions`
- **THEN** selected change context SHALL remain unchanged
- **AND** current runtime state SHALL not be reset

### Requirement: Project Tab Card Layout Refactor

The system SHALL present the `project` tab as clear card-based sections for path and project metadata operations.

#### Scenario: SPEC path card is independently operable

- **WHEN** user opens `project` tab
- **THEN** UI SHALL show `SPEC 位置配置` card with path input, effective-path display, and save/reset actions
- **AND** user SHALL be able to complete path operations without entering the actions tab

#### Scenario: Project info card has consistent control hierarchy

- **WHEN** user interacts with project metadata controls
- **THEN** UI SHALL show clear hierarchy for icon, copy, selector, command preview, and primary action button
- **AND** spacing/visual grouping SHALL keep controls readable on narrow panel width

### Requirement: Artifact Viewer SHALL Provide Structured Outline Navigation

Spec Hub 的 artifact viewer SHALL 为当前打开的 proposal / design / specs / tasks / verification 提供结构化 outline
或 quick-jump 导航，避免用户只能通过长滚动查找目标内容。

#### Scenario: Navigate a long artifact by outline

- **GIVEN** 当前 artifact 内容包含多个 markdown heading
- **WHEN** 用户在 Spec Hub 中浏览该 artifact
- **THEN** UI SHALL 提供由该 artifact 结构生成的 outline 或 quick-jump 导航
- **AND** 用户激活 outline 项后 SHALL 跳转到对应内容位置，而不改变当前 selected change

#### Scenario: Specs outline recognizes requirement and scenario blocks

- **GIVEN** 当前 artifact tab 为 `specs`
- **AND** 当前 spec source 包含 `Requirement:` 与 `Scenario:` 语义块
- **WHEN** Spec Hub 渲染该 spec source
- **THEN** outline SHALL 区分 requirement / scenario 项与普通 heading
- **AND** 用户 SHALL 能直接跳到对应 requirement 或 scenario 段落

#### Scenario: Tasks outline highlights sections with unfinished checklist items

- **GIVEN** 当前 artifact tab 为 `tasks`
- **AND** 某个任务分组下仍有未勾选的 checklist item
- **WHEN** Spec Hub 渲染该 tasks reader outline
- **THEN** 对应的 outline 项 SHALL 显示可见但低干扰的提醒标识
- **AND** 已全部完成的 outline 项 SHALL NOT 显示同类提醒

### Requirement: Artifact Viewer SHALL Support Linked Spec Reading Flow

Spec Hub SHALL 提供从 proposal capability 到 spec source 的显式阅读跳转能力，并在多 spec source 场景下保持当前 surface 的阅读上下文可恢复。

#### Scenario: Proposal capability jumps to matching spec source

- **GIVEN** 当前 change 同时包含 proposal 与一个或多个 spec source
- **AND** proposal 中存在与某个 spec capability 对应的阅读跳转入口
- **WHEN** 用户激活该 capability 跳转
- **THEN** Spec Hub SHALL 切换到 `specs` artifact
- **AND** 与该 capability 对应的 spec source SHALL 成为当前 active source

#### Scenario: Current spec source is restored within the same surface

- **GIVEN** 某个 change 具有多个 spec source
- **WHEN** 用户在当前 surface 中切换过 spec source，随后切换到其他 artifact 再返回 `specs`
- **THEN** Spec Hub SHALL 恢复该 surface 最近一次 active spec source
- **AND** source switcher SHALL 明确标识当前 active source

### Requirement: Reader Surface SHALL Support Collapsible Side Panes

Spec Hub 的阅读 surface SHALL 支持以正文为中心的双侧 pane 布局：左侧 change browsing 可折叠且可调宽，右侧阅读导航可折叠且默认收起。

#### Scenario: Reader outline starts collapsed and can be expanded on demand

- **GIVEN** 用户首次打开某个 surface 上的 artifact reader
- **WHEN** 当前 artifact 存在可用的 outline / linked spec 导航
- **THEN** reader outline pane SHALL 默认处于折叠状态
- **AND** 用户展开后 SHALL 在不切换 artifact 的前提下查看并使用当前文档的结构化导航

#### Scenario: Changes pane can collapse and resize safely

- **GIVEN** 当前 Spec Hub surface 处于非 artifact maximized 状态
- **WHEN** 用户折叠左侧 changes pane 或拖拽其宽度
- **THEN** 正文阅读区 SHALL 重新分配空间而不发生布局断裂
- **AND** changes pane 的折叠状态与安全宽度 SHALL 按 surface 维度被恢复

#### Scenario: Detached reader keeps the control-center entry discoverable

- **GIVEN** 当前 surface 为 detached Spec Hub reader
- **WHEN** 用户查看 artifact header controls
- **THEN** 系统 SHALL 保留既有 control center toggle
- **AND** detached surface 首次进入时 SHALL 默认维持 control center collapsed
- **AND** 阅读流 SHALL 不因执行台默认折叠而失去正文浏览能力

#### Scenario: Primary Spec Hub buttons open the detached reader directly

- **GIVEN** 用户通过 sidebar、header 或 file tree root action 触发 `Spec Hub`
- **WHEN** 系统处理该入口动作
- **THEN** 系统 SHALL 直接打开或聚焦 detached Spec Hub window
- **AND** 它 SHALL NOT 再把主窗体切换到嵌入式 Spec Hub 作为默认路径

### Requirement: Actions Tab Orchestration Layout

The system SHALL provide a unified orchestration area in `actions` tab for execution engine and proposal entries.

#### Scenario: Shared engine selector is shown once in actions orchestration area

- **WHEN** actions tab renders orchestration controls
- **THEN** UI SHALL provide a single shared execution engine selector
- **AND** selected engine SHALL be reused by apply, AI takeover, and proposal actions

#### Scenario: Engine selector and proposal triggers are in one row

- **WHEN** actions orchestration row is rendered
- **THEN** UI SHALL place `engine selector`, `new proposal trigger`, and `append proposal trigger` in the same row
- **AND** proposal triggers SHALL be rendered as compact icon buttons

#### Scenario: Engine selector displays engine icon

- **WHEN** engine selector renders trigger and options
- **THEN** each engine item SHALL display corresponding icon with label
- **AND** selected item view SHALL preserve engine icon for quick recognition

#### Scenario: Existing action chain remains available

- **WHEN** user enters actions tab
- **THEN** continue/apply/verify/archive actions SHALL remain available with existing gate semantics
- **AND** action blocks SHALL follow unified card layout

### Requirement: Proposal Entry and Modal Interaction

The system SHALL provide `new proposal` and `append proposal` entries via modal-driven input.

#### Scenario: User creates a new proposal from actions tab

- **WHEN** user clicks `new proposal`
- **THEN** system SHALL open an input modal for proposal content
- **AND** submission SHALL trigger AI processing with current shared engine

#### Scenario: User appends content to an existing change proposal

- **WHEN** user clicks `append proposal`
- **THEN** system SHALL open an input modal with target-change selection
- **AND** submission SHALL bind selected change and append content through AI processing

#### Scenario: Proposal modal supports rich text-area composition

- **WHEN** user enters proposal content in create/append modal
- **THEN** modal SHALL provide a multi-line rich composer area suitable for long-form context input
- **AND** composer SHALL preserve readable spacing and editing affordance in narrow panel layouts

#### Scenario: Proposal modal accepts image attachments

- **WHEN** user provides screenshot/image evidence for proposal context
- **THEN** modal SHALL support image attachment via explicit upload entry (and may support paste/drag-drop)
- **AND** attached images SHALL be previewable/removable before submit

#### Scenario: Icon-only proposal triggers remain accessible

- **WHEN** proposal triggers are rendered as icon-only buttons
- **THEN** each trigger SHALL expose accessible name/tooltip for discoverability
- **AND** keyboard focus state SHALL be clearly visible

### Requirement: Proposal Processing Feedback Reuse

The system SHALL reuse apply-grade realtime feedback for proposal processing flows.

#### Scenario: Proposal processing phase progress is visible

- **WHEN** create/append proposal processing is running
- **THEN** UI SHALL display phase-level realtime feedback including status/phase/engine
- **AND** user SHALL see streaming output/log updates without leaving current panel

#### Scenario: Proposal completion refreshes and summarizes result

- **WHEN** proposal processing completes
- **THEN** UI SHALL refresh Spec Hub runtime state automatically
- **AND** UI SHALL show visible result summary and related change reference when resolvable

### Requirement: Verify Action Optional Auto-Completion Toggle

The system SHALL provide an explicit opt-in toggle near `verify` action to enable completion-before-validate behavior
without changing default verify semantics.

#### Scenario: Verify keeps current behavior when auto-completion toggle is off

- **WHEN** user triggers `verify` with auto-completion toggle unchecked (default)
- **THEN** UI SHALL execute current strict validate behavior directly
- **AND** UI SHALL NOT run any completion step before validate

#### Scenario: Verify auto-completes missing verification when toggle is on

- **WHEN** user enables auto-completion toggle and triggers `verify` while `verification` artifact is missing
- **THEN** UI SHALL run completion step first and then run strict validate automatically after completion succeeds
- **AND** UI SHALL expose clear progress state for completion and validate phases

#### Scenario: Verify toggle is locked during running action

- **WHEN** verify-related action is running
- **THEN** auto-completion toggle SHALL be disabled
- **AND** user SHALL NOT be able to switch verify mode mid-run

### Requirement: Verify Auto-Completion Realtime Overlay Reuse

The system SHALL reuse the same feedback overlay model used by apply/proposal when verify auto-completion is enabled.

#### Scenario: Verify auto-completion opens shared feedback overlay

- **WHEN** user triggers `verify` with auto-completion enabled and `verification` artifact is missing
- **THEN** UI SHALL open the shared realtime feedback overlay (same interaction model as apply/proposal)
- **AND** overlay SHALL render status/phase/engine/output/log streams for the completion pipeline

#### Scenario: Verify auto-completion failure is explicit in overlay

- **WHEN** completion phase fails before strict validate
- **THEN** overlay SHALL show actionable failure detail
- **AND** UI SHALL explicitly indicate strict validate was skipped for this run

#### Scenario: Direct verify path keeps current behavior

- **WHEN** auto-completion is disabled or `verification` artifact already exists
- **THEN** UI SHALL keep existing direct verify flow
- **AND** UI SHALL NOT force open completion-feedback overlay

### Requirement: Feedback Overlay Draggable Positioning

The system SHALL allow users to drag feedback overlay to avoid visual occlusion.

#### Scenario: Overlay can be dragged from default anchor

- **WHEN** feedback overlay is visible
- **THEN** user SHALL be able to drag it by header handle
- **AND** default initial anchor SHALL remain bottom-right

#### Scenario: Dragging does not interrupt execution

- **WHEN** user drags overlay during running state
- **THEN** current execution pipeline SHALL continue without interruption
- **AND** streaming feedback SHALL continue updating in the moved overlay

### Requirement: Continue Action Optional AI Enhancement Toggle

The system SHALL provide an explicit opt-in toggle for `continue` AI enhancement while preserving default continue
behavior.

#### Scenario: Continue keeps current behavior when AI enhancement is off

- **WHEN** user triggers `continue` with `AI 增强` toggle unchecked (default)
- **THEN** UI SHALL execute current `continue` command-only behavior
- **AND** UI SHALL NOT run extra AI analysis step

#### Scenario: Continue runs command plus read-only AI enhancement when enabled

- **WHEN** user enables `AI 增强` and triggers `continue`
- **THEN** UI SHALL run OpenSpec continue command first and then run AI enhancement analysis
- **AND** enhancement output SHALL be shown as structured brief for user review

#### Scenario: Continue enhancement is explicitly read-only

- **WHEN** continue AI enhancement is running
- **THEN** UI copy SHALL indicate read-only analysis semantics
- **AND** flow SHALL NOT auto-check tasks or perform any writeback action

### Requirement: Execute Handoff from Continue AI Brief

The system SHALL allow `apply` execution to optionally consume the latest continue AI brief as additional context.

#### Scenario: Apply defaults to using latest continue brief when available

- **WHEN** latest continue AI brief exists for current change
- **THEN** UI SHALL show visible handoff status and default `use brief` to enabled
- **AND** apply execution SHALL include that brief in execution context

#### Scenario: User can disable brief handoff before apply

- **WHEN** user turns off `use continue brief` option
- **THEN** apply SHALL run with existing prompt path without brief injection
- **AND** execution behavior SHALL remain backward compatible

#### Scenario: Missing or stale brief does not block apply

- **WHEN** continue brief is missing or marked stale
- **THEN** UI MAY show hint/warning
- **AND** apply action SHALL remain executable

### Requirement: Post-Proposal Progressive Completion UX

The system SHALL keep completion-oriented actions reachable when a new change is still in proposal-only or
artifact-incomplete stage.

#### Scenario: Continue remains available for proposal-only change

- **WHEN** selected change has proposal but is missing design/specs delta/tasks
- **THEN** `continue` action SHALL remain clickable
- **AND** UI SHALL NOT block continue due to those missing artifacts alone

#### Scenario: Apply is not blocked by missing tasks artifact itself

- **WHEN** selected change is missing `tasks.md` but has enough upstream context to run apply guidance/execution
- **THEN** `apply` action SHALL remain reachable for task-generation purpose
- **AND** UI SHALL NOT use `missing tasks.md` as a self-blocking condition

#### Scenario: Missing specs delta provides actionable next-step hint

- **WHEN** selected change is missing specs delta required before apply
- **THEN** UI SHALL present actionable next-step guidance (for example: run `continue` first)
- **AND** guidance SHALL be consistent with current action enabled/disabled states

### Requirement: Session Navigation SHALL Exit Spec Hub Foreground

当 Spec Hub 处于前台打开状态时，系统 SHALL 允许用户通过左侧会话点击直接切换到目标会话，并退出 Spec Hub 前台视图。

#### Scenario: Switch to target session while Spec Hub is open

- **GIVEN** 用户当前处于 Spec Hub 前台视图
- **WHEN** 用户点击左侧任意会话条目
- **THEN** 系统 SHALL 激活并进入目标会话
- **AND** Spec Hub SHALL 不再保持前台覆盖态

#### Scenario: Consecutive session clicks from Spec Hub foreground

- **GIVEN** 用户从 Spec Hub 前台连续点击不同会话
- **WHEN** 每次点击事件触发导航
- **THEN** 系统 SHALL 始终以最近一次点击的会话作为最终激活会话
- **AND** 不得出现停留在 Spec Hub 前台而未进入会话的状态

### Requirement: Completion Feedback SHALL Show Accurate Changed Files

当 OpenSpec 变更创建成功并产生文件变更时，收尾反馈弹窗 SHALL 准确展示变更文件列表，不得错误显示为空。

#### Scenario: Success feedback shows changed files from creation result

- **GIVEN** 变更创建流程返回成功状态
- **AND** 结果中包含非空变更文件列表
- **WHEN** 渲染收尾反馈弹窗
- **THEN** “变更文件”区域 SHALL 展示实际文件路径列表
- **AND** 不得渲染为`(无)`

#### Scenario: Empty marker only appears when no changed files exist

- **GIVEN** 变更创建流程返回成功状态
- **AND** 结果中不包含任何变更文件
- **WHEN** 渲染收尾反馈弹窗
- **THEN** “变更文件”区域 SHALL 显示`(无)`作为空状态标记

### Requirement: Changes List SHALL Render Date-Prefixed Tree in Multiple Views

在 Spec Hub 的变更列表中，系统 SHALL 将名称符合日期前缀模式（`YYYY-MM-DD-*`）的条目按日期进行树形分组展示，并在“全部”与“已归档”视图保持一致。

#### Scenario: Group changes by date prefix in all and archived views

- **GIVEN** 变更集合中包含多个以`YYYY-MM-DD-*`命名的条目
- **WHEN** 用户进入“全部”或“已归档”视图
- **THEN** 系统 SHALL 先按日期前缀生成分组节点
- **AND** 每个分组节点下 SHALL 展示对应变更子项

#### Scenario: Expand and collapse date group node

- **GIVEN** 用户位于“全部”或“已归档”视图且存在日期分组节点
- **WHEN** 用户点击某个日期分组节点
- **THEN** 系统 SHALL 在展开与折叠状态间切换
- **AND** 子项点击行为 SHALL 与现有变更列表一致（进入详情/切换当前变更）

#### Scenario: Fallback bucket for non-date-prefixed items

- **GIVEN** 变更列表中存在不匹配`YYYY-MM-DD-*`命名模式的条目
- **WHEN** 渲染“全部”或“已归档”视图
- **THEN** 系统 SHALL 将该类条目归入“其它”分组
- **AND** 该分组条目 SHALL 可见且可操作，不得被过滤丢失

### Requirement: Toolbar SHALL Provide Expand-Collapse-All Control and Icon Accents

变更列表按钮组前的控制位 SHALL 提供“展开全部/折叠全部”功能，并替代漏斗 icon；系统 SHALL 提供语义化 icon
点缀以增强可读性，但不得削弱文本信息与可访问性。

#### Scenario: Replace funnel slot with expand-collapse-all control

- **GIVEN** 用户打开 Spec Hub 变更列表区域
- **WHEN** 顶部控制区渲染完成
- **THEN** 按钮组前 SHALL 展示“展开全部/折叠全部”控制
- **AND** 原漏斗 icon SHALL 不再作为该位置默认控制

#### Scenario: Expand or collapse all groups in current view

- **GIVEN** 当前视图存在多个日期分组节点
- **WHEN** 用户点击“展开全部”或“折叠全部”控制
- **THEN** 当前视图内所有日期分组 SHALL 同步切换到目标状态
- **AND** 切换筛选视图后 SHALL 不污染其它视图的分组展开状态

#### Scenario: Icon accents preserve clarity and accessibility

- **GIVEN** 系统为分组节点与状态条目添加语义化 icon
- **WHEN** 用户使用鼠标或键盘浏览列表
- **THEN** icon SHALL 仅作为视觉辅助，不替代文本状态
- **AND** 可访问名称、点击热区与交互反馈 SHALL 保持不退化

### Requirement: Spec Hub UI Copy SHALL Be Internationalized

Spec Hub 模块中的可见 UI 文案 SHALL 通过 i18n 资源渲染，不得在生产 UI 中使用硬编码中文/英文文本作为主文案来源。

#### Scenario: Key UI labels are localized in supported locales

- **GIVEN** 用户在 `zh-CN` 或 `en-US` locale 下使用 Spec Hub
- **WHEN** 渲染变更列表、顶部控制区与收尾反馈弹窗
- **THEN** 关键文案（如“其它”“展开全部/折叠全部”“变更文件”“(无)”）SHALL 来自 i18n key
- **AND** 文案 SHALL 随 locale 切换而更新

#### Scenario: No raw i18n key leakage in visible UI

- **GIVEN** i18n 资源已加载并进入 Spec Hub 页面
- **WHEN** 用户浏览主要交互路径（列表浏览、创建反馈、验证前提示）
- **THEN** UI SHALL 不显示原始 key 字符串（例如 `specHub.xxx`）
- **AND** 文案缺失时 SHALL 提供可读回退而非 key 直出

### Requirement: Execution Console Default-Collapsed Preference

The system SHALL open Spec Hub with the execution console collapsed by default for a workspace/spec-root scope that has
no saved console visibility preference, while restoring explicit user choice on subsequent visits.

#### Scenario: First visit opens with console collapsed

- **WHEN** user opens Spec Hub in a workspace/spec-root scope with no stored console visibility preference
- **THEN** execution console SHALL render in collapsed state
- **AND** change list and artifact panel SHALL remain immediately readable without requiring a manual collapse action

#### Scenario: Saved console preference is restored

- **WHEN** user has previously expanded or collapsed the execution console in the current workspace/spec-root scope
- **THEN** Spec Hub SHALL restore that saved visibility state on the next render
- **AND** selecting another change or refreshing runtime data SHALL NOT reset the saved preference

### Requirement: Spec Hub Artifact Reader SHALL Keep Dedicated Reading Controls Non-Intrusive

#### Scenario: detached entry does not force main surface navigation

- **WHEN** a global Spec Hub entry is activated from the sidebar, file tree, or header shortcut
- **THEN** the system SHALL prefer opening or focusing the detached Spec Hub reader
- **AND** it SHALL NOT force the main app surface away from chat, Git, or files solely to show Spec Hub

#### Scenario: reader navigation remains collapsed by default

- **WHEN** a long proposal, design, tasks, verification, or spec artifact opens
- **THEN** artifact outline / quick-jump navigation SHALL be available
- **AND** it SHALL default to a non-intrusive collapsed state unless the user explicitly expands it

### Requirement: Backlog Pool Triage View

The system SHALL provide a backlog pool view for non-archived changes that users want to keep out of the current active
working set without archiving them.

#### Scenario: Move change into backlog pool

- **WHEN** user triggers `Move to backlog pool` for a non-archived change row
- **THEN** the change SHALL appear in the `backlog` filter view
- **AND** the `active` filter SHALL stop listing that change unless backlog membership is removed later

#### Scenario: Return change from backlog pool

- **WHEN** user triggers `Remove from backlog pool` for a backlog member
- **THEN** the change SHALL be removed from the `backlog` filter view
- **AND** it SHALL return to the `active` view whenever its underlying lifecycle status still qualifies as active

#### Scenario: Backlog membership does not replace lifecycle status

- **WHEN** a change belongs to the backlog pool
- **THEN** the row SHALL continue to render its underlying lifecycle status such as `draft`, `ready`, or `blocked`
- **AND** action availability and archive/verify gate semantics SHALL remain derived from the existing lifecycle rules

#### Scenario: Blocked backlog item stays visible in blocked view

- **WHEN** a backlog member is also in blocked lifecycle status
- **THEN** the `blocked` filter SHALL still include that change
- **AND** blocked risk visibility SHALL NOT depend on whether the change also belongs to backlog pool

### Requirement: Backlog Action Accessibility

The system SHALL expose backlog move/remove actions through a context menu affordance without making the action
mouse-only.

#### Scenario: Right click opens triage action

- **WHEN** user performs a secondary click on a change row that supports backlog triage
- **THEN** Spec Hub SHALL present the appropriate backlog action for the row's current membership
- **AND** action labels SHALL distinguish `Move to backlog pool` from `Remove from backlog pool`

#### Scenario: Keyboard-accessible equivalent is available

- **WHEN** a change row is focused without pointer interaction
- **THEN** user SHALL still be able to reach the same backlog action set through a keyboard-accessible equivalent entry
- **AND** the accessible path SHALL preserve the same effect and row context as the pointer menu
