## 1. Context And Seams

- [x] 1.1 [P0][depends: none][input: RuntimePoolSection.tsx, SettingsView.tsx][output: confirmed data path for workspace inventory into RuntimePoolSection][verify: code review] Identify the minimal workspace fields Runtime Pool bootstrap needs and avoid passing unrelated app-shell state.
- [x] 1.2 [P0][depends: none][input: src/services/tauri.ts, runtime/mod.rs][output: selected bootstrap action: connectWorkspace or ensureRuntimeReady][verify: code review] Confirm which existing Tauri bridge best represents runtime-panel readiness without adding a new side-effecting snapshot API.
- [x] 1.3 [P1][depends: 1.2][input: runtime manager source metadata][output: decision on whether backend source tagging is needed in first PR][verify: proposal/design consistency check] Decide whether `runtime-panel-bootstrap` source tagging is required now or can remain P1 observability.

## 2. Runtime Panel Bootstrap

- [x] 2.1 [P0][depends: 1.1][input: SettingsView.tsx, WorkspaceInfo[]][output: RuntimePoolSection receives minimal workspace inventory][verify: npm run typecheck] Wire workspace inventory from SettingsView to RuntimePoolSection without coupling the section to app-shell orchestration state.
- [x] 2.2 [P0][depends: 1.2,2.1][input: RuntimePoolSection.tsx or new useRuntimePoolBootstrap hook][output: snapshot-first once-per-entry bootstrap state machine][verify: targeted Vitest] Implement bootstrap states for idle, snapshot-loading, bootstrapping, fallback-refreshing, ready, and error; non-empty initial snapshots must render without bootstrap.
- [x] 2.3 [P0][depends: 2.2][input: workspace inventory][output: eligible workspace filter][verify: targeted Vitest] Filter bootstrap candidates to connected workspaces using current `WorkspaceInfo` fields and skip disconnected workspaces.
- [x] 2.4 [P0][depends: 2.2,2.3][input: selected bootstrap action][output: bounded runtime readiness/reconnect attempts only after empty initial snapshot][verify: targeted Vitest] Run bootstrap through the existing runtime acquisition path with an in-flight guard only when the initial snapshot is empty and eligible workspaces exist.
- [x] 2.5 [P0][depends: 2.4][input: getRuntimePoolSnapshot][output: snapshot reload after bootstrap settlement][verify: targeted Vitest] Reload the runtime pool snapshot after bootstrap finishes, including partial failures that should still allow final snapshot refresh.

## 3. Transient UI And Bounded Fallback

- [x] 3.1 [P0][depends: 2.2][input: RuntimePoolSection render state][output: transient loading/bootstrap UI][verify: RuntimePoolSection test] Prevent stable empty copy and misleading all-zero empty state while snapshot loading or bootstrap is in progress.
- [x] 3.2 [P0][depends: 2.5][input: empty snapshot after bootstrap][output: bounded fallback refresh loop][verify: fake timers Vitest] Add short fallback refresh with fixed maximum attempts, stop-on-first-row behavior, and no permanent polling.
- [x] 3.3 [P0][depends: 3.2][input: React effect lifecycle][output: timer cleanup and late-completion guard][verify: unmount test with fake timers] Cancel fallback timers and ignore late async completions when RuntimePoolSection unmounts or the user switches sections.
- [x] 3.4 [P1][depends: 3.1][input: i18n copy][output: optional concise transient copy][verify: typecheck and rendered test text] Add or reuse localized copy for checking/restoring runtime visibility only if existing loading copy is insufficient.

## 4. Frontend Tests

- [x] 4.1 [P0][depends: 2.4][input: RuntimePoolSection.test.tsx][output: bootstrap invokes readiness for eligible connected workspace][verify: npm run test -- RuntimePoolSection] Add coverage proving initial mount can trigger runtime readiness before final snapshot rendering.
- [x] 4.2 [P0][depends: 2.5][input: mocked snapshot sequence][output: empty-first then row-later rendering test][verify: npm run test -- RuntimePoolSection] Add coverage proving an empty first snapshot can settle into visible rows after bootstrap or fallback refresh.
- [x] 4.3 [P0][depends: 3.2][input: fake timers][output: bounded retry-count test][verify: npm run test -- RuntimePoolSection] Add coverage proving fallback stops after max attempts and then shows true empty state.
- [x] 4.4 [P0][depends: 3.3][input: component unmount][output: cleanup regression test][verify: npm run test -- RuntimePoolSection] Add coverage proving unmount cancels timers and avoids late state updates.
- [x] 4.5 [P1][depends: 2.3][input: ineligible workspace fixtures][output: skip test][verify: npm run test -- RuntimePoolSection] Add coverage proving disconnected workspaces do not trigger bootstrap.
- [x] 4.6 [P0][depends: 2.2][input: non-empty initial snapshot fixture][output: compatibility regression test][verify: npm run test -- RuntimePoolSection] Add coverage proving non-empty initial snapshots render immediately and do not call bootstrap, protecting macOS/Linux and existing Windows normal paths.

## 5. Optional Backend Observability

- [x] 5.1 [P1][depends: 1.3,2.4][input: runtime/mod.rs, session_runtime.rs][output: runtime-panel-bootstrap recovery source is recorded when available][verify: cargo test --manifest-path src-tauri/Cargo.toml runtime] If needed, record runtime-panel bootstrap as a diagnosable recovery source without changing runtime acquisition semantics. 2026-04-27 code evidence: frontend calls `connectWorkspace(id, "runtime-panel-bootstrap")`; existing `connect_workspace_core()` / `RuntimeManager` paths persist the recovery source into runtime row diagnostics, so no new backend command or snapshot side effect was needed.
- [x] 5.2 [P1][depends: 5.1][input: RuntimePoolSection row details][output: source visible in row diagnostics][verify: RuntimePoolSection test or manual runtime console smoke] Surface the recovery source through existing row details only if backend source tagging is implemented. 2026-04-27 code evidence: `RuntimePoolSection` renders `lastRecoverySource` / `foregroundWorkSource`, and the focused bootstrap test asserts the `runtime-panel-bootstrap` source is passed to `connectWorkspace`.

## 6. Validation

- [x] 6.1 [P0][depends: 2-4][input: frontend changes][output: targeted tests pass][verify: npm run test -- RuntimePoolSection] Run focused RuntimePoolSection tests.
- [x] 6.2 [P0][depends: 2-4][input: frontend changes][output: TypeScript contract passes][verify: npm run typecheck] Run TypeScript typecheck.
- [x] 6.3 [P0][depends: 2-4][input: frontend changes][output: lint passes][verify: npm run lint] Run lint after implementation.
- [ ] 6.4 [P0][depends: 2-4][input: Windows cold launch][output: manual verification notes][verify: manual] Verify Windows cold launch with `runtimeRestoreThreadsOnlyOnLaunch=true`, immediate Settings > Runtime entry, rapid section switching, and true-empty case.
- [x] 6.5 [P0][depends: 2-4][input: macOS/Linux runtime console][output: compatibility notes][verify: manual or platform-neutral test evidence] Verify macOS/Linux or platform-neutral non-empty snapshot regression: existing rows render without bootstrap delay or reconnect side effect.
- [x] 6.6 [P1][depends: 5.1][input: optional backend changes][output: Rust runtime tests pass][verify: cargo test --manifest-path src-tauri/Cargo.toml runtime] Run Rust runtime tests if backend observability is touched. 2026-04-27 not applicable: this change reuses the existing backend recovery-source plumbing and only validates the frontend source handoff / row rendering path, so no backend observability code was touched in this closeout.
