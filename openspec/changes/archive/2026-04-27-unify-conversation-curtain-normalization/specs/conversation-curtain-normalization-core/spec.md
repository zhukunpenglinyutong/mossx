## ADDED Requirements

### Requirement: Realtime And History Hydrate SHALL Share One Normalization Contract

conversation curtain 在消费 realtime observations 与 history hydrate snapshots 时 MUST 使用同一套 normalization / merge contract，避免相同语义内容在两条路径上被不同规则处理。

#### Scenario: equivalent user observation converges across realtime and history

- **WHEN** 同一条 user message 先以 optimistic 或 queued handoff 形式出现在幕布中
- **AND** 稍后 authoritative history 或 canonical payload 以等价语义到达
- **THEN** 系统 MUST 将二者收敛为单条 user bubble
- **AND** 用户可见 row 数量 MUST 保持稳定

#### Scenario: equivalent assistant observation converges across completed and history hydrate

- **WHEN** 同一条 assistant reply 已在 realtime completed settlement 中形成可见正文
- **AND** 稍后 history hydrate 以等价语义再次提供该 reply
- **THEN** 系统 MUST 复用同一 normalization 规则判断二者等价
- **AND** 系统 MUST NOT 再新增一条主体重复的 assistant bubble

### Requirement: User Bubble Equivalence MUST Canonicalize Source-Specific Wrappers

conversation curtain 对 user bubble 的等价判断 MUST 去除 source-specific wrapper 差异，例如 injected context、selected-agent prompt block、shared-session sync wrapper 或等价 display-only 包装。

#### Scenario: authoritative user message replaces optimistic bubble despite wrapper drift

- **WHEN** 本地 optimistic user bubble 与 authoritative user payload 的原始文本形态不完全一致
- **AND** 差异仅来自 injected wrapper、selected-agent block 或等价 source-specific 包装
- **THEN** 系统 MUST 将 authoritative user payload 视为该 optimistic bubble 的 canonical replacement
- **AND** 系统 MUST NOT 保留两条并列 user bubble

#### Scenario: unmatched real user message does not collapse unrelated optimistic bubble

- **WHEN** incoming real user message 与现有 optimistic user bubble 在 normalization 后仍不等价
- **THEN** 系统 MUST 保留两条独立 user message
- **AND** MUST NOT 因过宽判定误删除另一条真实用户输入

### Requirement: Assistant Settlement Canonicalization MUST Collapse Equivalent Replay

conversation curtain 对 assistant reply 的 completed settlement MUST 能收敛 `stream delta`、`completed replay`、`history hydrate` 等多来源中的等价正文，避免主体文本重复拼接。

#### Scenario: completed replay with streamed prefix converges before history refresh

- **WHEN** assistant 已通过 realtime delta 显示了可读正文前缀
- **AND** terminal completed payload 又以 `prefix + full final snapshot` 或等价 replay 形式到达
- **THEN** 系统 MUST 在本地 settlement 阶段将该 replay 收敛为单条 assistant message
- **AND** MUST NOT 依赖后续 history refresh 才去掉重复正文

#### Scenario: short duplicate reply renders once

- **WHEN** `Codex` 对简短输入返回短句型回复
- **AND** stream / completed / history 三种来源中存在等价重复
- **THEN** 最终幕布 MUST 只显示一条 assistant reply
- **AND** MUST NOT 出现整句重复拼接

### Requirement: Reasoning Snapshot Equivalence MUST Use Shared Rules

reasoning snapshot 在 realtime append 与 history hydrate 中 MUST 使用同一套等价规则，避免两条链路对相同 reasoning 正文得出不同 duplicate 结论。

#### Scenario: repeated reasoning snapshot collapses to one row

- **WHEN** 同一 reasoning 内容先后以多个 snapshot 或 hydrate 形式到达
- **THEN** 系统 MUST 将其收敛为单条 reasoning row
- **AND** 后到 observation 只可更新 canonical text / metadata，不得新增重复 row

#### Scenario: non-equivalent reasoning remains distinct

- **WHEN** 两条 reasoning observation 在共享 normalization 规则下不等价
- **THEN** 系统 MUST 将其保留为不同 reasoning step
- **AND** MUST NOT 因共享前缀或局部相似而误合并不同 reasoning 内容
