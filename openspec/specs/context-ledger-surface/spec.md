# context-ledger-surface Specification

## Purpose

Defines the context-ledger-surface behavior contract, covering Context Ledger SHALL Expose A Dedicated Effective Context Surface.

## Requirements
### Requirement: Context Ledger SHALL Expose A Dedicated Effective Context Surface

系统 MUST 在 Composer 中提供独立的 `Context Ledger` surface，用于解释当前线程的 effective context，而不改变现有发送协议。

#### Scenario: ledger entrypoint renders when source-level context exists beyond a bare usage meter

- **WHEN** 当前线程存在手动记忆选择、文件/便签引用、helper selection，或 compaction lifecycle
- **THEN** 系统 SHALL 渲染 `Context Ledger` 入口
- **AND** 入口 SHALL 显示当前 snapshot 的总量摘要与可见 block 数量或等效摘要

#### Scenario: usage-only snapshot does not duplicate the codex background window

- **WHEN** 当前仅存在 recent-turn usage snapshot
- **AND** 不存在手动记忆、资源引用、helper selection 或 compaction summary
- **THEN** 系统 SHALL NOT 额外渲染独立的 `Context Ledger` surface
- **AND** usage meter / dual-view SHALL 继续作为该场景的唯一上下文总量反馈

#### Scenario: unopened ledger does not change send behavior

- **WHEN** 用户未展开或未查看 `Context Ledger`
- **THEN** 现有 Composer 发送路径 SHALL 保持不变
- **AND** 系统 SHALL NOT 因 ledger 存在而改写 prompt assembly 或 memory injection 语义

### Requirement: Context Ledger SHALL Group Observable Blocks By User-Meaningful Source

系统 MUST 以用户可理解的来源分组展示 Phase 1 可观测上下文块，而不是把所有来源压平成单一列表。

#### Scenario: explicit memory and resource references stay in separate groups

- **WHEN** 当前发送准备态同时包含手动记忆与文件/便签引用
- **THEN** ledger SHALL 分别在 `manual_memory` 与 `attached_resource` 组中展示这些 block
- **AND** 每个 block SHALL 至少显示标签、参与状态与大小估计，若暂无法估算则显示 explicit unknown marker

#### Scenario: usage snapshot remains visible as recent-turn summary

- **WHEN** 当前线程存在最近一次 context usage snapshot
- **AND** ledger 由于其他来源或 compaction state 已经可见
- **THEN** ledger SHALL 展示 `recent_turns` 摘要 block 或等价 summary row
- **AND** 该摘要的总量口径 SHALL 与当前 usage snapshot 一致

### Requirement: Context Ledger SHALL Support Minimal Governance For Explicit User-Selected Blocks

系统 MUST 为前端显式可见、可治理的上下文块提供最小操作能力，而不是停留在只读列表。

#### Scenario: pin for next send keeps a selected block for one additional turn

- **WHEN** 用户对已选中的 `manual_memory`、`note_card` 或 helper block 执行 `pin for next send`
- **THEN** 当前发送收敛后该 block SHALL 保留到下一轮发送准备态
- **AND** 该保留语义 SHALL 在下一轮发送后自动消耗，而不是永久粘住

#### Scenario: exclude from next send removes an explicit selected block immediately

- **WHEN** 用户对当前已选中的显式 block 执行 `exclude from next send`
- **THEN** 对应 block SHALL 立即从当前发送准备态移除
- **AND** 当前 ledger surface SHALL 同步更新，而不等待发送后收敛

#### Scenario: source detail can be inspected without changing send protocol

- **WHEN** block 当前存在来源说明、摘要文本、路径或等价 inspection content
- **THEN** 用户 SHALL 能打开该 block 的来源详情
- **AND** 该操作 SHALL NOT 改写现有发送协议或 prompt assembly 路径

### Requirement: Context Ledger SHALL Keep Compaction State Truthful

系统 MUST 在 ledger 中保持 compaction 生命周期的当前态 truthfulness，避免把历史文案误当成当前事实。

#### Scenario: compaction pending-refresh stays explicit

- **WHEN** Codex compaction 已完成但最新 usage snapshot 尚未刷新
- **THEN** ledger SHALL 显示 `compaction_summary` 的 pending-refresh 状态
- **AND** ledger SHALL NOT 提前宣称背景信息总量已同步完成

#### Scenario: historical messages do not override current ledger state

- **WHEN** 会话历史中保留旧的 compaction message
- **THEN** ledger 当前态 SHALL 继续以 thread lifecycle 与最新 usage snapshot 为准
- **AND** 历史 message SHALL NOT 单独钉死 ledger 的当前状态

### Requirement: Context Ledger Surface SHALL Present Recent Transition Summaries Without Polluting Current Groups

系统 MUST 在 surface 层把“当前态账本”和“最近变化摘要”区分开来，而不是混成一组 block。

#### Scenario: comparison summary renders above current groups

- **WHEN** 当前 ledger 存在 recent transition summary
- **THEN** 系统 SHALL 在当前 groups 之外渲染 comparison summary 区
- **AND** 当前 groups SHALL 继续只表达当前态 block

#### Scenario: recent transition summary may outlive current explicit blocks

- **WHEN** 当前 groups 中已经没有显式 memory / file / helper block
- **AND** comparison summary 仍然存在
- **THEN** ledger surface MAY 继续显示 comparison summary
- **AND** 用户 SHALL 仍能看到最近一次 send / compaction 的结果解释

#### Scenario: retained blocks remain distinguishable after one-turn carry over

- **WHEN** 用户在上一轮对显式 block 执行 `keep for next send`
- **AND** 该 block 被带入当前发送准备态
- **THEN** ledger surface SHALL 把该 block 表达为“由上一轮保留带入”或等价语义
- **AND** SHALL NOT 在当前准备态中把该 block 伪装成普通 selected

### Requirement: Context Ledger Surface SHALL Explain Carry-Over Lifecycle For Retained Blocks

系统 MUST 在 `pinned_next_send` 与 `carried_over` block 上提供显式生命周期说明，而不是只暴露参与状态枚举。

#### Scenario: pinned block explains that it will survive exactly one more send

- **WHEN** 用户对显式 block 执行 `keep for next send`
- **THEN** ledger SHALL 显示该 block 会在下一轮继续保留一次的解释
- **AND** 系统 SHALL NOT 把该语义退化成无解释的普通 selected 状态

#### Scenario: inherited block explains why it is still present

- **WHEN** 某个 block 因上一轮 keep 语义被带入当前准备态
- **THEN** ledger SHALL 显示该 block 是由上一轮保留带入
- **AND** ledger SHALL 说明该 block 若不再次 keep，将在本轮发送后自动消耗

### Requirement: Context Ledger Surface SHALL Offer A Dedicated Clear Action For Inherited Blocks

系统 MUST 为 `carried_over` block 提供语义准确的清理动作，而不是继续只暴露模糊的 `exclude next send`。

#### Scenario: user clears an inherited block before the next send

- **WHEN** 当前 block 处于 `carried_over` 状态
- **AND** 用户触发 `clear carried-over`
- **THEN** 系统 SHALL 立即把该 block 从当前准备态移除
- **AND** 相关 retained state SHALL 同步清理

#### Scenario: inherited clear does not mutate unrelated selections

- **WHEN** 用户清理某个 `carried_over` block
- **THEN** 系统 SHALL NOT 移除其他未被选中的 retained block
- **AND** 当前未关联的 selected / pinned block SHALL 保持不变

### Requirement: Context Ledger Surface SHALL Offer A Compact One-Line Header

系统 MUST 让 collapsed ledger header 以单行 compact summary 呈现，降低 composer 上方的垂直占用。

#### Scenario: collapsed header keeps title, summary, and controls on one row

- **WHEN** `Context Ledger` surface 可见但处于 collapsed header 态
- **THEN** 标题、摘要和主要操作 SHALL 在单行内呈现
- **AND** 系统 SHALL NOT 再把摘要拆成第二行默认占位

### Requirement: Context Ledger Surface SHALL Support A Recoverable Hidden Drawer

系统 MUST 允许用户临时把 ledger surface 藏到 composer 后方，同时保留再次拉出的入口。

#### Scenario: user hides the ledger drawer without losing state

- **WHEN** 用户触发 `hide drawer` action
- **THEN** 系统 SHALL 把 ledger surface 切换到 hidden drawer 状态
- **AND** 当前 projection / comparison / selection state SHALL 保持不变

#### Scenario: hidden drawer still exposes a reopen affordance

- **WHEN** ledger 处于 hidden drawer 状态
- **THEN** 用户 SHALL 仍能看到一个最小可操作入口
- **AND** 用户激活该入口后 SHALL 恢复 ledger surface

