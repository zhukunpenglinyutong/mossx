# workspace-session-catalog-projection Specification

## Purpose

Defines the workspace-session-catalog-projection behavior contract, covering Shared Workspace Session Projection MUST Use One Scope Resolver.

## Requirements
### Requirement: Shared Workspace Session Projection MUST Use One Scope Resolver

系统 MUST 为 sidebar、`Workspace Home` 与 `Session Management` 复用同一套 workspace session scope resolver，不得让不同 surface 各自推导 main/worktree 边界。

#### Scenario: main workspace resolves to project scope

- **WHEN** 用户以某个 main workspace 作为当前项目上下文读取默认会话投影
- **THEN** 系统 MUST 将该 scope 解析为 main workspace 与其 child worktrees
- **AND** 该 scope 解析规则 MUST 与 `Session Management` 的 strict project view 一致

#### Scenario: worktree resolves to isolated scope

- **WHEN** 用户以某个 worktree 作为当前项目上下文读取默认会话投影
- **THEN** 系统 MUST 只解析该 worktree 自身 scope
- **AND** MUST NOT 隐式并入 parent main workspace 或 sibling worktrees

### Requirement: Default Main Surfaces MUST Consume Shared Active Projection

sidebar 与 `Workspace Home` 的默认会话集合 MUST 基于共享 catalog 的 `strict + active + unarchived` projection 决定 membership 与 count；运行时线程状态 MAY 叠加其上，但 MUST NOT 单独扩大或收缩该集合。
When the shared active projection is degraded, sidebar surfaces MAY preserve last-good Claude native rows as continuity placeholders until authoritative projection or native truth resolves membership.

#### Scenario: sidebar and home align with session management active strict projection

- **GIVEN** 用户打开某个 workspace，并同时查看 sidebar 或 `Workspace Home`
- **WHEN** 同一 workspace 的 `Session Management` 处于 `strict + active` 默认视图
- **THEN** sidebar / `Workspace Home` 的默认会话集合 MUST 来自同一 active projection
- **AND** count 差异 MUST 只允许来自显式展示窗口差异，而不是 scope 或 archive 口径不同

#### Scenario: runtime overlay does not widen membership

- **GIVEN** 运行时线程缓存中存在尚未完成清理的旧 thread 状态
- **WHEN** 共享 active projection 刷新完成
- **THEN** surface 的默认会话 membership MUST 以共享 projection 为准
- **AND** runtime overlay MUST 只补充 processing、reviewing、selected 等状态

#### Scenario: Claude continuity does not bypass archive filters
- **GIVEN** the sidebar preserves last-good Claude rows during a degraded shared projection
- **WHEN** the current projection or authoritative native source proves a row is archived, hidden, deleted, or out of strict workspace scope
- **THEN** that row MUST be removed or filtered
- **AND** continuity MUST NOT widen membership beyond the active strict unarchived contract

### Requirement: Projection Summary MUST Expose Filtered Totals And Degraded State

共享 session projection summary MUST 区分 filtered total 与 surface 当前可见窗口，并暴露 partial/degraded source，避免 UI 把不完整结果误渲染成完整项目事实。
For Claude native sidebar membership, degraded projection MUST be treated as incomplete evidence rather than authoritative deletion evidence.

#### Scenario: filtered total is distinct from visible window

- **WHEN** 某个 surface 只展示 active projection 的窗口子集
- **THEN** 系统 MUST 能同时提供 filtered total 与当前 visible window 信息
- **AND** UI MUST NOT 将当前窗口条目数误标为完整项目会话总量

#### Scenario: degraded source remains explainable

- **GIVEN** 某个 engine/source 的历史读取失败或不可用
- **WHEN** 系统返回 projection summary
- **THEN** summary MUST 暴露 partial/degraded marker
- **AND** 依赖该 summary 的 surface MUST 能说明当前结果是不完整投影

#### Scenario: degraded projection cannot erase Claude native sidebar truth
- **WHEN** shared workspace session projection is partial, degraded, startup-only, or otherwise unable to prove Claude source completeness
- **AND** the sidebar has last-good Claude native rows for the same workspace
- **THEN** the sidebar MUST NOT clear those rows solely because the projection omitted them
- **AND** the projection MUST expose enough degraded evidence for the sidebar to preserve continuity while still showing the result as incomplete

### Requirement: Workspace Projection SHALL Keep Task-Run Aggregates Separate From Session Membership

系统 MUST 在 workspace 级 surface 中把 task-run 聚合与 session membership 分开表达，避免 run 数量污染 session catalog 口径。

#### Scenario: run aggregates do not change shared session membership

- **WHEN** workspace surface 同时展示会话目录与 task-run 摘要
- **THEN** task-run aggregates SHALL 作为独立 projection 呈现
- **AND** 共享 session membership 规则 SHALL 保持不变

#### Scenario: degraded run source stays explainable

- **WHEN** 某个 engine 的 run history 或 telemetry source 暂不可用
- **THEN** workspace-level task-run aggregate SHALL 暴露 degraded marker
- **AND** UI SHALL 能解释当前 run 结果并非完整全量

### Requirement: Workspace Session Projection SHALL Treat Folder Tree As Organization Only

共享 workspace session projection MUST 将 folder tree 作为 presentation/organization layer，而不是 membership resolver；sidebar、Workspace Home 与 Session Management 的 strict project scope 仍 MUST 由同一 resolver 决定。

#### Scenario: folder tree does not widen project scope
- **WHEN** 某 session 被分配到当前 project 的 folder
- **THEN** 该 session 仍 MUST 满足当前 project projection membership 才能显示在 strict project view
- **AND** folder assignment MUST NOT 让其它 project 的 session 进入当前 project projection

#### Scenario: sidebar count is not inflated by folders
- **WHEN** sidebar 或 Workspace Home 展示 project session count
- **THEN** 系统 MUST 按 shared active projection 计算 session membership
- **AND** MUST NOT 因 folder 数量或 folder nesting 增加 session count

#### Scenario: root and folder views share degradation markers
- **WHEN** 某 engine/source 历史读取失败导致 projection degraded
- **THEN** root view 与 folder view MUST 暴露一致的 degraded marker
- **AND** folder tree MUST NOT 把 partial result 渲染成完整项目事实

### Requirement: Workspace Session Projection SHALL Support Bounded Backend Pagination

Workspace session catalog projection MUST acquire backend data through bounded pages, bounded ordered candidates, or capped scans so a first-page request does not require exhausting all engine history sources.

#### Scenario: first page does not exhaust full large history
- **WHEN** project history contains more sessions than the requested catalog page limit
- **THEN** backend catalog construction SHOULD stop after it has enough ordered candidates or reaches a documented scan cap
- **AND** response MUST preserve a stable next cursor or partial/degraded marker when more data may exist

#### Scenario: engine without native cursor uses capped degradation
- **WHEN** an engine history source cannot provide native cursor/limit semantics
- **THEN** backend MAY use a bounded scan cap for that source
- **AND** MUST expose partial/degraded evidence if the cap prevents proving completeness
- **AND** other engine sources MUST continue returning their available entries

#### Scenario: load older preserves filter and source semantics
- **WHEN** 用户点击 Load older with keyword、engine 或 status filter
- **THEN** next page MUST use the same filter semantics as the first page
- **AND** MUST NOT duplicate entries already returned for the same cursor chain
