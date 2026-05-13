## 1. Regression Reproduction

- [x] 1.1 [P0] Add focused test for `turn/completed` rejected by active turn mismatch; input: synthetic realtime handler state with final assistant evidence; output: assertion that processing remains and settlement rejection is logged; verification: focused Vitest fails before fix.
- [x] 1.2 [P0] Add focused test for pending/canonical alias settlement; input: canonical completion event and pending alias with same active turn; output: both thread identities leave processing; verification: focused Vitest passes after fix.
- [x] 1.3 [P0] Add focused test for newer active turn guard; input: final evidence for older turn and newer active turn in state; output: fallback does not clear newer processing; verification: focused Vitest passes after fix.

## 2. Settlement Diagnostics

- [x] 2.1 [P0] Add settlement audit payload; input: workspace/thread/turn/alias/activeTurnId/processing snapshots; output: structured debug events for settled/rejected/fallback-settled; verification: tests assert rejection payload includes reason and identities.
- [x] 2.2 [P1] Ensure diagnostics stay bounded; input: terminal settlement events only; output: no per-delta logging; verification: code review and tests avoid high-frequency emission.

## 3. Settlement Fix

- [x] 3.1 [P0] Refactor `onTurnCompleted` settlement to compute target thread identities before clearing state; input: requested thread, resolved alias, active turn snapshots; output: deterministic settlement result; verification: existing completion tests still pass.
- [x] 3.2 [P0] Implement alias-aware cleanup for matching pending/canonical identities; input: target identities with matching turn or no active turn; output: `markProcessing(false)` and `setActiveTurnId(null)` run on all safe targets; verification: alias settlement test passes.
- [x] 3.3 [P0] Add guarded fallback using final assistant completion evidence; input: final assistant completion evidence and no newer active turn; output: pseudo-processing residue clears safely; verification: fallback and newer-turn tests pass.

## 4. Verification

- [x] 4.1 [P0] Run focused Vitest for touched thread event/turn handlers; input: completed implementation; output: all focused tests pass; verification: command output.
- [x] 4.2 [P0] Run `openspec validate fix-realtime-turn-completion-settlement-race --type change --strict --no-interactive`; input: artifacts and implementation notes; output: strict validation passes.
- [x] 4.3 [P1] Run `npm run typecheck` if TypeScript implementation changed; input: final TS patch; output: typecheck passes or unrelated failures documented.
