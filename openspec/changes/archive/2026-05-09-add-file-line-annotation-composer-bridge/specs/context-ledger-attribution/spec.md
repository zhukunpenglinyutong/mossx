## MODIFIED Requirements

### Requirement: Explicit User-Selected Sources SHALL Produce Deterministic Phase 1 Estimates

Phase 1 MUST 为前端可直接观测到的显式来源生成稳定、可重复的大小估计与去重结果，包括用户在文件或 diff 中显式确认的 line annotation。

#### Scenario: manual memory selection yields deterministic blocks

- **WHEN** 用户为当前发送手动选择相同的一组记忆
- **THEN** ledger SHALL 生成稳定数量、稳定顺序的 `manual_memory` blocks
- **AND** 每个 block 的 estimate SHALL 基于同一份可注入文本来源计算

#### Scenario: repeated file references are deduplicated

- **WHEN** 当前发送同时包含 active file reference 与重复的 inline file reference
- **THEN** ledger SHALL 对重复引用执行稳定去重
- **AND** 重复引用 SHALL NOT 生成多条等价 block

#### Scenario: file line annotation remains attributable

- **WHEN** 当前发送包含用户确认的 file line annotation
- **THEN** ledger SHALL 将该 annotation 投影为 file-related context block
- **AND** block MUST 展示 path、line range 与 annotation body 摘要
- **AND** 它 MUST 与普通 active file reference 保持可区分
- **AND** block inspection content MUST preserve full path、line range and annotation body for audit

#### Scenario: repeated annotation selections remain deterministic

- **WHEN** 当前发送包含多条 file line annotation
- **THEN** ledger SHALL generate deterministic file-related blocks in selection order
- **AND** each block estimate SHALL be based on annotation body length
- **AND** two annotations on the same file but with different line range or body MUST remain distinguishable

#### Scenario: deleted or sent annotation does not leave stale attribution

- **WHEN** 用户删除 annotation chip/card 或发送后 annotation context 被清空
- **THEN** ledger SHALL NOT 继续展示该 annotation 的 attribution block
- **AND** ledger SHALL NOT 将旧 annotation 合并进普通 active file reference block

#### Scenario: backend-managed helper sources remain attributable

- **WHEN** 当前发送包含来自 backend-discovered skill / command source 的 helper selection
- **THEN** ledger SHALL 保留该 helper block 的 backend provenance
- **AND** workspace-managed helper SHALL 与 engine-managed / system-managed helper 保持可区分
- **AND** 当 backend provenance 缺失时，ledger SHALL 以 degraded attribution 明示，而不是伪装成已精确归因
