## ADDED Requirements

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
