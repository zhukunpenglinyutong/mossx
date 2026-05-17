## 1. Realtime Path Inventory

- [ ] 1.1 [P0][depends:none][I: realtime adapter/hook path][O: propagation map][V: delta/status/tool paths identified] Map realtime event propagation.
- [ ] 1.2 [P0][depends:none][I: `S-RS-*` fixtures][O: baseline table][V: first-token/jitter/dedup metrics recorded] Capture realtime baseline.
- [ ] 1.3 [P0][depends:1.1][I: propagation map][O: batching insertion point][V: canonical event semantics untouched] Identify safe coalescing boundary.

## 2. Batching Design

- [ ] 2.1 [P0][depends:1][I: first-token path][O: bypass rule][V: first visible delta flushes immediately] Define first-token bypass.
- [ ] 2.2 [P0][depends:1][I: terminal events][O: flush rule][V: completion/error/interrupt flush pending deltas] Define terminal flush.
- [ ] 2.3 [P0][depends:1][I: dedup path][O: dedup invariant][V: dedup identity unaffected] Define dedup guard.

## 3. Implementation

- [ ] 3.1 [P0][depends:2][I: coalescing boundary][O: bounded batcher/coalescer][V: order and content preserved] Implement coalescing.
- [ ] 3.2 [P0][depends:3.1][I: first-token rule][O: tests][V: first delta bypass tested] Add first-token tests.
- [ ] 3.3 [P0][depends:3.1][I: terminal/dedup rules][O: tests][V: terminal flush and dedup stable] Add terminal/dedup tests.

## 4. Validation

- [ ] 4.1 [P0][depends:3][I: touched files][O: type/test evidence][V: `npm run typecheck` + `npm run test`] Run frontend baseline.
- [ ] 4.2 [P0][depends:3][I: realtime fixture][O: extended perf evidence][V: `npm run perf:realtime:extended-baseline`] Run realtime extended baseline.
- [ ] 4.3 [P0][depends:3][I: boundary guard][O: replay guard evidence][V: `npm run perf:realtime:boundary-guard`] Run boundary guard.
- [ ] 4.4 [P1][depends:3][I: test output][O: heavy-noise evidence][V: `npm run check:heavy-test-noise`] Run heavy-noise sentry.
- [ ] 4.5 [P0][depends:4.1-4.4][I: OpenSpec artifacts][O: strict validation][V: `openspec validate optimize-realtime-event-batching --strict --no-interactive`] Validate OpenSpec.

## 5. Completion Review

- [ ] 5.1 [P0][depends:4][I: S-RS before/after][O: outcome summary][V: first-token/jitter/dedup explained] Record metric deltas.
- [ ] 5.2 [P1][depends:5.1][I: residual jitter][O: follow-up backlog][V: remaining realtime bottlenecks listed] List follow-ups.
