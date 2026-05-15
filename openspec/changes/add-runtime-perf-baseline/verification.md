# Verification

Generated at: 2026-05-16T01:56:52+08:00

## Passed

- `npm install web-vitals@^4.2.4`
- `npm exec vitest run src/services/perfBaseline/index.test.ts src/services/rendererDiagnostics.test.ts src/test-fixtures/perf/fixtures.test.ts`
- `npm run perf:long-list:baseline`
- `npm run perf:composer:baseline`
- `npm run perf:realtime:extended-baseline`
- `npm run perf:realtime:report -- --quiet`
- `npm run perf:cold-start:baseline`
- `npm run perf:baseline:all`
- `npm run typecheck`
- `npm run lint`
- `npm run perf:realtime:boundary-guard`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:heavy-test-noise`
- `node --test scripts/check-large-files.test.mjs`
- `npm run check:large-files:near-threshold`
- `npm run check:large-files:gate`
- `cargo test --manifest-path src-tauri/Cargo.toml engine::claude::tests_command --lib`
- `openspec validate add-runtime-perf-baseline --strict --no-interactive`
- Review hardening: malformed persisted diagnostics are ignored instead of crashing trim/merge.
- Review hardening: profiler samples are capped at `MAX_PERF_ENTRIES`.
- Review hardening: baseline producer scripts run shared jsdom scenarios sequentially and reject unknown long-list scenarios.
- Review hardening: cold-start baseline records missing bundle assets as unsupported metrics.
- Review hardening: markdown report cells escape pipes and newlines.

## Residual Risk

- The prior `npm run check:large-files:gate` blocker is resolved. The existing
  `src-tauri/src/engine/claude/tests_core.rs` test file was split by moving Claude CLI
  command construction tests to `src-tauri/src/engine/claude/tests_command.rs`;
  `tests_core.rs` is now 2368 lines and the fail-scope scan reports `found=0`.
- Cold-start Tauri webview headless timing is recorded as unsupported on this local `darwin` run.
  Bundle gzip metrics are recorded; `firstPaintMs` and `firstInteractiveMs` are `null` with `unsupportedReason`.

## Scope Adherence

- No diff was introduced in `src/features/threads/hooks/useThreadMessaging.ts`.
- No diff was introduced in `src/features/app/hooks/useAppServerEvents.ts`.
- No diff was introduced in `src/features/composer/components/Composer.tsx`.
- No diff was introduced in `src/features/messages/components/MessagesRows.tsx`.
- This change produced baseline collection/reporting only; it did not implement virtualization, realtime batching, hub splitting, or bundle chunking.

## Follow-Up Proposals

- `openspec/changes/optimize-long-list-virtualization/proposal.md`
- `openspec/changes/optimize-realtime-event-batching/proposal.md`
- `openspec/changes/refactor-mega-hub-split/proposal.md`
- `openspec/changes/optimize-bundle-chunking/proposal.md`
