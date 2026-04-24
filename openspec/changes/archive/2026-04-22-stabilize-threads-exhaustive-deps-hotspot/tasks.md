## 1. P0 missing dependency remediation

- [x] 1.1 Remove the missing dependency warnings in `useQueuedSend.ts`, `useThreadItemEvents.ts`, `useThreadTurnEvents.ts`, and `useThreadActions.ts` without changing send/resume/event behavior.

## 2. P1 factory callback stabilization

- [x] 2.1 Replace the `useCallback(factory(...))` warning set in `useThreadActions.ts` and `useThreadActionsSessionRuntime.ts` with stable memoized callback construction without changing session action behavior.
- [x] 2.2 Re-run `npm run lint`, `npm run typecheck`, and targeted `threads` tests to validate both batches.
