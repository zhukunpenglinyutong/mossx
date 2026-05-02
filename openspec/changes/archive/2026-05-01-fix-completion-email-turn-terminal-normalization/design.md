## Context

The composer completion-email button stores a one-shot intent keyed by thread and target turn. The email sender itself already works: settings, test-send, typed Tauri bridge, and backend SMTP delivery are in place. The broken path is lifecycle identity propagation.

Current Rust engine completion normalization has a generic `EngineEvent::TurnCompleted` path that emits app-server `turn/completed` without `params.turnId`. Codex can still work because its foreground path exposes enough turn identity to the frontend. Claude Code and Gemini rely more heavily on the generic engine forwarding path, so their completion event may arrive with an empty turn id. The frontend then cannot match the terminal event to the armed email intent and silently skips the side effect.

## Goals / Non-Goals

**Goals:**

- Make `turn/completed` carry normalized `turnId` consistently for Codex, Claude Code, Gemini, and OpenCode.
- Preserve one-shot semantics: one opt-in, one matching turn, at most one send.
- Add diagnostics/tests so a missing terminal turn identity cannot regress silently.

**Non-Goals:**

- No SMTP sender redesign.
- No email template redesign.
- No automatic email sending without explicit composer opt-in.
- No broad lifecycle refactor beyond terminal identity normalization.

## Decisions

### Decision 1: Normalize turn identity at the app-server event boundary

- Option A: Teach frontend email logic to infer the turn id from active state when `turn/completed` omits it.
- Option B: Fix the runtime event payload so `turn/completed` includes the active turn id before frontend lifecycle consumers see it.

Choose **B**.

Reason: the lifecycle event contract is the source of truth. Frontend inference would reintroduce race conditions with stale turns, aliases, and duplicate terminal events. Email is only one consumer; the normalized terminal event should be correct for all lifecycle consumers.

### Decision 2: Reuse per-turn forwarding context instead of parsing engine-specific result payloads

- Option A: Extract turn id from each engine's raw completion result.
- Option B: Use the known foreground `turn_id` that wraps each forwarded engine event/session event and inject it into the normalized app-server completion payload.

Choose **B**.

Reason: Claude/Gemini raw completion payloads do not consistently contain the MossX-generated `claude-turn-*` / `gemini-turn-*` identity. The forwarding/session layer already knows the accepted turn id and uses it for `turn/started`; the completed terminal event should reuse that same identity.

### Decision 3: Add frontend defensive diagnostics without relaxing matching

- Option A: If completion has no `turnId`, fall back to active turn and send anyway.
- Option B: Keep exact target-turn matching, but log/debug a recoverable missed-send when an intent exists and terminal identity is missing.

Choose **B**.

Reason: sending on inferred identity risks duplicate or stale-turn emails. A skipped diagnostic is safer and exposes contract breakage during testing.

## Risks / Trade-offs

- [Risk] Multiple call sites convert `EngineEvent` to app-server events, so one path may remain unnormalized.
  → Mitigation: search all `engine_event_to_app_server_event` call sites and add Rust tests around completed payloads.

- [Risk] Optional `turnId` handling could hide missing data.
  → Mitigation: the known foreground turn context must be passed where available; frontend emits a skipped/missed diagnostic if a pending email intent sees an empty terminal turn id.

- [Risk] Existing tests may assert older payload shape.
  → Mitigation: update tests to assert the stronger contract rather than preserve the incomplete payload.

## Migration Plan

1. Extend the Rust app-server event conversion path to accept known turn context for completed terminal events and emit `params.turnId`.
2. Update Claude Code, Gemini, OpenCode, and Codex forwarding call sites that have a current turn id to pass it into the conversion boundary.
3. Add/adjust Rust tests for `turn/completed` payload shape.
4. Add frontend regression coverage for completion email settlement when `turn/completed` includes turn id, plus missing-id diagnostic behavior if practical.
5. Run targeted Rust/frontend tests and OpenSpec validation.

Rollback plan: revert the conversion helper changes and frontend diagnostics. Email settings and sender commands are untouched, so rollback affects only terminal event identity normalization.

## Open Questions

- None. The intended behavior is already defined by the existing one-shot email intent contract; this change repairs the lifecycle identity needed to satisfy it across engines.
