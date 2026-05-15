# claude-code-stream-forwarding-latency Specification

## Purpose

Define low-latency Claude Code stream forwarding guarantees so realtime deltas are not blocked by runtime diagnostics or ledger persistence, especially on Windows.
## Requirements
### Requirement: Claude Code Stream Deltas MUST Not Wait For Runtime Diagnostics On Windows

The system MUST keep `Claude Code` realtime stream forwarding on Windows independent from expensive runtime diagnostics and ledger persistence.

#### Scenario: turn start bookkeeping does not block the first stream delta
- **WHEN** the Claude backend forwarder receives `EngineEvent::TurnStarted` for an active Windows turn
- **THEN** the system MAY renew the turn lease or upsert the runtime row needed for active-work protection
- **AND** it MUST NOT wait for Windows process diagnostics, full process-tree snapshots, or durable ledger persistence before the next realtime stream delta can be forwarded
- **AND** expensive runtime refresh work MUST run as background work, a bounded heartbeat, or a terminal/checkpoint reconciliation instead of blocking the event receiver loop

#### Scenario: text delta is emitted before runtime diagnostics
- **WHEN** the Claude backend forwarder receives an `EngineEvent::TextDelta` for an active Windows turn
- **THEN** the corresponding app event MUST be emitted or queued for frontend delivery before process diagnostics are refreshed
- **AND** the forwarder MUST NOT wait for Windows process tree snapshots before emitting the delta

#### Scenario: reasoning and tool deltas use the same hot path
- **WHEN** the Claude backend forwarder receives `EngineEvent::ReasoningDelta` or `EngineEvent::ToolOutputDelta`
- **THEN** those deltas MUST follow the same low-latency forwarding rule as assistant text deltas
- **AND** runtime diagnostics MUST NOT be a per-delta prerequisite

#### Scenario: terminal sync remains allowed after stream delivery
- **WHEN** a Claude turn reaches `TurnCompleted`, `TurnError`, or an equivalent terminal event
- **THEN** the system MAY perform runtime diagnostics and ledger persistence for final state reconciliation
- **AND** that terminal sync MUST NOT retroactively delay already-forwarded stream deltas

### Requirement: Claude Code Stream Activity MUST Preserve Active Work Protection Without Per-Delta Persistence

The system MUST preserve active work protection for live Claude streams while avoiding per-delta durable runtime ledger writes.

#### Scenario: live stream renews active work in memory
- **WHEN** a Claude realtime stream emits repeated deltas during an active turn
- **THEN** the runtime manager MUST renew the stream activity marker or equivalent active-work timestamp in memory
- **AND** the runtime MUST remain protected from warm-retention eviction while the turn is active

#### Scenario: stream activity does not persist ledger on every delta
- **WHEN** multiple Claude deltas arrive within a single active turn
- **THEN** the system MUST avoid writing the runtime ledger for every individual delta
- **AND** durable persistence MUST be limited to bounded checkpoints such as turn start, heartbeat, terminal state, or explicit diagnostics refresh

#### Scenario: delayed background sync cannot remove active stream protection
- **WHEN** a background runtime sync completes after newer stream activity has been recorded
- **THEN** the sync result MUST NOT clear active turn or stream protection for the newer activity
- **AND** stale sync results MUST NOT make the active Claude runtime evictable

### Requirement: Windows Process Diagnostics MUST Be Bounded And Off The Stream Hot Path

The system MUST bound Windows process diagnostics work so it cannot create seconds-long Claude stream stalls.

#### Scenario: repeated diagnostics reuse bounded work
- **WHEN** multiple runtime diagnostics requests happen within the configured Windows diagnostics freshness window
- **THEN** the system MUST reuse a cached process snapshot or join an existing in-flight snapshot
- **AND** it MUST NOT spawn one full PowerShell/CIM process query per stream delta

#### Scenario: diagnostics timeout degrades without blocking stream delivery
- **WHEN** a Windows process diagnostics snapshot exceeds its timeout budget
- **THEN** the system MUST return stale diagnostics, partial diagnostics, or no diagnostics with a traceable degraded reason
- **AND** Claude stream delta delivery MUST continue without waiting for the slow snapshot to finish

#### Scenario: runtime console may show stale diagnostics with freshness metadata
- **WHEN** runtime pool diagnostics are served from a bounded stale snapshot
- **THEN** the runtime row MUST remain usable for active-work state
- **AND** diagnostics freshness or stale reason MUST be available to operators through logs, diagnostics state, or equivalent observability

### Requirement: Claude Forwarding Latency MUST Start After Engine Event Ingress

The Claude Code stream forwarding latency contract MUST only classify delays after an engine event has reached the backend forwarder.

#### Scenario: pre-ingress first-token delay is not a forwarder stall
- **WHEN** a Claude Code turn has started
- **AND** the backend forwarder has not yet received a realtime engine event for that turn
- **THEN** diagnostics MUST NOT classify the delay as `backend-forwarder-stall`
- **AND** first-token/startup diagnostics MUST own that pre-ingress latency window

#### Scenario: first delta remains protected after ingress
- **WHEN** the first Claude Code assistant text delta reaches the backend forwarder
- **THEN** the forwarder MUST emit the corresponding app-server event before runtime diagnostics or ledger persistence
- **AND** this guarantee MUST apply regardless of any earlier first-token latency recorded for the turn

### Requirement: Claude Code Stream Hot Path MUST Remain Mature And Protected

The Claude Code stream hot path is considered mature. Refactors MUST preserve the low-latency rule that inbound realtime engine events are forwarded before diagnostics, ledger persistence, process snapshots, or history reconciliation.

#### Scenario: text reasoning and tool deltas keep the same protected path
- **WHEN** a refactor touches Claude Code event forwarding, runtime manager integration, process diagnostics, context ledger persistence, or realtime app-server event emission
- **THEN** `TextDelta`, `ReasoningDelta`, and `ToolOutputDelta` MUST continue using the protected hot path
- **AND** no per-delta Windows process snapshot, durable ledger write, or full history reconcile MAY be inserted before frontend delivery

#### Scenario: terminal reconciliation stays after live delivery
- **WHEN** a Claude Code stream reaches terminal completion, interruption, or error
- **THEN** diagnostics and durable reconciliation MAY run as terminal or checkpoint work
- **AND** that work MUST NOT retroactively delay already-delivered live deltas or make the final visible assistant content depend on history reload

#### Scenario: performance fixes preserve active work protection
- **WHEN** engineers optimize away per-delta persistence or expensive diagnostics
- **THEN** active stream and active turn protection MUST still be renewed through bounded in-memory markers, lease renewal, heartbeat, checkpoint, or equivalent protection
- **AND** the runtime MUST NOT become evictable while a verified Claude Code turn is still streaming
