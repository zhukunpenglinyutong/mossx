## Why

Codex realtime conversation canvas can occasionally render duplicate assistant content when the same semantic response arrives through multiple app-server event shapes, such as `item/agentMessage/delta`, `item/updated`, `item/completed`, and `turn/completed` fallback. Existing guards mainly collapse repeated text for the same item identity, but they do not fully protect the canvas from equivalent assistant messages that arrive with different event timing or fallback ids.

This needs a focused fix now because recent Computer Use interactions exposed the same duplicate visible assistant block again, proving the previous text-level dedupe did not close the event-ingestion race.

## 目标与边界

- Target only Codex realtime conversation canvas assistant duplication.
- Keep the fix in frontend event routing, reducer convergence, and replay tests.
- Preserve existing Claude, Gemini, OpenCode event semantics unless covered by shared helper behavior that is already engine-neutral.
- Do not change Rust runtime events, Tauri command payloads, Computer Use broker logic, or provider behavior.

## 非目标

- Do not redesign the full conversation assembler pipeline in this change.
- Do not migrate all engines to normalized realtime adapters by default.
- Do not alter message styling, sticky header behavior, markdown rendering, or tool card grouping.
- Do not hide duplicates only at render time while leaving duplicate conversation items in state.

## What Changes

- Add Codex realtime assistant-message idempotency rules for duplicate or alias event sequences.
- Strengthen reducer convergence so one semantic assistant completion cannot become two visible assistant bubbles solely because ids differ between delta, snapshot, completion, or fallback paths.
- Ensure `turn/completed` fallback does not emit a second assistant message when equivalent assistant content has already been observed in the same turn.
- Add regression coverage for Codex duplicate paths, including different item ids and event order variance.

## 技术方案取舍

| Option | Summary | Pros | Cons | Decision |
|---|---|---|---|---|
| A. Render-layer filtering | Hide adjacent duplicate assistant rows in `Messages` before rendering | Small surface change | Leaves corrupted thread state, breaks copy/search/history consistency | Rejected |
| B. Text-only dedupe inside existing message merge | Expand `mergeCompletedAgentText` and paragraph cleanup | Helps same-id repeated text | Still misses different item ids and turn fallback ids | Rejected |
| C. Event/reducer idempotency | Treat Codex assistant response identity as `turn + semantic assistant content`, then converge in reducer | Fixes state source, survives render/history/search consumers, minimal runtime impact | Requires careful edge-case tests | Selected |

## Capabilities

### New Capabilities

- `codex-realtime-canvas-message-idempotency`: Codex realtime assistant events must converge to one visible assistant message per semantic response, even when equivalent content arrives through multiple event shapes or fallback ids.

### Modified Capabilities

- `conversation-lifecycle-contract`: Realtime lifecycle convergence must include duplicate Codex assistant event aliases and must not produce duplicate completed assistant bubbles after terminal settlement.

## Impact

- Affected frontend code:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/threadReducerTextMerge.ts` if reusable semantic comparison is needed
  - Related tests under `src/features/threads/hooks/`
- No backend command, storage schema, or external dependency changes.
- Quality gates:
  - Targeted Vitest tests for reducer and app-server event routing.
  - TypeScript typecheck if touched helper signatures become shared.

## 验收标准

- Replaying a Codex event sequence containing `delta -> item/completed -> turn/completed` must leave exactly one assistant message.
- Replaying `item/updated snapshot -> delta -> item/completed` with equivalent content must leave exactly one assistant message.
- Replaying equivalent assistant completion under a different fallback item id must merge with the existing assistant message instead of appending a second bubble.
- History-detail reconciliation must wait for Codex `turn/completed` and run at most once per thread/turn; `item/completed` alone must not trigger it.
- Non-equivalent assistant segments separated by tool activity must still remain separate messages.
- Existing completed duplicate paragraph tests must continue to pass.
