## 1. Baseline and ownership

- [x] 1.1 Capture heavy-suite noise inventory and classify it into `environment-owned`, `act storm`, `stdout debug`, `expected stderr`, and `intentional library warning`.
- [x] 1.2 Define residual policy so non-repo-owned warnings stay explicitly out of scope.

## 2. Act storm cleanup

- [x] 2.1 Fix `AskUserQuestionDialog.test.tsx` so the submit-path test no longer drains the five-minute countdown interval and no longer emits runaway `act(...)` warnings.
- [x] 2.2 Contain the covered `SpecHub.test.tsx` hotspot `act(...)` warnings at the test boundary so they stop leaking into the heavy-suite output.

## 3. Debug and warning containment

- [x] 3.1 Add a test-mode gate for `useThreadMessaging` DEV instrumentation so heavy Vitest runs stop emitting large debug stdout payloads.
- [x] 3.2 Contain expected stderr and intentional library warnings inside the owning tests instead of leaking them into global heavy-suite output.

## 4. Verification

- [x] 4.1 Run `npm run lint`.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run targeted Vitest suites for `AskUserQuestionDialog`, `SpecHub`, `useThreadMessaging`, `useGitStatus`, `detachedFileExplorer`, `tauri`, `Markdown.math-rendering`, `Sidebar`, and `useGlobalRuntimeNoticeDock`.
- [x] 4.4 Run `VITEST_INCLUDE_HEAVY=1 npm run test` and confirm the heavy-suite output no longer contains the repo-owned hotspot noise covered by this change.
