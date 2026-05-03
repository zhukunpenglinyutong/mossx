## ADDED Requirements

### Requirement: Context Ledger SHALL Mirror Codex Compaction Freshness

系统 MUST 把 Codex compaction lifecycle 的当前 freshness 镜像到 Context Ledger，而不是只在消息面展示文案。

#### Scenario: pending-refresh compaction remains explicit in ledger

- **WHEN** Codex compaction 已完成但 usage snapshot 仍未刷新
- **THEN** ledger SHALL 显示 completed + pending-refresh 状态
- **AND** 用户 SHALL 能区分“已摘要化”与“用量已刷新”这两个阶段

#### Scenario: refreshed snapshot settles ledger state

- **WHEN** compaction 完成后新的 token usage snapshot 到达
- **THEN** ledger SHALL 从 pending-refresh 收敛为 fresh/synced 状态
- **AND** 旧的 pending-refresh 提示 SHALL 不再保留
