## ADDED Requirements

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

### Requirement: Projection Summary MUST Expose Filtered Totals And Degraded State

共享 session projection summary MUST 区分 filtered total 与 surface 当前可见窗口，并暴露 partial/degraded source，避免 UI 把不完整结果误渲染成完整项目事实。

#### Scenario: filtered total is distinct from visible window

- **WHEN** 某个 surface 只展示 active projection 的窗口子集
- **THEN** 系统 MUST 能同时提供 filtered total 与当前 visible window 信息
- **AND** UI MUST NOT 将当前窗口条目数误标为完整项目会话总量

#### Scenario: degraded source remains explainable

- **GIVEN** 某个 engine/source 的历史读取失败或不可用
- **WHEN** 系统返回 projection summary
- **THEN** summary MUST 暴露 partial/degraded marker
- **AND** 依赖该 summary 的 surface MUST 能说明当前结果是不完整投影
