## Context

The archived Claude streaming fixes addressed two proven hot-path failures:

- `fix-claude-windows-streaming-visibility-stall`: frontend visible text stalled after the first delta.
- `fix-claude-windows-streaming-latency`: backend forwarder emitted deltas only after slow runtime sync / Windows diagnostics work.

The current symptom is different. In repeat-turn Claude Code conversations, the UI can remain in the generating state for tens of seconds before any assistant text appears. The committed debug trace baseline gives us safe app-event timing, but the backend still needs a sharper startup timeline to separate:

```text
send request
  -> spawn Claude process
  -> write/close stdin
  -> first stdout line
  -> first valid stream-json event
  -> first assistant text delta
  -> app-server-event emit
  -> frontend visible render
```

Without that split, a no-first-delta delay can be misdiagnosed as Markdown/render smoothness or as the old backend forwarder stall.

## Goals / Non-Goals

**Goals:**

- Add privacy-safe timing evidence for Claude Code startup and first-token stages.
- Classify repeat-turn no-text waits separately from backend forwarding and frontend visible-output stalls.
- Keep the previously fixed low-latency forwarder order intact.
- Make evidence useful on both Windows and macOS without adding shell-specific behavior.
- Use focused tests to prove redaction, boundary classification, and no regression of stream emit ordering.

**Non-Goals:**

- Do not change Claude provider/model selection.
- Do not tune frontend Markdown throttle or Rust coalescing without evidence that deltas already exist.
- Do not introduce a persistent Claude daemon or process prewarm in this change.
- Do not store raw stdout, prompt text, response text, tool arguments, or environment secrets.

## Decisions

### Decision 1: Treat first-token latency as a pre-ingress category

`backend-forwarder-stall` starts after the Claude engine has produced an event inside the backend. `visible-output-stall-after-first-delta` starts after assistant text ingress reaches the client. A repeat-turn wait with no assistant text delta is neither.

The new category will track `claude-first-token-latency` or a more specific subtype derived from timing evidence.

Alternatives considered:

- Reuse upstream pending: too vague; it does not distinguish local spawn/stdin delay from CLI/provider no-stdout delay.
- Reuse visible stall: incorrect before assistant text delta exists.

### Decision 2: Attach only numeric timing metadata to existing debug surfaces

The backend will propagate timing fields through the existing `ccguiTiming` metadata used by debug-only stream latency tracing. The metadata is limited to timestamps/durations and phase names.

Allowed fields include:

- `processSpawnStartedAtMs`
- `processSpawnedAtMs`
- `stdinWriteStartedAtMs`
- `stdinClosedAtMs`
- `turnStartedAtMs`
- `firstStdoutLineAtMs`
- `firstValidStreamEventAtMs`
- `firstTextDeltaAtMs`

Disallowed fields:

- prompt text;
- assistant text;
- raw stdout/stderr line content;
- tool input/output payloads;
- environment variables.

Alternatives considered:

- Emit raw stream samples in debug mode: rejected because debug switches are still too easy to misuse.
- Add a new persistent diagnostics schema: unnecessary; existing bounded diagnostics surfaces are enough.

### Decision 3: Keep remediation evidence-driven

Implementation should first make the slow phase visible. Only local, proven, low-risk fixes should ship in this change, such as avoiding unnecessary synchronous local work before stdin close or making timeout/error classification sharper.

If evidence shows `firstStdoutLineAtMs` itself is slow after stdin close, the app should report it as CLI/provider/model-side first-token delay rather than hiding it with frontend tuning.

Alternatives considered:

- Prewarm or reuse a Claude process: high semantic risk for working directory, environment, permissions, stop/retry, and session continuity.
- Send synthetic assistant placeholders: would make the UI look active but would not improve actual streaming.

### Decision 4: Make missing or malformed timing harmless

Frontend timing consumption must accept `unknown` payloads, reject non-finite/negative numbers, and avoid producing negative gaps when clocks or payloads are malformed.

Alternatives considered:

- Trust backend timing payloads: rejected because app-server event params are untyped at runtime and may be replayed/migrated.

## Risks / Trade-offs

- [Risk] The new evidence proves the delay is upstream in Claude CLI/provider, not locally fixable.
  Mitigation: classify accurately and avoid damaging already-good streaming paths with unrelated throttle changes.

- [Risk] More timing fields increase payload surface.
  Mitigation: keep fields numeric, bounded, debug-only on frontend consumption, and covered by redaction tests.

- [Risk] Backend and frontend clocks can drift.
  Mitigation: use monotonic phase ordering for backend-derived durations where possible and clamp invalid frontend gaps.

- [Risk] Repeat-turn waits involving reasoning/tool events can be mistaken for a bug.
  Mitigation: track first valid event separately from first text delta and classify valid non-text activity as "valid-event-no-text" rather than silent stall.

## Migration Plan

1. Add delta specs and validate the OpenSpec change.
2. Extend backend Claude startup timing capture.
3. Attach redacted timing metadata to first realtime events through existing event payloads.
4. Extend frontend diagnostics classification and tests.
5. Run focused Rust/Vitest tests plus standard type/lint/governance gates.

Rollback strategy:

- Disable or ignore new timing fields while keeping the previous stream forwarding behavior unchanged.
- If classification is noisy, reduce frontend classification to debug-only logging without changing runtime behavior.

## Open Questions

- What threshold should mark a repeat-turn first-token diagnostic as slow by default: 10s, 20s, or only debug-observed?
- Should valid reasoning/tool activity before text clear the user-facing "first-token slow" concern, or should it remain a separate "no assistant text yet" state?
- Should future work add a small operator-facing timeline in diagnostics UI, or keep this change debug-console only?
