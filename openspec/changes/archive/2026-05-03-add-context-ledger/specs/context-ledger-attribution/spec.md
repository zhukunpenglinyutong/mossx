## ADDED Requirements

### Requirement: Effective Context Projection SHALL Use One Normalized Block Model For Phase 1 Observable Sources

系统 MUST 为 `Codex`、`Claude Code` 与 `Gemini` 的 Phase 1 可观测 ledger projection 使用同一套 normalized block model。

#### Scenario: source semantics stay stable across supported engines

- **WHEN** `Codex`、`Claude Code` 与 `Gemini` 分别投影当前线程可观测上下文
- **THEN** 相同用户可感知来源 SHALL 保持相同 `sourceKind`
- **AND** 引擎差异 MAY 影响 token 精度
- **AND** 引擎差异 SHALL NOT 改变来源分类与参与状态语义

#### Scenario: unsupported engine does not masquerade as supported attribution

- **WHEN** 当前线程引擎不属于 Phase 1 优先适配范围
- **THEN** 系统 MAY 回退到 shared projection 语义
- **AND** SHALL NOT 伪装成已有精确 attribution 的主引擎

#### Scenario: provider-only gaps stay explicitly degraded

- **WHEN** 当前线程存在 provider-only context segment
- **AND** 当前 frontend / runtime signal 不足以稳定拆分其精确来源
- **THEN** 系统 SHALL 以 shared / degraded summary block 或等价 marker 表达该 segment
- **AND** SHALL NOT 把该 segment 伪装成精确的 `manual_memory`、`attached_resource` 或其他更具体 block

### Requirement: Ledger Attribution SHALL Share The Same Usage And Compaction Snapshot As Composer

ledger attribution MUST 与 Composer dual-view / tooltip 使用同一份 usage 与 compaction state source。

#### Scenario: ledger total matches dual-view snapshot

- **WHEN** Codex dual-view 展示当前 used/context-window/percent
- **THEN** ledger 的 `recent_turns` 摘要 SHALL 使用同一份 snapshot
- **AND** ledger 与 dual-view SHALL NOT 出现相互矛盾的总量口径

#### Scenario: pending-refresh compaction freshness stays aligned

- **WHEN** dual-view 处于 `usageSyncPendingAfterCompaction=true`
- **THEN** ledger attribution SHALL 同步呈现 pending-refresh freshness
- **AND** 两个 surface SHALL 在 usage refresh 到达后一起收敛到 fresh 状态

### Requirement: Explicit User-Selected Sources SHALL Produce Deterministic Phase 1 Estimates

Phase 1 MUST 为前端可直接观测到的显式来源生成稳定、可重复的大小估计与去重结果。

#### Scenario: manual memory selection yields deterministic blocks

- **WHEN** 用户为当前发送手动选择相同的一组记忆
- **THEN** ledger SHALL 生成稳定数量、稳定顺序的 `manual_memory` blocks
- **AND** 每个 block 的 estimate SHALL 基于同一份可注入文本来源计算

#### Scenario: repeated file references are deduplicated

- **WHEN** 当前发送同时包含 active file reference 与重复的 inline file reference
- **THEN** ledger SHALL 对重复引用执行稳定去重
- **AND** 重复引用 SHALL NOT 生成多条等价 block

#### Scenario: backend-managed helper sources remain attributable

- **WHEN** 当前发送包含来自 backend-discovered skill / command source 的 helper selection
- **THEN** ledger SHALL 保留该 helper block 的 backend provenance
- **AND** workspace-managed helper SHALL 与 engine-managed / system-managed helper 保持可区分
- **AND** 当 backend provenance 缺失时，ledger SHALL 以 degraded attribution 明示，而不是伪装成已精确归因
