## Context

The observed failure is specific to `Claude Code` realtime conversation output on Windows desktop surfaces. The live UI can show the first one or two characters, then remain in `loading/processing` until the turn finishes and the full assistant message appears at once. The user has confirmed this is unrelated to model choice.

2026-04-24 的补充现场进一步说明，该故障不一定总表现为“完全无字”。部分会话会先显示一个很短的 prefix/stub，随后主内容区长时间不再推进，直到 completed 才整片补齐。这个 stub 不能被当作“已拥有 meaningful live progress”的正常 surface。

Current implementation has three relevant facts:

- `src-tauri/src/engine/claude.rs` already contains Windows-only text delta coalescing (`CLAUDE_TEXT_DELTA_COALESCE_WINDOW_MS = 32`), introduced by `41aba520` to reduce over-fragmented Claude deltas.
- `src/features/threads/utils/streamLatencyDiagnostics.ts` can record first delta / visible render timing, but its stronger mitigation profile is currently bound to `Qwen-compatible Claude provider + Windows`.
- `Messages` / `MessagesRows` / `Markdown` already have render-safe and streaming throttle mechanisms, but current specs do not require live assistant text to continue visibly progressing after first delta.

The design correction is to stop treating provider/model identity as the root-cause boundary. The correct boundary is the Claude Code stream pipeline:

```text
Claude CLI stdout
  -> Rust Claude stream parser / coalescing
  -> EngineEvent::TextDelta
  -> app-server-event
  -> thread event handlers / reducer
  -> Messages live row
  -> Markdown throttled render
  -> visible assistant text
```

The failure can happen anywhere after the first text delta enters this pipeline, so the solution must be evidence-driven across the pipeline rather than provider-driven.

## Goals / Non-Goals

**Goals:**

- Make `Claude Code + Windows` stream visibility independently diagnosable and mitigatable.
- Preserve progressive assistant text visibility after first delta.
- Keep provider/model only as correlation metadata.
- Preserve current semantics for macOS Claude and non-Claude engines.
- Keep rollback possible by disabling the new Claude Windows mitigation profile without changing session continuity.

**Non-Goals:**

- No model/provider-specific root cause.
- No global throttle increase across engines.
- No rewrite of conversation lifecycle or runtime manager.
- No new storage schema or Tauri command payload contract.
- No UI settings panel for tuning stream performance.

## Decisions

### Decision 1: Treat this as a Claude Code engine-level stream visibility contract

**Decision**

Define a new `claude-code-realtime-stream-visibility` capability and make Windows first-delta-then-stall a Claude Code stream visibility bug.

**Why**

The user confirmed model independence. Keeping provider/model as the primary gate would encode a false root cause and keep native Claude Windows exposed.

**Alternatives considered**

- Keep Qwen-specific mitigation: rejected because it misses native Claude.
- Rename the old Qwen change: rejected because that change is archived and semantically narrower than the current issue.

### Decision 2: Add `visible-output-stall-after-first-delta` diagnostics

**Decision**

Extend stream latency diagnostics with an explicit category for turns where first delta has arrived but visible text stops progressing.

**Why**

Current diagnostics distinguish upstream pending and render amplification. The user-visible symptom is sharper: ingress exists, but progressive reveal stalls. That classification is the bridge between runtime evidence and UI evidence.

**Alternatives considered**

- Reuse generic `render-amplification`: insufficient because it does not explicitly encode the “first delta visible, then no further visible growth” failure mode.

### Decision 3: Engine/platform mitigation must not be blocked by provider-scoped rules

**Decision**

Provider-scoped mitigation remains valid for provider-specific anomalies, but it must not be the only path to stronger mitigation. A `Claude Code + Windows + visible stall evidence` profile must be allowed even with no provider match.

**Why**

The old provider rule currently creates a blind spot: unmatched providers retain baseline behavior even when the same user-visible stream failure is present.

**Alternatives considered**

- Make all Windows Claude sessions use the Qwen profile: rejected because it conflates profile identity and engine-level protection.

### Decision 4: Prefer frontend visible-stream mitigation first; touch backend only if evidence proves source-side starvation

**Decision**

The first implementation pass should instrument and mitigate the frontend live render path: diagnostics, active profile resolution, Markdown/live row throttle behavior, and render-safe progressive visibility. Backend `claude.rs` coalescing should only change if diagnostics show runtime-side flush cadence is the actual blocker.

**Why**

Backend already emits and coalesces Windows deltas. The symptom says first text can appear, which suggests the pipeline is not completely blocked before frontend. Changing backend first risks solving the wrong layer.

**Alternatives considered**

- Increase backend coalescing window immediately: rejected because it may worsen latency and does not prove visible render progression.

### Decision 5: Keep mitigation semantic-preserving and rollback-safe

**Decision**

Mitigation may adjust render pacing, Markdown throttle, or live-row lightweight rendering, but must not change item ordering, completed text, terminal lifecycle, stop controls, or processing state.

**Why**

The goal is to restore progressive visibility, not to hide streaming or collapse live output into a final-only path.

### Decision 6: Prefix-only degraded live surfaces must not replace the last readable same-turn surface

**Decision**

当同一 `Claude` turn 的 live assistant surface 先显示过更长正文，随后又回退成更短 prefix/stub 且命中 `visible-output-stall-after-first-delta` 证据时，renderer MUST 保留最近一次更可读的同 turn surface，直到当前 surface 再次追平或超过它。

**Why**

这类故障不是“没有任何 surface”，而是“surface 退化成了前缀 stub”。如果恢复逻辑只在 `0 items` 时触发，系统会错误地把退化 stub 继续当成 authoritative live UI，用户看到的就仍然是大面积空白 + 几个字。

## Risks / Trade-offs

- [Risk] Engine-level Windows mitigation is too broad and affects normal Claude sessions.  
  Mitigation: activate only after first-delta-then-stall evidence, and keep a debug rollback flag.

- [Risk] Diagnostics misclassify upstream delay as visible stall.  
  Mitigation: require `firstDeltaAt` before visible stall classification; no first delta remains upstream pending.

- [Risk] Stronger render pacing reduces perceived fluidity.  
  Mitigation: scope to Windows Claude with evidence and verify final text / ordering parity.

- [Risk] Backend is actually starving flushes, not frontend render.  
  Mitigation: include runtime delta cadence and visible render timing in diagnostics before changing `claude.rs`.

## Migration Plan

1. Rewrite stream latency diagnostics to support `visible-output-stall-after-first-delta` independent of provider/model.
2. Add a Claude Windows mitigation profile resolved from `engine + platform + evidence`.
3. Route the active profile through Messages / Timeline / Rows / Markdown without changing non-Claude paths.
4. Add tests for native Claude Windows activation, non-Claude non-activation, and provider-independent classification.
5. Run Windows native Claude manual matrix before marking the issue fixed.

**Rollback strategy**

- Disable the new Claude Windows mitigation profile while retaining diagnostics.
- If diagnostics are noisy, reduce classification thresholds without changing conversation semantics.
- If frontend mitigation is ineffective, use collected evidence to evaluate a backend `claude.rs` flush/coalescing adjustment as a separate small step.

## Open Questions

- What bounded threshold best represents “visible output stalled after first delta” on Windows WebView: elapsed wall time, text length unchanged across deltas, or render timestamp gap?
- Should Markdown live rendering use a lighter plain-text path during active Claude Windows streaming and rehydrate full Markdown on completion?
- Should the existing `ccgui.debug.streamMitigation.disabled` flag also disable this new engine-level profile, or should it get a separate Claude-specific key?
