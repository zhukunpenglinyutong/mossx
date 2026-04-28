## 1. OpenSpec Boundary And Evidence

- [x] 1.1 [P0][depends: none][verify: openspec validate] Supplement `fix-claude-windows-streaming-latency` proposal to state that frontend long-thread render amplification is a separate follow-up.
- [x] 1.2 [P0][depends: none][verify: openspec validate] Create `fix-claude-long-thread-render-amplification` artifacts for reducer fast path, live tail working set, and compaction UX state coverage.

## 2. Reducer Fast Path

- [x] 2.1 [P0][depends: 1][verify: Vitest reducer] Add a conservative `appendAgentDelta` fast path for existing live assistant text append that skips per-delta `prepareThreadItems(...)`.
- [x] 2.2 [P0][depends: 2.1][verify: Vitest reducer] Keep slow canonical path for new assistant item, legacy/canonical id migration, finalized metadata preservation, and boundary events.
- [x] 2.3 [P0][depends: 2.1][verify: Vitest reducer] Add tests proving consecutive deltas preserve thread semantics while avoiding full derivation on each delta.

## 3. Messages Live Tail Working Set

- [x] 3.1 [P0][depends: 1][verify: Vitest messages] Add a helper that derives a bounded live tail working set plus omitted prefix count and sticky user preservation.
- [x] 3.2 [P0][depends: 3.1][verify: Vitest messages] Update `Messages` so default live collapsed-history presentation transforms use the working set before final render-window slicing.
- [x] 3.3 [P0][depends: 3.2][verify: Vitest messages] Preserve `showAllHistoryItems` full-history behavior, sticky user message, collapsed history count, reasoning visibility, and tool ordering.

## 4. Compaction UX Regression Coverage

- [x] 4.1 [P1][depends: 1][verify: Vitest app/thread/messages] Add tests for `thread/compacting -> thread/compacted -> Context compacted.` state transition.
- [x] 4.2 [P1][depends: 4.1][verify: Vitest app/thread/messages] Add tests for `thread/compactionFailed` clearing compacting state and surfacing recoverable error.

## 5. Validation

- [x] 5.1 [P0][depends: 2-4][verify: targeted tests] Run targeted reducer/messages/stream diagnostics/compaction tests.
- [x] 5.2 [P0][depends: 5.1][verify: quality gates] Run `npm run lint`, `npm run typecheck`, `npm run test`, and `openspec validate fix-claude-long-thread-render-amplification --strict`.
- [ ] 5.3 [P0][depends: 5.2][verify: manual Windows matrix] Notify human to test Windows Claude long thread streaming, prompt overflow compaction, macOS/non-Claude smoke. 2026-04-27 note: Windows native Claude Code ordinary conversation smoke passed on current code, but this does not yet close long-thread stress, prompt-overflow compaction, or macOS/non-Claude smoke for this change.
