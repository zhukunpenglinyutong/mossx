## 1. Code Audit

- [x] 1.1 Confirm current Claude `engine_send_message` response can contain provisional `sessionId`.
- [x] 1.2 Confirm `thread/started` event is the authoritative native session confirmation path.
- [x] 1.3 Confirm fork first-send path uses `forkSessionId` and does not depend on pending response-session cache.
- [x] 1.4 Confirm delete/archive/Copy ID/TUI resume actions are finalized-id scoped.

## 2. Frontend Continuation Guard

- [x] 2.1 Stop caching Claude pending `engine_send_message` response `sessionId` as a native resume id.
- [x] 2.2 Add or reuse a native-session readiness check before Claude pending follow-up sends.
- [x] 2.3 Ensure pending follow-up without native truth does not call `engineSendMessage` with `continueSession=true` and a provisional id.
- [x] 2.4 Keep finalized `claude:<sessionId>` continuation unchanged.
- [x] 2.5 Keep Gemini/OpenCode/Codex continuation unchanged.

## 3. Compatibility Preservation

- [x] 3.1 Verify Claude fork first send still passes `forkSessionId=<parentSessionId>`.
- [x] 3.2 Verify fork child finalization still converges to `claude:<childSessionId>`.
- [x] 3.3 Verify delete/archive remain unavailable for pending Claude ids and available for finalized Claude ids.
- [x] 3.4 Verify Copy ID and Claude TUI resume command remain finalized-id only.
- [x] 3.5 Verify RequestUserInput/approval resume still route through canonical thread resolution.

## 4. Tests

- [x] 4.1 Update the existing test that currently expects response-derived Claude pending session id reuse.
- [x] 4.2 Add regression test for fast second send before native `thread/started`.
- [x] 4.3 Add regression test for follow-up after native rebind.
- [x] 4.4 Add regression test proving fork first-send is not blocked by the pending continuation guard.
- [x] 4.5 Add focused tests for any touched session-management menu boundary.

## 5. Verification

- [x] 5.1 Run `openspec validate fix-claude-native-session-continuation-race --type change --strict --no-interactive`.
- [x] 5.2 Run focused Vitest for touched hooks/components.
- [x] 5.3 Run `npm run typecheck` if TypeScript surfaces changed.
- [ ] 5.4 Manually reproduce: first Claude message, immediately attempt second message before native bind, verify no `No conversation found` from provisional resume.
- [ ] 5.5 Manually verify finalized Claude session follow-up, fork child, delete, Copy ID, and Copy Claude resume command still work.
