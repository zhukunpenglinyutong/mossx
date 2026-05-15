## MODIFIED Requirements

### Requirement: Realtime And History Hydrate SHALL Share One Normalization Contract

conversation curtain 在消费 realtime observations 与 history hydrate snapshots 时 MUST 使用同一套 normalization / merge contract，避免相同语义内容在两条路径上被不同规则处理。该 contract MUST 覆盖 `Codex`、`Claude Code`、`Gemini` 与 `OpenCode` 的主 conversation-visible observations；engine-specific wrapper、provider metadata 或 history replay carrier 只能影响 canonical metadata，不得改变等价语义判断。

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

#### Scenario: claude history replay does not duplicate realtime assistant or approval rows

- **WHEN** `Claude Code` realtime path 已经显示 assistant 正文、`ExitPlanMode` 卡片或 approval-derived file changes 卡片
- **AND** history replay 以 JSONL carrier、resume marker 或 structured history item 再次提供等价 observation
- **THEN** normalization MUST 将其视为同一 semantic observation
- **AND** 系统 MUST NOT 追加第二条主体重复 assistant row、plan row 或 approval row

#### Scenario: gemini history replay preserves reasoning and tool cardinality

- **WHEN** `Gemini` realtime path 已经显示 reasoning 或 tool snapshot
- **AND** history hydrate 以等价 reasoning/tool payload 再次提供该 observation
- **THEN** normalization MUST 使用共享 equivalence 规则收敛
- **AND** visible row cardinality MUST 保持稳定

#### Scenario: canonical realtime events map to normalized thread events

- **WHEN** backend emits canonical realtime events for text delta, reasoning delta, tool output, turn lifecycle, processing heartbeat, usage update, or turn error
- **THEN** frontend MUST map each event into `NormalizedThreadEvent` or an equivalent typed handler path with deterministic `workspaceId`, `threadId`, `eventId`, `operation`, and `turnId` semantics
- **AND** the mapping MUST NOT depend on ad hoc UI component parsing

#### Scenario: legacy realtime aliases remain compatibility input

- **WHEN** an existing engine, history replay, daemon bridge, or old session emits a supported legacy realtime method alias
- **THEN** the system MAY accept that alias as compatibility input
- **AND** new canonical behavior MUST NOT be defined only through the legacy alias
- **AND** compatibility tests MUST distinguish canonical events from legacy aliases
