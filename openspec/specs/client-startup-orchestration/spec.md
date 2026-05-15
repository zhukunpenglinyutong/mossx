# client-startup-orchestration Specification

## Purpose

Defines the client-startup-orchestration behavior contract, covering Client startup SHALL use phase-based orchestration.
## Requirements
### Requirement: Client startup SHALL use phase-based orchestration
The client SHALL route startup-time loading through a frontend Startup Orchestrator that assigns each task to exactly one startup phase: `critical`, `first-paint`, `active-workspace`, `idle-prewarm`, or `on-demand`.

#### Scenario: first paint is not blocked by heavy hydration
- **WHEN** the application opens the main client window
- **THEN** `critical` and `first-paint` tasks SHALL be the only phases allowed to block initial shell rendering
- **AND** thread/session full hydration, complete file tree loading, git diff preload, catalog prewarm, and dictation model status SHALL NOT block the initial shell render

#### Scenario: task declares orchestration metadata
- **WHEN** a startup-time load is registered with the Startup Orchestrator
- **THEN** the task SHALL declare `id`, `phase`, `priority`, `dedupeKey`, `concurrencyKey`, `timeoutMs`, `workspaceScope`, `cancelPolicy`, `traceLabel`, and fallback behavior
- **AND** the orchestrator SHALL reject or flag startup tasks that lack required metadata

#### Scenario: startup phases preserve active workspace priority
- **WHEN** the app has an active workspace during startup
- **THEN** active workspace minimal hydration SHALL run before idle prewarm for non-active workspaces
- **AND** non-active workspace scans SHALL wait for an idle slot or explicit user interaction

### Requirement: Startup orchestration SHALL separate critical loading from opportunistic prewarm
The client SHALL keep the critical startup path limited to data needed to render and operate the initial shell, while opportunistic preloads SHALL run only after first paint, during idle time, or after explicit user demand.

#### Scenario: critical path contains only shell prerequisites
- **WHEN** startup begins
- **THEN** the critical path SHALL include client store preload, app settings, workspace list, shell render readiness, and active workspace minimal state only
- **AND** heavy workspace scans SHALL be excluded from that path

#### Scenario: active workspace hydration is bounded
- **WHEN** the active workspace is hydrated after first paint
- **THEN** the client SHALL load only bounded first-page thread/session data, one git status snapshot, and minimal engine/model selection data required for the current workspace
- **AND** full history scans or complete catalog merges SHALL be deferred

#### Scenario: idle prewarm stays interruptible
- **WHEN** idle prewarm is running and the user switches active workspace or starts a foreground action
- **THEN** interruptible idle tasks SHALL yield, cancel, or downgrade according to their `cancelPolicy`
- **AND** foreground active workspace work SHALL receive priority

### Requirement: Startup tasks SHALL be deduplicated, cancellable, and timeout bounded
The Startup Orchestrator SHALL coalesce duplicate startup work, enforce task timeouts, and prevent stale workspace hydration from competing with current foreground work.

#### Scenario: duplicate task joins in-flight work
- **WHEN** multiple hooks, route transitions, or focus events request the same startup task with the same `dedupeKey`
- **THEN** the orchestrator SHALL run one in-flight task or share its result
- **AND** it SHALL NOT issue parallel equivalent IPC calls for the same workspace and task identity

#### Scenario: stale workspace hydration is cancelled
- **WHEN** a workspace-scoped hydration task is running for a workspace that is no longer active
- **AND** the task is marked cancellable
- **THEN** the orchestrator SHALL cancel or downgrade that task before scheduling new active workspace foreground hydration

#### Scenario: slow task settles through fallback
- **WHEN** a startup task exceeds its `timeoutMs`
- **THEN** the orchestrator SHALL record a timeout event and apply the task's fallback behavior
- **AND** the AppShell SHALL remain usable instead of waiting indefinitely

### Requirement: Startup orchestration SHALL enforce startup budgets and concurrency caps
The Startup Orchestrator SHALL enforce startup budgets for milestones, idle execution, phases, workspace scopes, and heavy command classes so orchestration does not concentrate startup I/O into a new bottleneck.

#### Scenario: startup milestones are recorded
- **WHEN** the application starts through the orchestrated path
- **THEN** startup trace SHALL record `shell-ready`, `input-ready`, and `active-workspace-ready` milestones
- **AND** each milestone SHALL be attributable to the tasks that completed, degraded, or timed out before it

#### Scenario: phase concurrency is capped
- **WHEN** multiple startup tasks are ready in the same phase
- **THEN** the orchestrator SHALL respect the configured phase concurrency cap
- **AND** excess tasks SHALL remain queued instead of starting unbounded parallel work

#### Scenario: heavy command classes are capped
- **WHEN** startup tasks target heavy command classes such as file tree, git diff, thread/session catalog, or engine/model catalog
- **THEN** the orchestrator SHALL enforce `concurrencyKey` limits for those command classes
- **AND** heavy idle prewarm SHALL NOT starve active workspace foreground work

#### Scenario: idle work yields within budget
- **WHEN** idle-prewarm tasks are running
- **THEN** each idle slice SHALL respect the configured wall-time budget
- **AND** remaining idle work SHALL yield to later idle slots when the budget is exhausted

### Requirement: Cancellation semantics SHALL distinguish hard cancellation from stale-result suppression
The Startup Orchestrator SHALL represent cancellation semantics explicitly so tasks that cannot interrupt an underlying Tauri or backend command still prevent stale results from mutating current UI state.

#### Scenario: stale result is ignored after workspace switch
- **WHEN** a workspace-scoped backend command cannot be hard cancelled
- **AND** the active workspace changes before the command settles
- **THEN** the orchestrator SHALL treat the result as stale unless its generation and workspace scope still match the active target
- **AND** stale results SHALL NOT overwrite the current active workspace state

#### Scenario: hard abort is used only when supported
- **WHEN** a task declares hard-abort cancellation
- **THEN** the task implementation SHALL support a real abort mechanism such as AbortSignal or backend cooperative abort
- **AND** tasks without such support SHALL use soft-ignore or yield-only cancellation semantics

#### Scenario: cancellation outcome is traced
- **WHEN** a task is cancelled, yielded, downgraded, or stale-result ignored
- **THEN** startup trace SHALL record the actual cancellation mode
- **AND** diagnostics SHALL NOT report soft-ignore as a successful hard abort

### Requirement: Focus and visibility refresh SHALL be coalesced through startup orchestration
The client SHALL route foreground return, focus, and visibility refresh work through the Startup Orchestrator instead of allowing each hook to independently rescan workspace, thread, git, or file state.

#### Scenario: repeated focus events are coalesced
- **WHEN** the app receives multiple focus or visibility events within the configured cooldown window
- **THEN** refresh work with the same `dedupeKey` SHALL be coalesced
- **AND** only the latest valid refresh intent SHALL be retained

#### Scenario: focus refresh respects active workspace scope
- **WHEN** the app returns to foreground with an active workspace
- **THEN** active workspace refresh tasks SHALL be scheduled before non-active workspace refresh tasks
- **AND** non-active refresh SHALL require idle budget or explicit visibility in the UI

### Requirement: Heavy startup data SHALL be loaded on demand or within idle budget
The client SHALL defer heavy startup data sources unless the relevant UI is visible, the user explicitly requests the data, or idle budget is available, and deferred file tree hydration SHALL remain discoverable through explicit unknown or partial directory state.

#### Scenario: git diffs are not preloaded unconditionally
- **WHEN** the app starts and the Git diff panel is not visible
- **THEN** git diff preload SHALL NOT run in the critical or first-paint phases
- **AND** git diff loading SHALL require panel visibility, explicit user action, or an idle-prewarm budget

#### Scenario: complete file tree is not loaded unconditionally
- **WHEN** a workspace has a large file tree or the file panel is not visible
- **THEN** complete file tree loading SHALL be deferred to on-demand or idle-prewarm work
- **AND** the visible shell MAY use cached, shallow, or skeleton file state while hydration continues
- **AND** any visible directory whose children are not fully known SHALL remain discoverable as unknown or partial rather than being rendered as permanently empty

#### Scenario: visible file tree recovers deferred children on expansion
- **WHEN** the visible file tree contains a directory from cached, shallow, or partial file state
- **AND** the user expands that directory
- **THEN** the client SHALL load direct children on demand within the file tree interaction path
- **AND** the action SHALL NOT require waiting for complete workspace tree hydration

#### Scenario: catalog prewarm runs after shell interactivity
- **WHEN** skills, prompts, commands, collaboration modes, agents, dictation model status, engine model catalog, or non-active session catalogs are loaded opportunistically
- **THEN** those tasks SHALL run after the shell is interactive
- **AND** they SHALL not block active workspace minimal hydration

### Requirement: Startup trace SHALL expose task timing and degradation evidence
The system SHALL expose diagnostic evidence for startup tasks so slow startup can be attributed to specific phases, tasks, workspace scopes, and backend commands.

#### Scenario: task lifecycle is traced
- **WHEN** a startup task is queued, started, completed, failed, timed out, cancelled, or degraded
- **THEN** startup trace SHALL record the task id, phase, trace label, workspace scope, lifecycle state, timestamps, duration, and fallback status

#### Scenario: heavy backend command is attributable
- **WHEN** a startup task invokes a backend command that can perform file, git, engine, model, thread, or session work
- **THEN** trace evidence SHALL retain enough command labeling to attribute the task duration to that backend command class

#### Scenario: diagnostics survive partial startup failure
- **WHEN** one startup task fails or degrades
- **THEN** startup trace SHALL preserve the failure evidence
- **AND** unrelated startup phases SHALL continue when their dependencies are still satisfied

### Requirement: React integration SHALL avoid render amplification
The Startup Orchestrator SHALL expose startup state through stable subscriptions or selectors rather than directly driving broad React component state updates for every task lifecycle event.

#### Scenario: shell subscribes only to shell-level startup state
- **WHEN** startup task trace events are emitted
- **THEN** AppShell SHALL subscribe only to shell milestones and degraded states required for rendering
- **AND** trace-only events SHALL NOT force broad AppShell re-renders

#### Scenario: feature panels subscribe to scoped task status
- **WHEN** a feature panel needs startup or hydration status
- **THEN** the panel SHALL subscribe to task status scoped to that feature or workspace
- **AND** unrelated startup task events SHALL NOT update that panel's React state

### Requirement: Migration SHALL prevent legacy and orchestrated startup double-loading
During migration, each startup-time IPC or heavy data source SHALL have one active owner so legacy hooks and orchestrated tasks do not issue duplicate work for the same startup intent.

#### Scenario: migrated startup command has a single owner
- **WHEN** a startup command is migrated into the Startup Orchestrator
- **THEN** the legacy mount-time hook SHALL stop issuing the same command for the same startup intent
- **AND** tests or trace evidence SHALL show only one owner for that command path

#### Scenario: new startup IPC must register an owner
- **WHEN** new code introduces IPC that can run during startup or foreground return
- **THEN** the code SHALL either register a Startup Orchestrator task descriptor or explicitly document why the call is not startup-time work
- **AND** unowned heavy startup IPC SHALL be treated as a regression

### Requirement: Startup orchestration implementation SHALL remain cross-platform and CI-gate clean
Startup Orchestrator implementation, diagnostics, and tests SHALL remain compatible with Windows, macOS, and Linux and SHALL NOT introduce new warning noise, large-file governance debt, or heavy-test-noise sentry failures.

#### Scenario: implementation remains platform-neutral
- **WHEN** startup orchestration code handles paths, timers, idle scheduling, IPC labels, diagnostics, or test fixtures
- **THEN** it SHALL avoid assumptions that only hold on one operating system
- **AND** behavior SHALL remain valid on Windows, macOS, and Linux CI runners

#### Scenario: tests avoid platform-specific instability
- **WHEN** orchestrator tests assert scheduling, timeout, cancellation, trace, or diagnostics behavior
- **THEN** they SHALL use deterministic time and platform-neutral path/log expectations
- **AND** they SHALL NOT depend on filesystem case sensitivity, path separators, default shell behavior, locale, timezone, or wall-clock timing jitter

#### Scenario: large file governance remains clean
- **WHEN** the change adds trace fixtures, diagnostics samples, generated outputs, or tests
- **THEN** the implementation SHALL continue to pass `node --test scripts/check-large-files.test.mjs`
- **AND** it SHALL continue to pass `npm run check:large-files:near-threshold` and `npm run check:large-files:gate`

#### Scenario: heavy test noise remains clean
- **WHEN** the change adds startup trace, scheduler tests, diagnostics logs, or backend command instrumentation
- **THEN** the implementation SHALL continue to pass `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- **AND** it SHALL continue to pass `npm run check:heavy-test-noise`

#### Scenario: no new warning noise is introduced
- **WHEN** frontend, backend, or test validation runs for startup orchestration changes
- **THEN** the change SHALL NOT introduce new TypeScript, ESLint, Vitest, Node test, Rust compiler, or Rust test warnings
- **AND** if existing baseline warnings are present, the implementation SHALL provide evidence that the warning count and categories did not increase

