## Context

Codex managed runtime currently has three lifecycle signals that are too coarse:

- `WorkspaceSession::mark_manual_shutdown()` only records that a stop was requested, but not whether the stop came from user intervention, replacement cleanup, stale-session cleanup, settings restart, or app exit.
- `handle_runtime_end()` always emits `runtime/ended` and drains pending state once stdout closes or the process exits, even when the shutdown was an expected internal cleanup with no active foreground work.
- Runtime pool `pinned` is stored on the live `RuntimeEntry`; `record_removed()` deletes the row, so pin intent can disappear when the runtime row is recreated.

The current reconnect card is intentionally simple: frontend detection keys off structured `[RUNTIME_ENDED]` text and existing reconnect reasons. This change should keep that contract and reduce false positives at the backend source instead of hiding all `manual_shutdown` diagnostics in the UI.

Important constraints:

- No public Tauri command shape change.
- No ledger format break. New ledger fields must be optional/defaulted.
- No new daemon, database, or cross-engine lifecycle rewrite.
- Pending requests must still settle deterministically.

## Goals / Non-Goals

**Goals:**

- Attribute Codex runtime shutdown source precisely enough to distinguish user-visible interruption from internal lifecycle cleanup.
- Emit `runtime/ended` only when there is affected foreground work, pending request state, timed-out request state, or background callback state to recover.
- Preserve pin intent across runtime removal/recreation without requiring a live row to exist.
- Improve stdout EOF diagnostics by opportunistically pairing EOF with process exit metadata inside a bounded wait.
- Keep frontend reconnect-card classification backward compatible for true runtime loss.

**Non-Goals:**

- Replacing the runtime orchestrator or changing acquire/recovery command APIs.
- Guaranteeing that an already-lost turn can resume in-place.
- Introducing multi-client owner locking.
- Redesigning Runtime Pool UI or adding new user-facing settings.

## Decisions

### Decision 1: Add explicit shutdown attribution on `WorkspaceSession`

Represent shutdown source as an internal enum stored in `WorkspaceSession`, with a default of `None` and a `mark_shutdown_requested(source)` helper. Initial sources:

- `user_manual_shutdown`: Runtime Pool close / release path that reflects explicit user intervention.
- `internal_replacement`: old session cleanup after successful replacement swap.
- `stale_reuse_cleanup`: stale session rejected before reuse or failed health probe cleanup.
- `settings_restart`: future-compatible internal restart source when settings require runtime recreation.
- `app_exit`: app shutdown drain.
- `idle_eviction`: reconciler TTL/budget eviction.

Existing `mark_manual_shutdown()` remains as a compatibility wrapper where needed, but new call sites should pass a source. `stale_reuse_reason()` should report the source-specific reason, so reuse rejection diagnostics no longer collapse all stops into generic `manual-shutdown-requested`.

Alternative considered: infer source from `lease_source` strings or caller function names. Rejected because it would keep shutdown meaning implicit and brittle.

### Decision 2: Gate thread-facing runtime-ended emission by affected work

`handle_runtime_end()` should still record runtime exit evidence and settle pending requests, but it should only emit `runtime/ended` to the app-server event stream when there is actual affected work:

- active turn context,
- pending request count,
- timed-out request count,
- background thread callback registrations,
- active-work protection in the runtime manager, including turn/stream leases and foreground work continuity when applicable.

Expected internal shutdown with no affected work should become ledger/runtime diagnostics only. It must not append a misleading reconnect card to the current thread. Runtime-ended row mutation and active-work visibility checks must also be guarded by session identity so an old predecessor process cannot overwrite or borrow signals from a newer successor runtime row.

If there is affected work, the event remains structured and recoverable, including `reasonCode`, message, exit metadata, affected thread/turn ids, and pending count.

Alternative considered: frontend suppresses all `manual_shutdown` reconnect cards. Rejected because user-triggered close during an active turn is still a real recoverable interruption.

### Decision 3: Preserve pin intent outside transient runtime rows

Keep runtime row `pinned` for snapshot compatibility, but add an internal `pinned_keys` set in `RuntimeManager` keyed by `(engine, workspace)`. `pin_runtime()` updates this set regardless of whether a row currently exists. `upsert_entry()`, `record_starting()`, `record_ready()`, and replacement paths hydrate row `pinned` from the set.

`record_removed()` may remove the transient row, but must not erase the pin intent. A later runtime row for the same key should reappear pinned.

Ledger compatibility: no public row field changes are required. Persisted rows still include `pinned`; startup/orphan cleanup may drop live rows as today. The in-memory pin intent is enough for this focused fix because the current bug is row-lifecycle loss during one app session. Cross-restart pin persistence can be handled later if product behavior requires it.

Alternative considered: preserve tombstone rows for pinned runtimes. Rejected because it would complicate snapshot semantics and make “no live runtime” visually ambiguous.

### Decision 4: Pair stdout EOF with process status using bounded wait

When stdout reaches EOF, the reader task should attempt a bounded `try_wait` / short `wait` path before choosing diagnostics:

- If process status is available, emit `process_exit` or source-specific `manual_shutdown` with `exitCode` / `exitSignal`.
- If status is not available inside the bounded wait, keep `stdout_eof`.
- The wait must be short enough not to block the reader task materially.

This should be implemented locally in backend lifecycle code and covered by focused tests for the helper-level status classification. It should not introduce a global process supervisor.

Alternative considered: wait indefinitely for child status after EOF. Rejected because it can block lifecycle settlement and pending request cleanup.

## Risks / Trade-offs

- [Risk] Suppressing expected internal shutdown events could hide a real active-turn loss if context collection is incomplete. → Mitigation: count pending requests, timed-out requests, active turns, callbacks, and session-scoped runtime-manager active-work protection before suppressing emission; tests cover no-work vs active-work paths.
- [Risk] New shutdown source enum may miss a call site. → Mitigation: keep compatibility wrapper, then update known lifecycle call sites first: replacement, stale cleanup, eviction, Runtime Pool close/release, app-exit drain if present.
- [Risk] Pin intent stored outside rows is in-memory only. → Mitigation: this matches the scoped bug boundary; do not claim cross-restart pin persistence in this change.
- [Risk] Bounded EOF wait could introduce flake if tests depend on OS-specific process timing. → Mitigation: isolate status/message helpers and avoid sleep-heavy integration tests where helper tests are enough.
- [Risk] Frontend reconnect behavior may still show cards for legacy backend messages. → Mitigation: keep existing detection unchanged unless a focused test proves a classification hole.

## Migration Plan

1. Add internal shutdown attribution types/helpers with default compatibility behavior.
2. Update Codex lifecycle call sites to pass source-specific shutdown attribution.
3. Add event-emission gate while preserving pending settlement and runtime ledger diagnostics.
4. Add runtime-manager pin-intent set and hydrate rows from it.
5. Add bounded stdout EOF process-status correlation.
6. Add focused Rust tests and frontend diagnostic tests only if frontend classification changes.

Rollback is straightforward: revert the internal attribution/gating/pin-intent changes. Public command shapes, settings files, and existing runtime ledger rows remain compatible.

## Open Questions

- Should pin intent eventually persist across full app restart as a user preference? This proposal intentionally treats it as out of scope.
- Should app-exit shutdown emit runtime-ended diagnostics for active work, or rely on app shutdown semantics to suppress user-facing recovery? This can be source-specific once app-exit call sites are updated.
