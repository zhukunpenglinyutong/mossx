## Context

Codex realtime canvas currently consumes app-server events through `useAppServerEvents`, then routes assistant deltas, item snapshots, completions, and terminal fallback into `useThreadItemEvents` and `useThreadsReducer`.

The existing protections are partial:

- `threadAgentDeltaSeenRef` suppresses some `item/started` / `item/updated` snapshots after a delta has already arrived.
- `threadAgentCompletedSeenRef` suppresses repeated completions by item id or text.
- `mergeCompletedAgentText` collapses repeated text when an existing assistant item can be found.

The failure mode remains because those protections are not all keyed to the same semantic identity. A live delta may use one item id, a snapshot may be treated as a delta before the real delta is seen, and `turn/completed` may synthesize a fallback id. When the reducer cannot locate an existing assistant item by id or legacy prefix, it appends a new assistant item even if the text is equivalent.

## Goals / Non-Goals

**Goals:**

- Make Codex realtime assistant ingestion idempotent for duplicate/alias event sequences.
- Keep duplicate protection in conversation state, not only in render output.
- Preserve separate assistant segments around tool activity.
- Cover the regression with replayable reducer/event tests.

**Non-Goals:**

- Do not change Rust app-server event formats.
- Do not enable normalized realtime adapters globally.
- Do not rewrite the conversation assembler pipeline.
- Do not change message UI layout or markdown rendering.

## Decisions

### Decision 1: Add reducer-level semantic convergence as the final guard

When a Codex assistant completion or fallback cannot find a target by id, the reducer should search recent assistant messages in the same thread for equivalent or near-equivalent content and merge into that item instead of appending.

Rationale:

- The reducer is the last state mutation boundary before render/search/history consumers.
- It protects both legacy and normalized routing paths.
- It fixes different fallback ids without relying on event order.

Alternative considered: filter duplicates in `Messages.tsx`. Rejected because it hides corrupt state while leaving copy/search/history consumers inconsistent.

### Decision 2: Keep segmentation boundaries explicit

Semantic convergence must only consider assistant items that are safe merge candidates:

- Same thread.
- Assistant message items.
- Recent nearby candidates, preferably after the latest user message.
- No intervening non-hidden tool item when the incoming content is not equivalent to the candidate.

Rationale:

- Codex can legitimately emit multiple assistant text segments around tools.
- A broad same-thread merge would destroy intended turn structure.

Alternative considered: merge all equivalent assistant text anywhere in the thread. Rejected because historical repeated phrases and multi-turn confirmations can be valid separate messages.

### Decision 3: Suppress terminal fallback when any equivalent completion is already seen

`turn/completed` fallback should remain a safety net for non-streaming turns, but it must not emit if an equivalent assistant message is already present or if completion has already been seen for the thread.

Rationale:

- Fallback is useful when no delta/completion events arrive.
- Fallback ids are synthetic and therefore high-risk for duplication.

Alternative considered: remove fallback entirely. Rejected because it would regress non-streaming or sparse provider outputs.

## Risks / Trade-offs

- [Risk] Over-merging real repeated messages. → Mitigation: only merge assistant items with equivalent or near-equivalent content, and add tests for tool-separated non-equivalent segments.
- [Risk] Near-equivalent comparison becomes too permissive. → Mitigation: reuse existing assistant text normalization/merge helpers where possible and keep new helper feature-local.
- [Risk] Normalized and legacy paths diverge further. → Mitigation: place final convergence in reducer so both paths share the same last guard.

## Migration Plan

1. Add focused helper(s) for assistant semantic equivalence or safe merge target resolution.
2. Update `completeAgentMessage` and, if needed, `appendAgentDelta` fallback behavior to reuse the helper.
3. Add regression tests for different item ids and event order variance.
4. Mark tasks complete after targeted tests pass.

Rollback is frontend-only: revert reducer helper changes and tests. No persisted data or runtime contract migration is required.

## Open Questions

- None for implementation. If tests show the duplicate enters only through `turn/completed`, the reducer guard can still remain as a defensive final boundary.
