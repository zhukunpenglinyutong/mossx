# codex-session-sidebar-state-parity Specification

## Purpose

TBD - synced from change fix-codex-session-sidebar-state-parity. Update Purpose after archive.
## Requirements
### Requirement: Codex Sidebar Projection MUST Preserve Visible Session Continuity During Partial Refresh

当 `Codex` sidebar / recent conversation surfaces 已经存在最近一次成功可见的 session projection 时，系统 MUST 在 partial refresh、degraded refresh 或 source-subset refresh 下保留该可见 continuity，而不是仅因单次刷新少返回一部分 entries 就将其静默移除。

#### Scenario: partial codex refresh does not remove a previously visible finalized session
- **WHEN** 某条 finalized `Codex` session 已经出现在 sidebar 或 workspace home recent threads 中
- **AND** 后续一次 refresh 仍然返回其它 `Codex` sessions，但遗漏了该 session
- **AND** 本轮 refresh 被判定为 degraded、partial 或 source-subset result
- **THEN** 系统 MUST 保留该 session 的最近一次成功可见 projection
- **AND** 当前 surface MUST 标记为 degraded、partial 或等价 continuity-preserved 状态

#### Scenario: authoritative codex refresh may remove a no-longer-visible session
- **WHEN** 后续 authoritative refresh 明确确认某条 `Codex` session 已不属于当前 workspace 的可见历史范围
- **THEN** 系统 MAY 将该 session 从 sidebar projection 中移除
- **AND** 系统 MUST NOT 无限期保留该 session 作为 ghost entry

### Requirement: Codex Sidebar Title Truth MUST Apply Stable Precedence

`Codex` sidebar / recent conversation surfaces MUST 对标题采用稳定 truth precedence；一旦某条 session 已经获得比 ordinal fallback 更强的标题 truth，后续 refresh MUST NOT 将其回退为 `Agent x` 或新的 ordinal fallback。

#### Scenario: confirmed title is not downgraded to ordinal fallback
- **WHEN** 某条 `Codex` session 已经拥有 persisted custom title、mapped title、catalog title 或其它更强标题 truth
- **AND** 后续 refresh 重新构建该 session summary
- **THEN** 系统 MUST 继续显示当前 strongest confirmed title
- **AND** 系统 MUST NOT 将其回退为 `Agent x`、`Codex Session` 或等价 ordinal fallback

#### Scenario: stronger title source may upgrade weaker title source
- **WHEN** 某条 `Codex` session 当前只有 weaker title source，例如 transient first-user rename 或 ordinal fallback
- **AND** 后续 refresh 提供了更强的 authoritative catalog title 或 persisted mapped title
- **THEN** 系统 MUST 允许该更强 title source 升级当前显示标题
- **AND** 系统 MUST 保持该 upgraded title 在后续 refresh 中稳定可见

### Requirement: Agent-Style Codex Sessions MUST Survive Active-To-Completed Visibility Cutover

对于 `spawn_agent` 或等价 agent-style 派生的 `Codex` 子会话，系统 MUST 在 active catalog 可见性消失、而 local scan / live list 尚未完全收敛的切换窗口中保持连续可见，不得让该会话在 active-to-completed cutover 中闪烁消失。

#### Scenario: codex agent session remains visible while active catalog drops it
- **WHEN** 某条 agent-style `Codex` 子会话刚刚结束 active 状态
- **AND** active session catalog 已不再返回该 session
- **AND** 同一轮 refresh 尚未从其它 source 恢复该 session 的 finalized visibility
- **THEN** sidebar projection MUST 保留该 session 的最近一次成功可见状态
- **AND** 用户 MUST NOT 观察到该 session 在 active-to-completed 窗口中短暂消失

#### Scenario: cutover ambiguity becomes degraded continuity instead of disappearance
- **WHEN** agent-style `Codex` session 的可见性来源在 cutover 窗口中存在歧义
- **THEN** 系统 MUST 将该状态表达为 degraded continuity、partial continuity 或等价诊断状态
- **AND** 系统 MUST NOT 直接把该 session 从用户可见 sidebar surfaces 中移除

### Requirement: Codex New Conversation Start MUST Be Idempotent While In Flight

When the frontend starts a new Codex conversation for the same workspace and folder, concurrent callers MUST reuse the same in-flight backend start instead of creating multiple backend sessions.

#### Scenario: concurrent codex starts reuse one backend session
- **WHEN** two or more callers invoke new Codex conversation creation for the same workspace before the first backend start resolves
- **THEN** the system MUST call the backend start command only once
- **AND** all callers MUST receive the same created thread id
- **AND** the sidebar MUST materialize only one new Codex conversation

#### Scenario: in-flight reuse preserves activation request
- **WHEN** a caller reuses an in-flight Codex start and requests activation
- **THEN** the resolved shared thread MUST become active for that workspace
- **AND** the system MUST NOT dispatch a second create/materialize side effect for that same thread

#### Scenario: failed in-flight start can be retried
- **WHEN** an in-flight Codex start fails
- **THEN** the in-flight guard MUST be released
- **AND** a later user action MAY attempt a new backend start
