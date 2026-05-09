## Context

Web service mode uses a browser-injected Tauri shim. The shim opens `/ws`, dispatches daemon notifications through the Tauri event plugin compatibility layer, and reconnects after `onclose` / pre-open `onerror`.

The backend event channel is a broadcast stream. A client that reconnects after a disconnect subscribes from the current point forward; missed completion events are not replayed. Therefore realtime events are not an authoritative recovery source after a tunnel break.

## Decisions

### Decision 1: Emit a browser-local reconnect signal

The shim will track whether the socket has opened before. The first `onopen` only marks the connection established. A later `onopen` after reconnect dispatches a browser `CustomEvent`.

Rationale:

- Keeps the backend protocol unchanged.
- Avoids firing compensation during initial app boot.
- Keeps the signal scoped to web-service browser mode.

### Decision 2: Refresh only active workspace and active processing thread

`useThreads` will listen for the reconnect signal only when `window.__MOSSX_WEB_SERVICE__ === true`. On reconnect it refreshes the active workspace thread list with `preserveState: true`; if the active thread still has `isProcessing`, it also calls `refreshThread`.

Rationale:

- Smallest useful reconciliation surface.
- Avoids full workspace scanning and request storms.
- Preserves local Tauri desktop behavior.

### Decision 3: Best-effort compensation with safe error reporting

Refresh failures are logged through existing debug plumbing. They must not crash render or mutate unrelated state.

Rationale:

- Reconnect may happen while the daemon is still settling.
- Manual refresh remains a valid fallback.

## Risks / Trade-offs

- [Risk] Repeated network flapping could trigger repeated refreshes. Mitigation: scope refresh to active workspace/thread and rely on existing request guards.
- [Risk] Refresh during workspace switch could race. Mitigation: handler reads latest active workspace/thread refs and existing list refresh logic guards stale responses.

## Rollback

Remove the shim reconnect event dispatch and the `useThreads` listener. No data migration or backend state rollback is required.
