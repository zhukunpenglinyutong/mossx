## MODIFIED Requirements

### Requirement: Projection Summary MUST Expose Filtered Totals And Degraded State

共享 session projection summary MUST 区分 filtered total 与 surface 当前可见窗口，并暴露 partial/degraded source，避免 UI 把不完整结果误渲染成完整项目事实。For Claude native sidebar membership, degraded projection MUST be treated as incomplete evidence rather than authoritative deletion evidence.

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

### Requirement: Default Main Surfaces MUST Consume Shared Active Projection

sidebar 与 `Workspace Home` 的默认会话集合 MUST 基于共享 catalog 的 `strict + active + unarchived` projection 决定 membership 与 count；运行时线程状态 MAY 叠加其上，但 MUST NOT 单独扩大或收缩该集合. When the shared active projection is degraded, sidebar surfaces MAY preserve last-good Claude native rows as continuity placeholders until authoritative projection or native truth resolves membership.

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
