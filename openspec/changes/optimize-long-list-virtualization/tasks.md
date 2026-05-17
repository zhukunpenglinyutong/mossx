## 1. Rendering Inventory

- [ ] 1.1 [P0][depends:none][I: `MessagesRows.tsx` / message row components][O: row rendering map][V: row identity/order path documented] Inventory row rendering path.
- [ ] 1.2 [P0][depends:none][I: scroll restoration tests][O: scroll behavior baseline][V: initial/restored/live scroll semantics listed] Inventory scroll semantics.
- [ ] 1.3 [P0][depends:none][I: `docs/perf/history/v0.4.18-baseline.md`][O: S-LL baseline table][V: 200/500/1000 metrics recorded] Capture long-list baseline.

## 2. Virtualization Design

- [ ] 2.1 [P0][depends:1][I: row + scroll inventory][O: virtualization boundary plan][V: reducer/state untouched] Define viewport projection boundary.
- [ ] 2.2 [P0][depends:2.1][I: `@tanstack/react-virtual`][O: adapter design][V: no custom virtual scroller] Plan virtualizer integration.
- [ ] 2.3 [P0][depends:2.1][I: active streaming row][O: stability invariant][V: streaming row behavior explicitly protected] Define streaming row guard.

## 3. Implementation

- [ ] 3.1 [P0][depends:2][I: boundary plan][O: virtualized row renderer][V: message identity/order preserved] Implement virtualization.
- [ ] 3.2 [P0][depends:3.1][I: scroll semantics][O: restoration tests][V: restored and live scroll behavior covered] Add/update tests.
- [ ] 3.3 [P1][depends:3.1][I: S-LL-1000][O: browser scroll verification][V: browser evidence or unsupported rationale] Add browser-level scroll gate.

## 4. Validation

- [ ] 4.1 [P0][depends:3][I: touched files][O: type/test evidence][V: `npm run typecheck` + `npm run test`] Run frontend baseline.
- [ ] 4.2 [P0][depends:3][I: long-list scenario][O: perf baseline][V: `npm run perf:long-list:baseline`] Run long-list baseline.
- [ ] 4.3 [P0][depends:4.2][I: perf outputs][O: aggregate baseline][V: `npm run perf:baseline:aggregate`] Aggregate perf baseline.
- [ ] 4.4 [P1][depends:3][I: source sizes][O: large-file evidence][V: `npm run check:large-files:gate`] Run large-file gate.
- [ ] 4.5 [P0][depends:4.1-4.4][I: OpenSpec artifacts][O: strict validation][V: `openspec validate optimize-long-list-virtualization --strict --no-interactive`] Validate OpenSpec.

## 5. Completion Review

- [ ] 5.1 [P0][depends:4][I: S-LL before/after][O: outcome summary][V: 1000-row behavior explained] Record metric deltas.
- [ ] 5.2 [P1][depends:5.1][I: residual scroll limitations][O: follow-up backlog][V: unsupported browser gaps listed] List follow-ups.
