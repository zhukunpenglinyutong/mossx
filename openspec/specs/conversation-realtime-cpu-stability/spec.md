# conversation-realtime-cpu-stability Specification

## Purpose

Defines the conversation-realtime-cpu-stability behavior contract, covering Lossless Realtime Event Micro-Batching.

## Requirements
### Requirement: Lossless Realtime Event Micro-Batching

The client MUST support lossless micro-batching for high-frequency realtime conversation events to reduce dispatch/render amplification while preserving event semantics.

#### Scenario: preserve per-thread event ordering during batching
- **WHEN** high-frequency `delta` events are enqueued for the same thread
- **THEN** batched dispatch MUST preserve original relative event order
- **AND** downstream reducers MUST observe the same logical sequence as non-batched mode

#### Scenario: no event loss under burst traffic
- **WHEN** burst realtime events exceed a single frame capacity
- **THEN** the batching queue MUST flush in bounded chunks without dropping events
- **AND** every accepted event MUST be consumed exactly once by state reducers

### Requirement: Reducer No-Op Reference Stability

Thread state reducers MUST return stable references for semantically unchanged updates.

#### Scenario: unchanged update returns original state references
- **WHEN** a realtime update does not change thread-visible state
- **THEN** reducer MUST return the existing state object reference
- **AND** dependent selectors/components MUST NOT be invalidated by reference churn

#### Scenario: changed update still propagates correctly
- **WHEN** a realtime update changes thread-visible state
- **THEN** reducer MUST produce updated references for affected branches
- **AND** unchanged branches MUST retain prior references

### Requirement: Incremental Thread-Scoped Derivation

Derived conversation data MUST be recomputed incrementally by affected thread scope instead of global full replay.

#### Scenario: only affected threads are recomputed
- **WHEN** realtime updates touch a subset of threads
- **THEN** the derivation pipeline MUST recompute only affected threads
- **AND** unrelated thread-derived results MUST be reused

#### Scenario: derivation cache invalidates by thread revision
- **WHEN** an affected thread receives a new logical revision
- **THEN** the corresponding cached derivation MUST be invalidated
- **AND** stale derived results MUST NOT be served

### Requirement: Message Rendering Compute Deduplication

Message rendering MUST avoid repeated parse/transform work for unchanged item revisions.

#### Scenario: unchanged revision reuses parsed payload
- **WHEN** the renderer receives an item with unchanged revision
- **THEN** expensive parse/transform results MUST be reused
- **AND** the render path MUST NOT repeat the same computation in that frame

#### Scenario: revision change recomputes once
- **WHEN** item revision changes due to new realtime deltas
- **THEN** parse/transform MUST be recomputed once per revision
- **AND** all render consumers MUST reuse that computed result

### Requirement: Session Activity and Radar Incremental Refresh

Session activity and radar feeds MUST refresh incrementally from changed thread identities.

#### Scenario: unrelated thread updates do not trigger global rebuild
- **WHEN** a realtime update affects one thread
- **THEN** activity/radar recomputation MUST remain scoped to the changed thread set
- **AND** unrelated workspace-thread rows MUST NOT be globally rebuilt

#### Scenario: status transition updates existing identity
- **WHEN** a session event transitions from running to completed or failed
- **THEN** the feed MUST update the existing session identity entry
- **AND** the feed MUST NOT insert duplicate rows for the same workspace-thread identity

### Requirement: Performance Guardrail and Safe Rollback

Realtime CPU optimizations MUST provide observability and safe rollback controls.

#### Scenario: optimization metrics are emitted for regression comparison
- **WHEN** realtime optimization paths are active
- **THEN** the system MUST emit metrics for batching, reducer no-op hit rate, and derivation cost
- **AND** these metrics MUST support baseline vs optimized comparison

#### Scenario: layered rollback restores baseline behavior
- **WHEN** optimization regression is detected
- **THEN** operators MUST be able to disable batching/derivation/no-op guards independently
- **AND** the client MUST continue processing realtime events with baseline-compatible semantics

### Requirement: Claude Live Assistant Delta MUST Avoid Per-Delta Full Thread Derivation

Claude live assistant text updates MUST avoid full thread canonical derivation for repeated pure text deltas when the thread structure is unchanged.

#### Scenario: repeated text delta uses reducer fast path
- **WHEN** a Claude live turn appends text delta to an existing assistant message with the same item id
- **AND** the update does not introduce a new conversation item or change item kind
- **THEN** the reducer MUST update only the affected assistant item
- **AND** it MUST NOT run full `prepareThreadItems(...)` for that delta

#### Scenario: boundary events return to canonical derivation
- **WHEN** the assistant message completes, a structured item is inserted, or a legacy/canonical id migration is required
- **THEN** the reducer MUST run the canonical derivation path
- **AND** final thread items MUST preserve existing semantics for dedupe, truncation, generated image anchoring, and final metadata

#### Scenario: fast path preserves final metadata guard
- **WHEN** an existing finalized assistant message receives additional live text while the thread is still processing
- **THEN** the reducer MUST clear stale final metadata before showing the message as live again
- **AND** it MUST NOT leave a streaming assistant message marked as final

### Requirement: Gemini Live Assistant Delta MUST Use Lossless Realtime Batching
Gemini live assistant text deltas MUST participate in the same lossless realtime batching contract as other engine assistant deltas unless an explicit safety guard requires immediate dispatch.

#### Scenario: gemini assistant deltas are batched when batching is enabled
- **WHEN** realtime batching is enabled
- **AND** Gemini assistant text deltas arrive within the same flush window for the same thread
- **THEN** the client MUST buffer them through the realtime batching queue
- **AND** dispatch/render amplification MUST be reduced without losing any accepted delta

#### Scenario: gemini batching preserves processing and interruption semantics
- **WHEN** a Gemini assistant delta is buffered
- **THEN** the eventual flush MUST still ensure the thread, mark processing when appropriate, preserve original per-thread operation order, call message activity once per flush window, and respect interrupted-thread suppression
- **AND** unmount cleanup MUST flush or discard buffers according to the same lossless contract used by other engines

### Requirement: Reasoning And Tool Delta Reducers MUST Avoid Per-Chunk Full Derivation When Safe
High-frequency reasoning and tool output deltas MUST avoid full thread canonical derivation for repeated same-item updates when the thread structure is unchanged.

#### Scenario: reasoning delta updates existing live reasoning item incrementally
- **WHEN** a Claude Code, Gemini, or Codex-compatible reasoning delta appends or snapshots text for an existing reasoning item
- **AND** no item kind, item order, generated-image anchoring, ask-user normalization, exploration summary, or tool truncation boundary can change
- **THEN** the reducer MUST update only the affected reasoning item
- **AND** it MUST NOT run full `prepareThreadItems(...)` for that delta

#### Scenario: tool output delta updates existing live tool item incrementally
- **WHEN** a tool output delta appends text to an existing running tool item
- **AND** the update does not cross a truncation boundary requiring canonical tool output processing
- **THEN** the reducer MUST update only the affected tool item
- **AND** it MUST NOT run full `prepareThreadItems(...)` for that delta

#### Scenario: structural boundaries return to canonical derivation
- **WHEN** a new item is inserted, an item completes, a tool output crosses truncation policy boundaries, a generated image anchor may change, or legacy id canonicalization is required
- **THEN** the reducer MUST run the canonical derivation path
- **AND** final thread items MUST preserve existing dedupe, truncation, generated image anchoring, ask-user normalization, exploration summary, and metadata semantics

### Requirement: Normalized Realtime Assistant Events MUST Coalesce By Engine-Agnostic Safety Rules
Normalized realtime assistant events MUST be eligible for batching/coalescing based on operation and item semantics rather than Codex-only engine identity when they satisfy the same snapshot-equivalence safety contract.

#### Scenario: safe assistant snapshot events coalesce by item identity
- **WHEN** normalized realtime assistant `itemStarted` or `itemUpdated` events arrive for the same thread and item identity within one flush window
- **AND** the events are safe to replace with the latest snapshot without losing semantic ordering
- **THEN** the client MUST coalesce them by thread/item identity
- **AND** this rule MUST be available to Codex, Claude Code, and Gemini when their normalized events satisfy the same safety contract

#### Scenario: non-snapshot or completion events preserve full ordering
- **WHEN** normalized realtime events represent completion, tool/review/generated-image changes, user messages, or any non-equivalent operation
- **THEN** the client MUST preserve the full event sequence
- **AND** it MUST NOT coalesce events merely because they share an item id

### Requirement: Inactive Running Sessions MUST Use Background Render Budget
The client MUST apply a background render budget to inactive running sessions so high-frequency realtime output does not drive foreground-priority visible rendering while preserving event semantics.

#### Scenario: inactive running session does not render every output delta
- **WHEN** a session is running but is not the active visible session
- **AND** realtime output deltas continue to arrive for that session
- **THEN** the client MUST avoid rendering each output delta through high-cost visible output surfaces
- **AND** the client MUST continue updating lightweight session metadata such as running state, last activity, buffered output count, and error summary

#### Scenario: active session keeps foreground realtime rendering
- **WHEN** a running session is the active visible session
- **THEN** the client MUST preserve foreground realtime rendering for user-visible output and send-critical controls
- **AND** background render budgeting MUST NOT delay composer input, approval controls, stop controls, or visible error state

### Requirement: Background Output Buffer MUST Be Lossless And Ordered
Inactive running session output buffering MUST preserve accepted realtime event semantics while allowing render work to be flushed later in bounded chunks.

#### Scenario: buffered output converges without loss after returning foreground
- **WHEN** output events are accepted while a running session is inactive
- **AND** the user switches that session back to foreground
- **THEN** buffered output MUST converge to the same logical conversation output as foreground processing
- **AND** output MUST NOT be lost, duplicated, or reordered within the same thread, turn, and item lineage

#### Scenario: semantic boundary events are not coalesced away
- **WHEN** buffered events include completion, approval, error, tool boundary, generated image boundary, or history reconciliation events
- **THEN** the client MUST preserve those semantic boundaries
- **AND** the client MUST NOT discard them merely because adjacent output deltas are snapshot-equivalent

### Requirement: Foreground Restore MUST Flush Heavy Output In Bounded Chunks
When a background running session becomes active, heavy output restoration MUST be scheduled in bounded chunks rather than synchronously flushing all buffered render work.

#### Scenario: session shell becomes interactive before heavy output completes
- **WHEN** a background running session is switched to foreground with buffered heavy output
- **THEN** the client MUST render the interactive session shell and critical controls before completing heavy output hydration
- **AND** heavy output hydration MUST yield between chunks to avoid blocking foreground interaction

#### Scenario: restoring work yields to new user interaction
- **WHEN** heavy output hydration is in progress
- **AND** the user types, sends, stops a task, approves an action, or switches sessions again
- **THEN** the client MUST prioritize the new foreground interaction
- **AND** stale or low-priority hydration work MUST be cancelled, deferred, or resumed safely

