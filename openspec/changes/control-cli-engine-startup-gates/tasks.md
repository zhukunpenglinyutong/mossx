## 1. Proposal Alignment

- [x] 1.1 Audit current `CLI 验证` UI layout and identify the exact insertion point for `Gemini CLI / OpenCode CLI` tabs and hard disable toggles; output: bounded UI target list in `SettingsView` / section files.
- [x] 1.2 Audit current startup-time OpenCode detect / commands fallback / model refresh call graph; output: cross-layer trigger map for frontend and backend probe paths.

## 2. Backend Contract

- [x] 2.1 Add persisted app settings flags for `geminiEnabled` and `opencodeEnabled`; output: normalized defaults + storage compatibility; verification: settings tests cover missing/legacy values.
- [x] 2.2 Gate engine detection and runtime command surfaces on disabled state; output: disabled Gemini/OpenCode short-circuit contract; verification: Rust tests cover detect + command disabled paths.
- [x] 2.3 Split OpenCode lightweight startup detection from on-demand model loading; output: startup no longer depends on `opencode models`; verification: Rust tests cover light detect vs explicit models fetch.

## 3. Frontend Contract

- [x] 3.1 Extend `CLI 验证` section with `Gemini CLI / OpenCode CLI` tabs and disable toggles; output: toggles in the user-requested area; verification: SettingsView tests cover toggle persistence.
- [x] 3.2 Filter disabled engines out of engine selector / workspace entry / OpenCode prewarm flows; output: entry surfaces close immediately when disabled; verification: hook/component tests cover disabled behavior.
- [x] 3.3 Remove startup-time OpenCode fallback probe churn from `useEngineController`; output: no commands fallback on app boot for disabled or non-active OpenCode; verification: hook tests cover startup detect behavior.

## 4. Validation

- [x] 4.1 Run focused frontend and backend tests for settings, engine detection, and OpenCode startup probes; output: recorded command list and pass results.
- [x] 4.2 Run `npm run lint`, `npm run typecheck`, `npm run test`, and `cargo test --manifest-path src-tauri/Cargo.toml`; output: CI-equivalent pass summary for the touched layers.
- [x] 4.3 If runtime contract fields or `src/services/tauri.ts` mappings change, run `npm run check:runtime-contracts` and `npm run doctor:strict`; output: cross-layer contract pass summary.
- [x] 4.4 Run `openspec validate --all --strict --no-interactive`; output: proposal ready for implementation.
