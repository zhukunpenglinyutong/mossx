# Design

## Codex Start Single-Flight

The frontend `startThreadForWorkspace` action is the narrowest safe idempotency boundary. Multiple upper-level call sites can trigger it (`ensureThreadForActiveWorkspace`, queued send recovery, workspace actions), so deduping only one caller would leave other race paths open.

Implementation:

- Keep a hook-local `useRef<Record<string, Promise<string | null>>>`.
- Key by workspace id, engine family, and normalized folder id.
- Only wrap the Codex backend path. Claude/Gemini/OpenCode already create local pending ids synchronously and have different lifecycle semantics.
- The first caller owns the backend call and dispatches `ensureThread`, `markCodexAcceptedTurn`, and optional activation.
- Reusing callers await the same promise. If a reusing caller requested activation, it dispatches `setActiveThreadId` for the shared thread id after the promise resolves.
- The in-flight entry is cleared in `finally`, allowing retry after success or failure.

This preserves existing return values and avoids duplicate `ensureThread` side effects.

## Claude Native List Effective Limit

The setting `WorkspaceSettings.visibleThreadRootCount` controls how many unpinned root rows are visible when the sidebar project is collapsed. The actual projection must still contain enough rows to preserve child sessions and continuity. Therefore the list window must be a source-fetch window, not the final display count.

Implementation:

- Add a pure helper that computes `effectiveNativeSessionListLimit(workspace)`.
- The effective limit is at least the normalized visible root count and at least the default/root display baseline.
- The effective limit is capped by the existing catalog page size (`SESSION_CATALOG_PAGE_SIZE`, currently 200).
- Claude native listing uses this effective limit instead of `50`.
- UI row truncation stays in `useThreadRows`, so parent/child expansion, pinned rows, and "show more" behavior remain unchanged.

This compatibility model means a user setting of 200 can actually fetch 200 native Claude summaries, while a setting of 20 no longer drops below the existing stable catalog window contract.

## Boundary Protection

- Folder tree remains organization-only; no new membership rule is introduced.
- Archive/hidden/delete exclusion remains applied after source merge and before visible projection.
- Continuity preservation still skips hidden shared bindings and does not resurrect explicit exclusions.
- Load older continues to use catalog cursor semantics and `SESSION_CATALOG_PAGE_SIZE`.

## Validation

- Unit tests cover Codex concurrent start dedupe and activation behavior.
- Unit tests cover Claude native listing limit uses effective workspace display count rather than hardcoded 50.
- Existing Claude continuity tests verify parent relation and exclusion behavior are not regressed.
