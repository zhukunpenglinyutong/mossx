## ADDED Requirements

### Requirement: Context Ledger And Dual View SHALL Read One Shared Snapshot

Context Ledger 与 Codex dual-view MUST 读取同一份 usage / compaction snapshot。

#### Scenario: ledger summary matches codex dual-view totals

- **WHEN** Codex dual-view 正在展示当前 background-info used/context-window/percent
- **THEN** ledger summary SHALL 使用同一份 used/context-window/percent snapshot
- **AND** 两个 surface SHALL NOT 出现互相矛盾的总量信息

#### Scenario: non-codex dual-view boundary remains unchanged

- **WHEN** 当前引擎不是 Codex
- **THEN** 既有 dual-view codex-only visibility boundary SHALL 保持不变
- **AND** ledger 的存在 SHALL NOT 改写 legacy-only usage render path
