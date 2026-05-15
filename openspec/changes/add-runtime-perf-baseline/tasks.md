## 1. Foundations

- [ ] 1.1 [P0][depends:none][I: existing `rendererDiagnostics`, `realtimeReplayHarness`, `package.json` deps][O: design lock-in of metric definitions and schemaVersion][V: design.md metric glossary stable, schemaVersion=1.0 declared] Lock metric definitions and JSON schema before any code.
- [ ] 1.2 [P0][depends:1.1][I: `web-vitals@^4.2.4`, Tauri webview capability list][O: dependency added at pinned 4.x minor, feature-detect plan][V: `npm install web-vitals@^4.2.4` succeeds; gzip size diff < 5KB; no 5.x API assumed] Add `web-vitals` dependency with feature-detection plan.
- [ ] 1.3 [P0][depends:1.1][I: env var convention `VITE_*`][O: documented `VITE_ENABLE_PERF_BASELINE` semantics, default off][V: doc cross-references default-off behavior in proposal] Define environment switch contract for perf baseline.

## 2. Collection Layer / 采集层

- [ ] 2.1 [P0][depends:1.2][I: `web-vitals` callbacks][O: `src/services/perfBaseline/index.ts` with `isEnabled` / `reportWebVital` / `reportProfilerSample`][V: targeted Vitest unit tests pass; module < 200 lines] Implement baseline collector facade (no wiring to UI).
- [ ] 2.2 [P0][depends:2.1][I: `RendererDiagnosticEntry` shape][O: extended label `perf.web-vital` and dual bucket trim][V: existing rendererDiagnostics tests pass; perf entries persist to client store under existing key without truncating below `MAX_PERF_ENTRIES`] Extend rendererDiagnostics with perf event label and independent perf cap.
- [ ] 2.3 [P0][depends:2.1][I: React 19 `<Profiler>` API][O: `<PerfProfiler id>` harness component for fixture producers only][V: no imports from `Composer`, `MessagesRows`, `useThreadMessaging`, or `useAppServerEvents`; profiling sample shape matches schema] Implement `<PerfProfiler>` fixture harness component.
- [ ] 2.4 [P1][depends:2.2][I: existing diagnostics buffer logic][O: dual bucket buffer with `MAX_RENDERER_DIAGNOSTICS=200` for non-perf and `MAX_PERF_ENTRIES=1000` for perf][V: non-perf cap unchanged; perf cap honored under 1000+ events] Cap perf-event buffer to avoid memory growth.

## 3. Fixture Layer / fixture 层

- [ ] 3.1 [P0][depends:1.1][I: thread item shape from `src/types.ts`][O: `src/test-fixtures/perf/longListFixture200.ts` + 500/1000][V: each fixture file < 400 lines; fixture loadable in jsdom] Build long-list fixtures.
- [ ] 3.2 [P0][depends:1.1][I: composer input event shape][O: `src/test-fixtures/perf/composerInputFixture50.ts` + 100ime][V: fixture deterministic across runs] Build composer-input fixtures.
- [ ] 3.3 [P0][depends:1.1, existing `realtimeReplayFixture.ts`][I: stream-json first-token slow path + prompt-enhancer dedup events][O: `src/features/threads/contracts/realtimePerfExtendedFixture.ts`][V: fixture replays through existing harness without modification] Build extended realtime fixtures.

## 4. Producer Scripts / 采集脚本

- [ ] 4.1 [P0][depends:2.1, 2.3, 3.1][I: jsdom render harness][O: `scripts/perf-long-list-baseline.ts` with `--scenario=S-LL-{200,500,1000}`][V: writes JSON to `docs/perf/long-list-baseline.json`; script < 400 lines] Implement long-list baseline script.
- [ ] 4.2 [P0][depends:2.1, 2.3, 3.2][I: `@testing-library/react` user-event simulation][O: `scripts/perf-composer-baseline.ts`][V: writes JSON to `docs/perf/composer-baseline.json`] Implement composer-input baseline script.
- [ ] 4.3 [P0][depends:3.3, existing `realtime-perf-report.ts`][I: existing harness][O: extended `--profile=extended` mode plus quiet-compatible output in `realtime-perf-report.ts`][V: writes JSON to `docs/perf/realtime-extended-baseline.json`; existing baseline output unchanged when profile flag omitted; `perf:baseline:all` uses quiet mode] Extend realtime perf report.
- [ ] 4.4 [P0][depends:1.1][I: Vite build output, Tauri webview headless capability][O: `scripts/perf-cold-start-baseline.mjs`][V: writes JSON to `docs/perf/cold-start-baseline.json`; Windows-specific skips documented] Implement cold-start baseline script.

## 5. Aggregation & Reporting / 聚合与报告

- [ ] 5.1 [P0][depends:4.1-4.4][I: 4 JSON fragments][O: `scripts/perf-aggregate.mjs` produces `docs/perf/baseline.json` and mirrors to `docs/perf/history/<version>-baseline.json`][V: aggregate JSON validates against declared schema; latest and versioned archive byte-equal for Section A] Implement aggregator script with dual-path archival.
- [ ] 5.2 [P0][depends:5.1][I: aggregate JSON][O: `docs/perf/baseline.md` and mirrored `docs/perf/history/<version>-baseline.md`][V: markdown contains Section A/B/C as specified in design; first run produces `docs/perf/history/v0.4.18-baseline.md`] Generate markdown report under archival protocol.
- [ ] 5.3 [P1][depends:5.1][I: schema definition][O: `docs/perf/README.md` describing schema and read protocol][V: docs cross-reference proposal and design] Document report schema and consumption protocol.

## 6. NPM Script Wiring / 命令入口

- [ ] 6.1 [P0][depends:4.1][I: `package.json`][O: `perf:long-list:baseline` script][V: `npm run perf:long-list:baseline` exits 0 locally] Wire long-list baseline command.
- [ ] 6.2 [P0][depends:4.2][I: `package.json`][O: `perf:composer:baseline` script][V: `npm run perf:composer:baseline` exits 0] Wire composer baseline command.
- [ ] 6.3 [P0][depends:4.3][I: `package.json`][O: `perf:realtime:extended-baseline` script][V: `npm run perf:realtime:extended-baseline` exits 0; legacy `perf:realtime:report` still works] Wire realtime extended command.
- [ ] 6.4 [P0][depends:4.4][I: `package.json`][O: `perf:cold-start:baseline` script][V: `npm run perf:cold-start:baseline` exits 0 on supported platforms; documents skipped platforms] Wire cold-start command.
- [ ] 6.5 [P0][depends:5.1, 5.2][I: `package.json`][O: `perf:baseline:all` orchestrator script][V: single command runs 6.1-6.4 + aggregate, exits 0] Wire orchestrator command.

## 7. Governance & Cross-Platform Gates

- [ ] 7.1 [P0][depends:2.x, 3.x, 4.x][I: touched scripts and fixtures][O: platform-neutral path / newline / fixture handling][V: scripts execute on ubuntu-latest, macos-latest, windows-latest CI] Audit cross-platform compatibility.
- [ ] 7.2 [P0][depends:6.5][I: new test/script outputs][O: low-noise CI logs][V: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` and `npm run check:heavy-test-noise` pass] Run heavy-test-noise sentry.
- [ ] 7.3 [P0][depends:2.x, 3.x, 4.x, 5.x][I: new source / fixture / script files][O: large-file evidence][V: `node --test scripts/check-large-files.test.mjs`, `npm run check:large-files:near-threshold`, `npm run check:large-files:gate` pass] Run large-file governance sentry.
- [ ] 7.4 [P1][depends:7.1][I: cross-platform run evidence][O: residual gap note in baseline report][V: skipped platforms documented in `docs/perf/baseline.md` Section B and mirrored to `docs/perf/history/v0.4.18-baseline.md`] Record cross-platform residual gaps.

## 8. Validation & Spec Sync

- [ ] 8.1 [P0][depends:1-7][I: all touched frontend code][O: type and test evidence][V: `npm run typecheck` and `npm run test`] Run frontend validation.
- [ ] 8.2 [P0][depends:1-7][I: realtime tests][O: boundary guard evidence][V: `npm run perf:realtime:boundary-guard`] Run realtime boundary guard (must remain green).
- [ ] 8.3 [P0][depends:6.5][I: orchestrator output][O: first baseline report produced][V: `docs/perf/baseline.{md,json}` exist with non-empty Section A; `docs/perf/history/v0.4.18-baseline.{md,json}` mirrored] Produce initial baseline.
- [ ] 8.4 [P0][depends:1-7][I: OpenSpec artifacts][O: strict validation][V: `openspec validate add-runtime-perf-baseline --strict --no-interactive`] Validate OpenSpec change.
- [ ] 8.5 [P1][depends:8.1-8.4][I: capability `runtime-perf-baseline`][O: new spec ready for sync after archive][V: spec delta passes validation independently] Confirm capability spec delta is internally consistent.

## 9. Follow-Up Backlog (Out of Scope)

- [ ] 9.1 [P2][depends:8.3][I: baseline data][O: follow-up change `optimize-long-list-virtualization` proposal][V: proposal references concrete `S-LL-*` rows] Draft follow-up: long-list virtualization.
- [ ] 9.2 [P2][depends:8.3][I: baseline data][O: follow-up change `optimize-realtime-event-batching` proposal][V: proposal references concrete `S-RS-*` rows] Draft follow-up: realtime event batching.
- [ ] 9.3 [P2][depends:8.3][I: baseline data][O: follow-up change `refactor-mega-hub-split` proposal][V: proposal references commit-duration hot spots] Draft follow-up: mega-hub split.
- [ ] 9.4 [P2][depends:8.3][I: baseline data][O: follow-up change `optimize-bundle-chunking` proposal][V: proposal references `S-CS-COLD` bundle size rows] Draft follow-up: bundle chunking.

## 10. Completion Review

- [ ] 10.1 [P0][depends:8][I: validation outputs][O: residual risk list][V: skipped commands include concrete reason and impact] Document validation results and residual risk.
- [ ] 10.2 [P1][depends:10.1][I: P0/P1 boundary in this change][O: confirmed scope adherence note][V: review record distinguishes baseline production from optimization implementation] Confirm scope did not drift into optimization implementation.
