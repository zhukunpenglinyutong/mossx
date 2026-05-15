## 1. Realtime Terminal Fence

- [x] 1.1 Add a per-thread terminal turn fence in `useThreadItemEvents` that tracks the active realtime turn and a bounded set of recently terminal turn ids.
- [x] 1.2 Drop batched realtime delta operations at execution time when their turn has already reached terminal state.
- [x] 1.3 Drop queued normalized realtime events at dispatch time when their turn has already reached terminal state.
- [x] 1.4 Drop raw item snapshots at update time when they belong to a terminal turn.

## 2. Turn Lifecycle Settlement

- [x] 2.1 Record active realtime turn identity when `turn/started` is handled.
- [x] 2.2 Flush pending realtime batches before `turn/completed`, `turn/error`, and `turn/stalled` settlement.
- [x] 2.3 Mark completed, errored, and stalled turns as terminal before late realtime work can re-open processing.
- [x] 2.4 Apply conservative fallback settlement when final assistant output is visible, the normal completion guard rejects settlement, and no newer active turn exists.

## 3. Fallback Turn Identity Propagation

- [x] 3.1 Propagate `turnId` through normalized fallback agent delta and fallback assistant completion routing.
- [x] 3.2 Propagate `turnId` through legacy and normalized fallback reasoning delta / boundary routing.
- [x] 3.3 Propagate `turnId` through command output, terminal interaction, and file change output fallback routing.
- [x] 3.4 Keep fallback event helper logic local to `useAppServerEvents` to avoid duplicating optional `turnId` call-shape branches.

## 4. Regression Coverage

- [x] 4.1 Add `useThreadItemEvents` regression coverage for batched delta work that becomes stale after terminal marking.
- [x] 4.2 Add `useThreadItemEvents` regression coverage for queued transition work that becomes stale after terminal marking.
- [x] 4.3 Add `useThreadEventHandlers` regression coverage for fence call ordering across started, completed, error, and stalled turn paths.
- [x] 4.4 Add `useAppServerEvents` regression coverage for fallback `turnId` propagation through tool, file change, reasoning, agent delta, and fallback completion paths.

## 5. Validation

- [x] 5.1 Run focused Vitest suites for app-server event routing and thread realtime lifecycle hooks.
- [x] 5.2 Run TypeScript typecheck to verify handler signature changes do not drift across call sites.
