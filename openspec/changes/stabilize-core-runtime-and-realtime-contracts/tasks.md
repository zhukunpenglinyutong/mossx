## 1. Realtime Contract

- [x] 1.1 [P0][depends:none][I: `EngineEvent` variants, `useAppServerEvents`, realtime adapters][O: canonical realtime event matrix][V: matrix covers assistant/reasoning/tool/turn/heartbeat/usage/error semantics] Inventory current Rust and frontend realtime event shapes.
- [x] 1.2 [P0][depends:1.1][I: canonical matrix][O: canonical app-server payload fixtures][V: fixtures are platform-neutral and low-noise] Add canonical fixtures for supported visible event semantics.
- [x] 1.3 [P0][depends:1.2][I: canonical fixtures + frontend adapters][O: app-server payload to `NormalizedThreadEvent` tests][V: targeted Vitest tests pass] Add frontend normalization contract tests.
- [x] 1.4 [P0][depends:1.2][I: Rust `EngineEvent` mapping][O: Rust-side mapping coverage where mapping is touched][V: cargo targeted tests pass] Add or update Rust event mapping tests.
- [x] 1.5 [P0][depends:1.3][I: replay harness][O: reducer replay evidence][V: `npm run perf:realtime:boundary-guard`] Verify replay semantics remain stable.
- [x] 1.6 [P1][depends:1.3][I: legacy event aliases][O: compatibility tests][V: legacy aliases still map without becoming new canonical names] Preserve legacy aliases as compatibility inputs.

## 2. Runtime Lifecycle

- [x] 2.1 [P0][depends:none][I: runtime lifecycle states and existing tests][O: runtime scenario test matrix][V: matrix covers acquire/recover/quarantine/retry/replace/ended/lease cleanup] Define the scenario coverage list before behavior changes.
- [x] 2.2 [P0][depends:2.1][I: runtime manager][O: acquire and startup failure scenario tests][V: targeted cargo tests pass] Cover fresh acquire and failed acquire recovery behavior.
- [x] 2.3 [P0][depends:2.1][I: recovery guard][O: quarantine and explicit retry tests][V: automatic retry remains bounded and explicit retry is allowed] Cover recovery budget and quarantine semantics.
- [x] 2.4 [P0][depends:2.1][I: runtime generation][O: replacement and late predecessor tests][V: old runtime events cannot poison successor state] Cover generation isolation.
- [x] 2.5 [P0][depends:2.1][I: foreground work and leases][O: active work protection tests][V: active turn does not become idle/pseudo-stuck incorrectly] Cover runtime-ended and lease cleanup paths.
- [x] 2.6 [P1][depends:2.2,2.3,2.4,2.5][I: runtime test output][O: noise-contained failure evidence][V: `npm run check:heavy-test-noise`] Ensure runtime/realtime tests do not add heavy test noise.

## 3. AppShell Boundary Typing

- [x] 3.1 [P0][depends:none][I: `src/app-shell.tsx`][O: list of hidden section contracts][V: section list identifies workspace, composer/search, runtime/thread boundaries] Identify `ts-nocheck`-masked boundary surfaces.
- [x] 3.2 [P0][depends:3.1][I: workspace section callbacks/state][O: typed workspace boundary][V: typecheck and targeted workspace/app tests pass] Extract or define typed workspace shell boundary.
- [x] 3.3 [P0][depends:3.1][I: composer/search callbacks/state][O: typed composer/search boundary][V: search palette and composer behavior tests pass] Extract or define typed composer/search shell boundary.
- [x] 3.4 [P0][depends:3.1][I: runtime/thread callbacks/state][O: typed runtime/thread boundary][V: thread selection and runtime status behavior remain stable] Extract or define typed runtime/thread shell boundary.
- [x] 3.5 [P1][depends:3.2,3.3,3.4][I: AppShell typecheck failures][O: reduced `ts-nocheck` surface or documented blocker][V: `npm run typecheck`] Reduce `ts-nocheck` scope only when safe.

## 4. Bridge Guardrails

- [x] 4.1 [P1][depends:none][I: touched bridge commands][O: bridge contract checklist][V: checklist records command name, args, response, error, facade export] Add command payload change checklist for touched commands.
- [x] 4.2 [P1][depends:4.1][I: `src/services/tauri.ts` facade][O: import-compatible frontend facade][V: existing callers compile without import migration] Preserve frontend Tauri facade compatibility.
- [x] 4.3 [P1][depends:4.1][I: `command_registry.rs` and touched handlers][O: command registration compatibility][V: `npm run check:runtime-contracts` when bridge touched] Preserve Tauri command registration and response semantics.

## 5. Cross-Platform Guardrails

- [x] 5.1 [P0][depends:1.2,2.1][I: touched fixtures and tests][O: platform-neutral fixture format][V: no hard-coded platform path/newline assumptions] Audit fixtures and tests for Windows/macOS/Linux compatibility.
- [x] 5.2 [P0][depends:2.2][I: touched Rust runtime/process code][O: explicit platform-safe behavior][V: Unix-only logic is cfg-gated or avoided] Audit runtime/process/session code for platform assumptions.
- [x] 5.3 [P1][depends:5.1,5.2][I: CI workflows][O: CI parity note][V: heavy-test and large-file sentries remain valid on ubuntu/macos/windows] Record cross-platform evidence or residual gaps.

## 6. Governance Gates

- [x] 6.1 [P0][depends:1-5][I: all touched frontend code][O: frontend type/test evidence][V: `npm run typecheck` and `npm run test`] Run frontend validation.
- [x] 6.2 [P0][depends:1-5][I: realtime tests][O: replay guard evidence][V: `npm run perf:realtime:boundary-guard`] Run realtime boundary guard.
- [x] 6.3 [P0][depends:2][I: runtime tests][O: runtime lifecycle evidence][V: `cargo test --manifest-path src-tauri/Cargo.toml runtime`] Run Rust runtime tests.
- [x] 6.4 [P1][depends:1-5][I: test output][O: heavy-noise evidence][V: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` and `npm run check:heavy-test-noise` when tests/logging are touched] Run heavy test noise checks when applicable.
- [x] 6.5 [P1][depends:1-5][I: source/style/test file sizes][O: large-file evidence][V: `node --test scripts/check-large-files.test.mjs`, `npm run check:large-files:near-threshold`, `npm run check:large-files:gate` when files grow or are extracted] Run large-file governance checks when applicable.
- [x] 6.6 [P1][depends:6.1-6.5][I: OpenSpec artifacts][O: strict validation evidence][V: `openspec validate stabilize-core-runtime-and-realtime-contracts --strict --no-interactive`] Validate the OpenSpec change.

## 7. Completion Review

- [x] 7.1 [P0][depends:6][I: validation outputs][O: residual risk list][V: skipped commands include concrete reason and impact] Document validation results and residual risk.
- [x] 7.2 [P1][depends:7.1][I: touched boundaries][O: follow-up backlog][V: deferred P1/P2 items are explicitly out of this change] List follow-up changes for memory, Git/worktree, full bridge split, and legacy event alias removal.
- [x] 7.3 [P1][depends:7.1][I: implementation evidence][O: priority calibration note][V: review record distinguishes P0 implementation evidence from P1 guardrail evidence] Confirm P0/P1 scope stayed aligned with this proposal and did not expand into a broad rewrite.
