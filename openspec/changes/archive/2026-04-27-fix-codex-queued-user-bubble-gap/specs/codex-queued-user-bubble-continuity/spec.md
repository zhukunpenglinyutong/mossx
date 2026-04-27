## ADDED Requirements

### Requirement: Codex Queued Follow-up Handoff SHALL Preserve A Visible Latest User Bubble

系统 MUST 在 `Codex` 实时 turn 结束并自动进入 queued follow-up 时，持续提供一条可见的 latest user bubble，而不能出现“queue 已移除、幕布却没有该消息”的空窗。

#### Scenario: queue auto-drain creates an immediate visible handoff bubble
- **GIVEN** 当前线程是 `Codex` 实时会话
- **AND** 当前线程存在待自动发送的 queued follow-up
- **WHEN** 当前 turn 结束并触发 queue auto-drain
- **THEN** 系统 MUST 在 queue item 脱离排队区的同一 handoff 窗口内让最新用户消息在幕布中可见
- **AND** 系统 MUST NOT 等到 history refresh 完成后才第一次显示这条消息

#### Scenario: handoff visibility survives until a real user message item arrives
- **GIVEN** 当前线程已经进入 queued follow-up handoff
- **WHEN** optimistic user item 尚未插入且 authoritative history user item 也尚未返回
- **THEN** 系统 MUST 保持 latest user bubble 可见
- **AND** 该可见状态 MUST 不依赖 queue 区域是否仍保留该条消息

### Requirement: Previous-Turn Reconcile SHALL Not Hide Next-Turn Queued User Visibility

系统 MUST 确保上一轮 `Codex` turn completion 触发的 history reconcile 不会在下一轮 queued follow-up handoff 期间把最新用户消息从幕布中吃掉。

#### Scenario: old-turn reconcile does not remove the visible queued follow-up bubble
- **GIVEN** 当前线程的上一轮 `Codex` turn 已完成并触发 history reconcile
- **AND** 下一轮 queued follow-up 已开始 handoff 但真实 user item 仍未稳定落地
- **WHEN** reconcile 在该窗口内执行
- **THEN** 系统 MUST NOT 让 latest user bubble 从幕布中短暂消失
- **AND** 系统 MUST 保持 handoff bubble 或等价的可见 user item 直到真实消息可接管

### Requirement: Handoff Bubble SHALL Deduplicate Cleanly With Optimistic Or Authoritative User Items

系统 MUST 在 handoff bubble 只承担过渡可见性的前提下，与后续真实 user item 平滑去重，避免重复气泡。

#### Scenario: optimistic user item replaces handoff bubble without duplication
- **GIVEN** 当前线程存在 handoff bubble
- **WHEN** 对应的 optimistic user item 已经插入消息时间线
- **THEN** 系统 MUST 清理或替换 handoff bubble
- **AND** 幕布 MUST 只保留一份最新用户消息

#### Scenario: authoritative history user item replaces handoff bubble without duplication
- **GIVEN** 当前线程存在 handoff bubble
- **WHEN** 对应的 authoritative history user item 在后续 refresh 中到达
- **THEN** 系统 MUST 清理或替换 handoff bubble
- **AND** 系统 MUST NOT 渲染两份内容等价的 latest user bubble

### Requirement: Continuity Handling SHALL Remain Frontend-Scoped And Codex-Scoped

系统 MUST 将该修复限制在前端 handoff 编排层和 `Codex` 路径，不通过新增 runtime contract 来解决。

#### Scenario: continuity fix does not require new backend contracts
- **WHEN** 系统实现 `Codex` queued user bubble continuity
- **THEN** 系统 MUST NOT 新增 Tauri command、Rust payload 字段或持久化 schema
- **AND** 现有 history loading contract MUST 保持不变

#### Scenario: non-Codex providers do not regress because of Codex continuity handling
- **WHEN** 当前线程不是 `Codex` 实时会话
- **THEN** 系统 MUST NOT 因该修复误引入 provider 范围外的 handoff bubble 行为
- **AND** 现有非 `Codex` provider 的消息时间线语义 MUST 保持不变
