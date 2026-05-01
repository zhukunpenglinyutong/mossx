## Why

GitHub issue #411 reports that Claude Code auto mode can leave an `AskUserQuestion` dialog stuck after timeout. The backend waits up to 5 minutes for the answer, clears the pending request when the wait expires, and continues. The frontend queue does not receive a completion event for that timeout, so the dialog can remain visible.

When the user later clicks cancel, the response can no longer be delivered because the backend has already settled the request. The current hook treats that stale response as a normal submit failure and keeps the request in the queue, which makes the dialog impossible to close.

## What Changes

- Treat stale timeout settlement errors for empty AskUserQuestion responses as a local queue settlement, not as a retryable submit failure.
- Keep ordinary submit failures unchanged: the request remains visible when the backend may still accept the answer.
- Add a regression test covering the timeout/cancel path.

## Scope

- Frontend hook only:
  - `src/features/threads/hooks/useThreadUserInput.ts`
  - `src/features/threads/hooks/useThreadUserInput.test.tsx`
- No change to the AskUserQuestion dialog layout or question-answer payload.
- No backend command or protocol schema change.

## Acceptance

- If a timed-out Claude AskUserQuestion request is cancelled after backend settlement, the frontend MUST remove it from the pending request queue.
- The thread MUST leave the optimistic processing state created for the attempted response.
- The hook MUST NOT create a synthetic submitted-answer history item for a response that the backend already rejected as stale.
- Non-stale submit failures MUST still keep the request visible for retry.
