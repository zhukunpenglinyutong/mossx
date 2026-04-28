## ADDED Requirements

### Requirement: Unified Codex Sidebar Projection MUST Preserve Deterministic Visible Continuity

当 `Codex` unified history 被用于 sidebar / recent conversation projection 时，系统 MUST 在 live thread list、active session catalog 与 local scan 结果不一致的情况下保持 deterministic visible continuity，而不是让已可见 session 因单次 subset refresh 被静默隐藏。

#### Scenario: active-only catalog does not erase completed codex sidebar history
- **WHEN** unified `Codex` projection 组合了 active session catalog、live thread list 与 local scan 结果
- **AND** active session catalog 只返回活动子集而不包含刚完成的 session
- **AND** 其它 source 在当前 refresh 尚未重新确认该 completed session
- **THEN** unified projection MUST 保留该 session 的最近一次成功可见结果
- **AND** 系统 MUST NOT 将 active-only catalog 结果当作 sidebar 历史的完整 authoritative replacement

#### Scenario: single-source omission does not collapse deterministic ordering
- **WHEN** 同一条 `Codex` session 在某次 refresh 中仅从一部分 source 可见
- **AND** 其它 source 暂时遗漏该 session
- **THEN** unified projection MUST 继续返回该 session 的 single canonical visible entry
- **AND** ordering 与可见 identity MUST 在相同输入下保持可重复、可解释

### Requirement: Unified Codex History MUST Preserve Stable Title Truth Across Source Merge

当 unified `Codex` history 从不同 source 合并同一 logical session 时，系统 MUST 保持 stable title truth，避免较弱 source 或 ordinal fallback 覆盖已确认的标题。

#### Scenario: weaker source title does not replace confirmed sidebar title
- **WHEN** 某条 `Codex` session 已经从 stronger source 获得 confirmed title
- **AND** 另一 source 在后续 refresh 中只提供 weaker title、空标题或 ordinal fallback
- **THEN** unified merge MUST 保留 stronger confirmed title
- **AND** sidebar surfaces MUST NOT 回退为 `Agent x` 或其它 weaker fallback

#### Scenario: stronger source title may upgrade merged canonical entry
- **WHEN** unified merge 当前只拥有 weaker title truth
- **AND** 后续某个 source 提供了更强的 authoritative title
- **THEN** canonical merged entry MUST 升级为该 stronger title
- **AND** 后续 source merge MUST 继续保留该 upgraded title truth
