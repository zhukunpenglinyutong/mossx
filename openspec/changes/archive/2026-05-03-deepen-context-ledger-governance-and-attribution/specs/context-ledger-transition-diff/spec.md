## ADDED Requirements

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
