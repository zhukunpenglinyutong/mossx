# conversation-realtime-client-performance Specification

## Purpose

Defines the conversation-realtime-client-performance behavior contract, covering Realtime Conversation Client MUST Expose A Three-Engine Performance Budget.

## Requirements
### Requirement: Realtime Conversation Client MUST Expose A Three-Engine Performance Budget
The client MUST define a shared performance budget for Codex, Claude Code, and Gemini realtime conversation turns so optimization decisions are evaluated against the same observable contract.

#### Scenario: streaming turn records client-side budget evidence
- **WHEN** a Codex, Claude Code, or Gemini turn enters realtime streaming
- **THEN** the client MUST be able to correlate event ingress cadence, batching flush cadence, reducer derivation cost, render-visible text cadence, and composer responsiveness evidence to the same workspace/thread/turn identity
- **AND** this evidence MUST remain bounded for long streaming turns

#### Scenario: budget evidence distinguishes engine-specific symptoms from shared client amplification
- **WHEN** Gemini, Claude Code, or Codex shows slow or choppy visible output
- **THEN** diagnostics MUST distinguish provider/upstream delay, backend forwarding stall, client reducer amplification, render amplification, and composer responsiveness degradation
- **AND** the system MUST NOT classify a shared client hot-path issue as a provider-specific issue solely because one engine exposed it first

### Requirement: Streaming Optimizations MUST Preserve Send-Critical Composer State
Realtime conversation optimizations MUST isolate high-frequency live conversation props from the composer without delaying or rewriting user-owned input state.

#### Scenario: live curtain updates do not drive composer input source of truth
- **WHEN** a conversation is streaming and the user is typing in the composer
- **THEN** deferred or throttled live props MAY be used for advisory status, context usage, rate limits, stream activity, and message items
- **AND** draft text, selection, IME composition state, attachments, and final send payload MUST remain immediate and canonical

#### Scenario: streaming completion converges deferred composer props
- **WHEN** a streaming turn completes after composer-facing live props were deferred
- **THEN** the composer MUST naturally converge to the latest canonical status and usage data
- **AND** stale advisory props MUST NOT remain visible after the turn has settled

### Requirement: Realtime Client Performance Changes MUST Be Rollback-Safe
Each client performance optimization layer MUST have a safe rollback path that restores baseline-compatible semantics without breaking session continuity.

#### Scenario: rollback disables one optimization layer without disabling diagnostics
- **WHEN** batching, incremental derivation, render pacing, or mitigation profile changes are disabled by a rollback flag
- **THEN** the client MUST continue processing realtime events with baseline-compatible semantics
- **AND** diagnostics MUST continue collecting enough evidence to compare baseline and optimized behavior

#### Scenario: rollback remains scoped to affected engine or layer
- **WHEN** a Claude/Gemini/Codex-specific profile or fast path is rolled back
- **THEN** unrelated engines and unrelated optimization layers MUST keep their existing behavior
- **AND** disabling one layer MUST NOT silently disable all realtime performance protections

### Requirement: Realtime Diagnostics MUST Distinguish Terminal Settlement Failure
Realtime client diagnostics MUST distinguish upstream or runtime stalls from frontend terminal settlement failures that leave processing state visible after final output is rendered.

#### Scenario: final output visible but processing remains true is classified as settlement failure
- **WHEN** final assistant output has been accepted by the client
- **AND** the thread remains in processing mode after terminal completion handling
- **THEN** diagnostics MUST classify the issue as frontend terminal settlement failure unless evidence shows the runtime turn is still active
- **AND** diagnostics MUST include workspace, thread, turn, engine, active turn, alias, and processing state dimensions

#### Scenario: missing terminal event remains distinguishable from rejected terminal event
- **WHEN** a user reports a stuck generating state
- **THEN** diagnostics MUST allow troubleshooting to distinguish no `turn/completed` event received from a received event rejected by settlement guards
- **AND** the system MUST NOT classify both cases as generic render or provider delay

### Requirement: Client Scheduling MUST Respect Terminal Turn Fences
Client-side realtime batching, throttling, and scheduled rendering MUST preserve terminal lifecycle semantics by checking terminal turn fences at the point where queued work executes.

#### Scenario: batched realtime operations observe terminal state at flush time
- **WHEN** realtime delta operations are buffered for client-side batching
- **AND** the associated turn reaches terminal state before the batch flushes
- **THEN** the batch flush MUST drop operations for the terminal turn
- **AND** the flush MUST NOT re-open processing or append stale visible output for that turn

#### Scenario: scheduled normalized event observes terminal state at dispatch time
- **WHEN** a normalized realtime event is queued through client scheduling before terminal settlement
- **AND** the event executes after the same turn has reached terminal state
- **THEN** the scheduled dispatch MUST skip state mutation for the terminal turn
- **AND** the thread's completed, errored, or stalled lifecycle result MUST remain unchanged

#### Scenario: integration path preserves completed state after late normalized update
- **WHEN** a full `useThreads` realtime path processes final assistant completion and turn completion
- **AND** a late normalized update for the same turn arrives afterward
- **THEN** the thread MUST remain non-processing
- **AND** the previously visible final assistant output MUST NOT be replaced or extended by the stale update

### Requirement: Realtime Performance Routing MUST Preserve Exact Turn Filtering
Realtime client performance and fallback routing optimizations MUST preserve exact turn identity so terminal filtering remains correct under high-frequency or delayed event delivery.

#### Scenario: fallback routing keeps turn id through optional handler shapes
- **WHEN** fallback routing adapts an event to agent completion, reasoning, command output, terminal interaction, or file-change handlers
- **THEN** the adapted call MUST pass through the original `turnId` when present
- **AND** the handler signature MUST remain typechecked across call sites

#### Scenario: event-handler prefilter avoids unnecessary scheduled work
- **WHEN** the event handler receives a raw item, normalized event, or agent delta for a turn already known as terminal
- **THEN** the handler MUST skip downstream realtime scheduling for that event
- **AND** no additional high-frequency client work MUST be created for the terminal turn

#### Scenario: rollback preserves baseline-compatible processing
- **WHEN** batching or scheduling optimizations are disabled by runtime flags
- **THEN** terminal turn filtering MUST still protect direct realtime execution paths
- **AND** the client MUST preserve baseline-compatible event handling for non-terminal turns

### Requirement: Realtime Performance Budget MUST Include Session Visibility
Realtime conversation performance evidence MUST include active, inactive, and restoring session visibility so regressions can distinguish provider delay from client render amplification.

#### Scenario: diagnostics correlate visibility with stream and render cost
- **WHEN** a Codex, Claude Code, or Gemini session is streaming
- **THEN** diagnostics MUST be able to correlate workspace, thread, engine, turn, visibility state, ingress cadence, buffer depth, flush latency, render cost, and long task evidence
- **AND** the evidence MUST remain bounded for long-running sessions

#### Scenario: background render amplification is distinguishable from upstream delay
- **WHEN** users report switching lag between running sessions
- **THEN** diagnostics MUST distinguish provider or backend first-token delay from runtime ingress delay, background buffer flush delay, React render amplification, and layout or scroll work
- **AND** the system MUST NOT classify background UI render amplification as an upstream provider issue without evidence

### Requirement: Background Scheduling Optimizations MUST Be Layer-Rollback Safe
Background session scheduling optimizations MUST be independently rollback-safe without breaking realtime session continuity.

#### Scenario: disabling render gating restores baseline rendering without disconnecting runtime
- **WHEN** background render gating is disabled by a rollback flag
- **THEN** the client MUST return to baseline-compatible realtime rendering behavior
- **AND** active runtime connections and in-flight session tasks MUST NOT be disconnected, restarted, or cancelled by that rollback

#### Scenario: disabling staged hydration preserves diagnostics
- **WHEN** staged hydration is disabled by a rollback flag
- **THEN** the client MAY restore baseline foreground rendering behavior for switched sessions
- **AND** diagnostics MUST continue collecting enough ingress, flush, render, and long task evidence to compare baseline and optimized behavior
