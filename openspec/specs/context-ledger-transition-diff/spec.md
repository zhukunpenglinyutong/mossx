# context-ledger-transition-diff Specification

## Purpose
TBD - created by archiving change advance-context-ledger-transition-visibility. Update Purpose after archive.
## Requirements
### Requirement: Context Ledger SHALL Explain Transition Diffs Relative To The Last Send Baseline

系统 MUST 能把当前账本与最近一次发送前的账本快照进行对比，而不是只展示静态当前态。

#### Scenario: send completion keeps a recent diff summary visible

- **WHEN** 用户完成一次发送
- **AND** 发送前账本与发送后当前账本存在来源级变化
- **THEN** ledger SHALL 展示基于 `last send baseline` 的变化摘要
- **AND** 摘要 SHALL 至少表达 added / removed / retained / changed 中的必要变化类型

#### Scenario: usage-only current state may still show comparison summary

- **WHEN** 当前发送收敛后已无显式 memory / file / helper block
- **AND** 最近一次 send comparison summary 仍存在
- **THEN** 系统 MAY 继续显示 ledger comparison summary
- **AND** SHALL NOT 因当前只剩 usage snapshot 而把最近变化完全隐藏

#### Scenario: comparison does not rewrite current block truth

- **WHEN** 某个 block 已在当前准备态中移除
- **THEN** 当前 groups SHALL NOT 把该 block 伪装成仍然存在
- **AND** 该 block 的变化 SHALL 通过 comparison summary 或等价 diff surface 表达

### Requirement: Context Ledger Transition Diff SHALL Preserve Carry-Over Lifecycle Explainability

系统 MUST 让跨轮 retained block 在 diff 之外仍保持可解释生命周期，而不是在当前态中退化成“只剩状态名”。

#### Scenario: retained block stays explainable after a successful send

- **WHEN** 某个显式 block 因上一轮 keep 语义进入当前准备态
- **THEN** 当前 ledger SHALL 保留该 block 的 inherited carry-over explanation
- **AND** 用户 SHALL 能区分这是上一轮带入，而不是本轮新选择

#### Scenario: clearing an inherited block updates both current state and diff basis result

- **WHEN** 用户在当前准备态中清理某个 `carried_over` block
- **THEN** 当前 projection SHALL 立即移除该 block
- **AND** 后续 diff 结果 SHALL 反映该 block 已不再参与当前准备态

### Requirement: Context Ledger Transition Diff SHALL Remain Session-Scoped

系统 MUST 把 `last send` 与 `pre-compaction` comparison 限定在当前 thread/session boundary 内，而不是跨会话复用最近一次基线。

#### Scenario: switching to a new thread clears the previous send comparison

- **WHEN** 用户切换到新的 thread/session
- **THEN** 系统 SHALL 清空旧 thread 的 `last send baseline`
- **AND** 新 thread SHALL NOT 继续显示旧 thread 的 `相比最近一次发送` comparison

#### Scenario: switching workspace context clears pre-compaction baseline

- **WHEN** composer 关联的 workspace context 发生切换
- **THEN** 系统 SHALL 清空旧上下文的 `pre-compaction baseline`
- **AND** SHALL NOT 把旧 workspace 的 compaction comparison 带入当前 surface

