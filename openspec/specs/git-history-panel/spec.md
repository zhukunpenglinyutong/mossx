# git-history-panel Specification

## Purpose

TBD - created by archiving change git-history-panel. Update Purpose after archive.
## Requirements
### Requirement: Four-Region Git Log Workspace

The system SHALL provide a four-region Git History workspace that mirrors the core interaction model of IDEA Git Log.

#### Scenario: Open panel from sidebar

- **WHEN** user clicks the Git History icon in the left sidebar rail
- **THEN** the system opens a four-region panel:
    - Left: overview (working tree summary)
    - Left-center: branch list
    - Right-center: commit log with graph
    - Right: commit details (file list + commit message)

#### Scenario: Right column split layout

- **WHEN** the panel is open
- **THEN** the right column SHALL be split vertically into:
    - Top: changed files list
    - Bottom: selected commit message

#### Scenario: Click file to preview diff in modal

- **WHEN** user clicks a file item in changed files list
- **THEN** the system opens a modal diff preview for that file
- **AND** commit details main layout SHALL remain unchanged

---

### Requirement: Panel State Persistence

The system SHALL persist panel UI state to restore user context.

#### Scenario: Restore layout state

- **WHEN** user reopens the panel
- **THEN** the system restores previously saved column widths and split ratio

#### Scenario: Restore navigation state

- **WHEN** user reopens the panel
- **THEN** the system restores selected branch, selected commit, and active filters when still valid

#### Scenario: Persist open or closed state

- **WHEN** user closes and restarts the application
- **THEN** the panel open/closed state SHALL be restored

---

### Requirement: Commit Log Table Structure

The middle column SHALL display commit rows with graph and key metadata columns.

#### Scenario: Commit row rendering

- **WHEN** commit rows are loaded
- **THEN** each row shows:
    - Graph node/edges
    - Subject line
    - Ref labels (branch/tag)
    - Author
    - Relative time

#### Scenario: Truncated subject with full tooltip

- **WHEN** subject exceeds row width
- **THEN** row shows truncated text and full subject on hover tooltip

---

### Requirement: Keyboard Navigation Inside Panel

The system SHALL support keyboard navigation for history browsing.

#### Scenario: Arrow navigation

- **WHEN** user presses `↑` or `↓`
- **THEN** the previous/next commit row becomes selected

#### Scenario: Enter on selected row

- **WHEN** user presses `Enter` on a selected commit
- **THEN** the right column SHALL focus that commit details

#### Scenario: Escape closes panel

- **WHEN** user presses `Escape`
- **THEN** the Git History panel SHALL close

---

### Requirement: Loading, Error and Empty States

The panel SHALL expose clear operational states.

#### Scenario: Loading history

- **WHEN** commit history is being fetched
- **THEN** middle column shows loading indicator

#### Scenario: Backend error

- **WHEN** history fetch fails
- **THEN** middle column shows user-friendly error with `Retry` action

#### Scenario: Empty repository

- **WHEN** repository has no commits
- **THEN** middle column shows "No commits found in this repository"

---

### Requirement: Theme and Visual Consistency

The panel SHALL follow application theme variables.

#### Scenario: Dark theme

- **WHEN** application is in dark mode
- **THEN** panel and diff colors follow dark theme tokens with readable contrast

#### Scenario: Light theme

- **WHEN** application is in light mode
- **THEN** panel and diff colors follow light theme tokens with readable contrast

---

### Requirement: Large History Performance Baseline

The commit log SHALL remain usable for large repositories.

#### Scenario: Virtualized rendering

- **WHEN** repository has more than 10,000 commits
- **THEN** the commit list uses virtual scrolling and renders only visible rows plus buffer

#### Scenario: Incremental loading

- **WHEN** user scrolls near list bottom
- **THEN** system loads next page (default 100 commits) without blocking current interactions

### Requirement: Git History worktree commit surface MUST mirror the main git panel commit semantics

Git History/HUB 内的 worktree 提交区 MUST 以右侧主 Git 面板为 canonical surface，保持同一套 commit scope、commit hint、button enablement 与 AI generation 语义。

#### Scenario: worktree surface mirrors main panel commit feedback

- **WHEN** Git History/HUB worktree 提交区与主 Git 面板面对同一组 staged / unstaged / selected changes
- **THEN** 两个 surface 的 commit button enablement MUST 一致
- **AND** 两个 surface 的 hint copy MUST 表达同一 commit scope 状态
- **AND** 空 scope 时两者都 MUST 阻断 commit

#### Scenario: worktree surface mirrors main panel generation menu semantics

- **WHEN** 用户在 Git History/HUB worktree 提交区触发 AI 生成提交信息
- **THEN** 系统 MUST 提供与主 Git 面板一致的 engine selection 与 language selection 入口
- **AND** 生成请求 MUST 基于当前 worktree surface 的 commit scope
- **AND** 生成结果 MUST 与主 Git 面板在相同 scope 下保持语义一致

#### Scenario: worktree surface keeps file tree scope behavior stable across platforms

- **WHEN** Git History/HUB worktree 提交区在 tree 模式下渲染 Windows 风格或 POSIX 风格路径
- **THEN** file row、folder row 与 section row 的 commit scope 判断 MUST 基于 normalized path contract
- **AND** 用户在不同平台下对同一文件集合执行 inclusion toggle 时 MUST 得到相同结果

### Requirement: Push Dialog Before Execution

The Git History toolbar SHALL open a push configuration dialog before executing push.

#### Scenario: Open push dialog

- **WHEN** user clicks toolbar `Push`
- **THEN** system SHALL open a push dialog
- **AND** system SHALL NOT execute push immediately

#### Scenario: Configure push target

- **WHEN** push dialog is open
- **THEN** dialog SHALL display current local branch as readonly value
- **AND** user SHALL be able to configure `remote` and `target remote branch`
- **AND** target remote branch SHALL support both dropdown selection and manual input
- **AND** dialog SHALL show target summary in `sourceBranch -> remote:targetBranch` form
- **AND** when `Push to Gerrit` is enabled, target summary SHALL switch to `sourceBranch -> remote:refs/for/targetBranch`

#### Scenario: Remote dropdown opens upward in push dialog

- **WHEN** user opens remote selector in push dialog
- **THEN** remote dropdown menu SHALL expand upward to avoid overlapping footer operation controls

#### Scenario: Show outgoing commits preview

- **WHEN** push dialog is open
- **THEN** system SHALL display `outgoing commits` list for current push target
- **AND** each list item SHALL include commit summary metadata (subject, sha, author, time)

#### Scenario: Preview panes keep fixed viewport with internal scrolling

- **WHEN** outgoing commit list or changed file list exceeds visible height
- **THEN** preview panes SHALL keep fixed height
- **AND** commit list and file list SHALL provide internal scrollbars instead of stretching dialog layout

#### Scenario: Target remote branch missing enters new-branch first-push mode

- **WHEN** preview result indicates target remote branch ref is missing (`targetFound=false`)
- **THEN** dialog SHALL show `New` marker in target summary area
- **AND** dialog SHALL keep preview section layout stable with first-push guidance placeholder
- **AND** dialog SHALL NOT render outgoing commit list items and selected commit detail content for that state

#### Scenario: Show selected commit file tree and details

- **WHEN** user selects a commit from outgoing list
- **THEN** system SHALL display changed files for that commit
- **AND** system SHALL display commit detail summary (message, sha, author, time)

#### Scenario: Open preview file diff by explicit file click

- **WHEN** selected commit details are visible in push preview
- **AND** user clicks one changed file row
- **THEN** system SHALL open a popup diff modal for that file
- **AND** selecting commit items alone SHALL NOT auto-open diff modal

#### Scenario: Refresh preview when push target changes

- **WHEN** user changes `remote` or `target remote branch`
- **THEN** system SHALL recompute outgoing commit preview
- **AND** list/detail panes SHALL update to new target context (or switch to new-branch first-push placeholder state
  when `targetFound=false`)

#### Scenario: Empty preview state blocks accidental push

- **WHEN** no outgoing commits exist for current push target
- **THEN** dialog SHALL show explicit empty state
- **AND** confirm push action SHALL be disabled

#### Scenario: Toggle Gerrit mode

- **WHEN** user enables `Push to Gerrit`
- **THEN** dialog SHALL reveal `Topic`, `Reviewers`, `CC` fields
- **AND** disabling Gerrit mode SHALL hide those fields

#### Scenario: Close dialog without side effects

- **WHEN** user cancels dialog or presses `Escape`
- **THEN** dialog closes
- **AND** no push command SHALL be sent

### Requirement: Commit Action Button Group

The commit history workspace SHALL provide a linked commit action button group that mirrors key commit-row context
actions.

#### Scenario: Button group actions

- **WHEN** Git History panel is open and a commit is selected
- **THEN** commit action button group SHALL expose:
    - `Copy Revision Number`
    - `Create Branch from Commit`
    - `Reset Current Branch to Here...`

#### Scenario: Selection-driven availability

- **WHEN** no commit is selected
- **THEN** commit action button group SHALL be disabled
- **AND** no action SHALL execute

#### Scenario: Shared availability with context menu

- **WHEN** repository enters busy write-operation state
- **THEN** `Reset Current Branch to Here...` SHALL be disabled in button group
- **AND** the same action SHALL be disabled in commit-row context menu

### Requirement: Pull Dialog Before Execution

The Git History toolbar SHALL open a pull configuration dialog before executing pull.

#### Scenario: Open pull dialog

- **WHEN** user clicks toolbar `Pull`
- **THEN** system SHALL open a pull dialog
- **AND** system SHALL NOT execute pull immediately

#### Scenario: Configure pull target and options

- **WHEN** pull dialog is open
- **THEN** dialog SHALL allow configuring `remote` and `target remote branch`
- **AND** target remote branch SHALL support both dropdown selection and manual input
- **AND** dialog SHALL allow selecting pull options and render selected options as removable chips

#### Scenario: Disable conflicting strategy options

- **WHEN** one strategy option among `--rebase`, `--ff-only`, `--no-ff`, `--squash` is selected
- **THEN** conflicting strategy options SHALL be disabled in options menu
- **AND** additive options (`--no-commit`, `--no-verify`) SHALL remain selectable when valid

#### Scenario: Show pull intent details and example

- **WHEN** pull dialog is open
- **THEN** dialog SHALL display `Intent`, `Will Happen`, `Will NOT Happen`, and `Example` sections
- **AND** `Example` SHALL reflect current pull target/options state

#### Scenario: Pull toolbar and dialog title icon consistency

- **WHEN** pull action is rendered in toolbar and pull dialog title
- **THEN** system SHALL show pull icon in both locations
- **AND** icon mapping SHALL stay visually consistent for the same action

#### Scenario: Confirm pull from dialog

- **WHEN** user confirms pull in dialog
- **THEN** dialog SHALL submit configured options to pull operation
- **AND** dialog SHALL enter in-progress state and disable duplicate submission

#### Scenario: Close pull dialog without side effects

- **WHEN** user cancels pull dialog or presses `Escape`
- **THEN** dialog closes
- **AND** no pull command SHALL be sent

### Requirement: Sync, Fetch, and Refresh Dialogs Before Execution

The Git History toolbar SHALL require confirmation dialogs for `Sync`, `Fetch`, and `Refresh` actions before execution.

#### Scenario: Open sync dialog

- **WHEN** user clicks toolbar `Sync`
- **THEN** system SHALL open a sync confirmation dialog
- **AND** system SHALL NOT execute sync immediately

#### Scenario: Open fetch dialog

- **WHEN** user clicks toolbar `Fetch`
- **THEN** system SHALL open a fetch confirmation dialog
- **AND** system SHALL NOT execute fetch immediately

#### Scenario: Open refresh dialog

- **WHEN** user clicks toolbar `Refresh`
- **THEN** system SHALL open a refresh confirmation dialog
- **AND** system SHALL NOT execute refresh immediately

#### Scenario: Dialogs provide detailed intent and examples

- **WHEN** sync/fetch/refresh dialog is open
- **THEN** dialog SHALL display `Intent`, `Will Happen`, `Will NOT Happen`, and `Example` sections
- **AND** sync dialog example SHALL describe `pull -> push` sequence
- **AND** sync dialog SHALL display preflight summary (`source -> remote:target`, ahead/behind, outgoing sample)
- **AND** fetch dialog example SHALL describe fetch-only behavior without merge
- **AND** fetch dialog SHALL show fetch scope (default `all remotes`)
- **AND** refresh dialog example SHALL describe UI data reload behavior without Git network commands

#### Scenario: Distinct icons for sync/fetch/refresh semantics

- **WHEN** toolbar and dialog titles render sync/fetch/refresh actions
- **THEN** each action SHALL use its own icon mapping
- **AND** fetch and refresh SHALL NOT reuse the same icon

#### Scenario: Dialog visual hierarchy for readability

- **WHEN** any sync/fetch/refresh confirmation dialog is open
- **THEN** dialog SHALL present a three-zone layout: header, intent details, footer actions
- **AND** key risk/impact message SHALL remain visually distinguishable from secondary text

#### Scenario: Confirm sync/fetch/refresh from dialog

- **WHEN** user confirms sync/fetch/refresh dialog
- **THEN** system SHALL execute the corresponding action once
- **AND** dialog SHALL enter in-progress state and disable duplicate submission

#### Scenario: Close sync/fetch/refresh dialog without side effects

- **WHEN** user cancels sync/fetch/refresh dialog or presses `Escape`
- **THEN** dialog closes
- **AND** no corresponding action SHALL be sent

### Requirement: Operation Error Notice Persistence and Manual Dismiss

The Git History panel SHALL keep operation error notice visible until user explicitly dismisses it or a new operation
replaces it.

#### Scenario: Error notice does not auto-dismiss

- **WHEN** a toolbar or context Git operation fails
- **THEN** panel SHALL show error notice in error style
- **AND** notice SHALL NOT auto-dismiss after fixed 5-second timeout

#### Scenario: User manually dismisses error notice

- **WHEN** error notice is visible
- **THEN** panel SHALL provide explicit close control
- **AND** clicking close SHALL clear current error notice immediately

#### Scenario: Success notice remains short-lived

- **WHEN** a Git operation succeeds
- **THEN** panel MAY auto-dismiss success notice after short timeout
- **AND** success notice lifecycle SHALL NOT force error notice auto-dismiss behavior

### Requirement: PR Entry in Git Toolbar

The Git History toolbar SHALL expose a `PR` entry in the top action area before pull/push/sync actions.

#### Scenario: Toolbar action order remains stable

- **WHEN** Git History panel is rendered
- **THEN** toolbar SHALL render `PR` action in the designated action group
- **AND** existing pull/push/sync/fetch/refresh actions SHALL keep their functional order

#### Scenario: PR action disabled reason

- **WHEN** current branch context is unavailable
- **THEN** `PR` action SHALL be disabled
- **AND** UI SHALL provide a readable disabled reason

### Requirement: Create PR Dialog with Compare Bar

The panel SHALL provide a dedicated Create PR dialog with compare-style repository/branch parameter controls.

#### Scenario: Open dialog with prefilled defaults

- **WHEN** user clicks `PR`
- **THEN** dialog SHALL request workflow defaults and prefill upstream/base/head/title/body/comment fields
- **AND** user SHALL be able to edit title/body/comment before execution

#### Scenario: Compare controls are searchable selectors

- **WHEN** dialog is open
- **THEN** `base repository / base / head repository / compare` fields SHALL support searchable dropdown selection
- **AND** selected values SHALL be clearly visible with overflow-safe presentation

### Requirement: Staged Progress and Result Actions

The dialog SHALL show workflow progress by stages and expose actionable result operations.

#### Scenario: Stage progress mapping

- **WHEN** workflow starts
- **THEN** UI SHALL render stages `precheck/push/create/comment`
- **AND** each stage SHALL reflect backend status (`pending/running/success/failed/skipped`)

#### Scenario: Actionable result state

- **WHEN** workflow completes
- **THEN** success or existing PR state SHALL offer `open/copy PR link`
- **AND** failure state SHALL expose next-action hint and retry command copy when available

### Requirement: Git History Panel Modularization Parity
The system SHALL preserve existing Git History panel behavior while internal modules are extracted from oversized files.

#### Scenario: Core interaction parity after module split
- **WHEN** `GitHistoryPanel` internal logic is split into submodules
- **THEN** panel open/close, branch selection, commit selection, and commit detail rendering MUST remain behavior-equivalent
- **AND** no user workflow change SHALL be required

### Requirement: Git History Action and Context Menu Parity
The system SHALL preserve branch/commit context actions during and after modularization.

#### Scenario: Context actions remain reachable
- **WHEN** user opens branch or commit context menus after refactor
- **THEN** action entries and execution semantics MUST match pre-refactor behavior
- **AND** disabled/loading/error states MUST remain consistent with current expectations

### Requirement: Git History Style Modularization Safety
The system SHALL preserve visual semantics when large panel styles are split into feature-scoped style modules.

#### Scenario: Visual consistency after style split
- **WHEN** Git History related styles are modularized
- **THEN** four-region layout structure, split areas, and critical interaction affordances MUST remain visually consistent
- **AND** no clipping or overlap regressions SHALL be introduced in standard viewport sizes
