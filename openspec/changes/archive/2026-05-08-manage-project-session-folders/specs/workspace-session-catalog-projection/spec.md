## ADDED Requirements

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
