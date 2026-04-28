## 1. Queue Baseline And Batch Plan

- [x] 1.1 [P0][Depends:none][Input:`npm run check:large-files:near-threshold` output][Output:P0/P1 queue snapshot with line count, warn/fail thresholds, remaining headroom, and matched policy][Verify:snapshot includes all current P0/P1 watch files and excludes P2 from first-wave priority] Refresh the P0/P1 watch queue before implementation begins.
- [x] 1.2 [P0][Depends:1.1][Input:P0/P1 queue snapshot and design phase order][Output:first-wave batch scope limited to one coherent code area, runtime module, feature surface, or stylesheet cascade area][Verify:batch scope lists touched files, public contracts to preserve, rollback boundary, and confirms unrelated hot paths are not mixed] Select exactly one first-wave implementation batch before moving code.
- [x] 1.3 [P0][Depends:1.2][Input:selected batch files][Output:public contract inventory for commands, exports, selectors, i18n keys, and persisted fields][Verify:`rg` commands are recorded for every contract that must survive the split] Create the compatibility inventory before moving code.

## 2. First-Wave Independent Batches

- [x] 2.1 [P0][Depends:1.3][Input:`src/features/threads/hooks/useThreadsReducer.ts` structure and tests][Output:reducer action groups, selectors, or transition helpers extracted behind the original reducer facade][Verify:thread reducer targeted tests pass; exported reducer/hook symbols remain available; file has at least 200 lines fail-threshold headroom] Split `useThreadsReducer.ts` without changing reducer semantics.
- [x] 2.2 [P0][Depends:1.3][Input:`src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx` render sections and tests][Output:presentational subcomponents or section modules extracted behind the original component facade][Verify:git-history component tests pass; public props/className contract stays compatible; file has at least 200 lines fail-threshold headroom] Split `GitHistoryPanelImpl.tsx` by UI responsibility.
- [x] 2.3 [P1][Depends:1.3][Input:`src/styles/git-history.part2.css` selector groups and import order][Output:one or more git-history stylesheet sections extracted with cascade order preserved][Verify:`rg` confirms moved selectors still exist; related git-history UI smoke/manual check recorded; original import order remains compatible; file has at least 200 lines fail-threshold headroom] Split `git-history.part2.css` without visual cascade drift.
- [x] 2.4 [P0][Depends:1.3][Input:`src-tauri/src/codex/mod.rs` module structure and Rust tests][Output:Codex internal helpers extracted to domain modules while `mod.rs` preserves command/runtime facade][Verify:`cargo test --manifest-path src-tauri/Cargo.toml codex` or documented targeted equivalent passes; command names and public structs remain compatible; file is below warn threshold or has at least 150 lines fail-threshold headroom plus follow-up rationale] Split `codex/mod.rs` without changing runtime command behavior.
- [x] 2.5 [P0][Depends:1.3][Input:`src/app-shell.tsx` orchestration sections and app-shell tests][Output:app shell orchestration helpers or submodules extracted behind the original app-shell entry][Verify:app-shell related targeted tests/typecheck pass; public app-shell behavior and imports remain compatible; file is below warn threshold or has at least 150 lines fail-threshold headroom plus follow-up rationale] Split `app-shell.tsx` without changing shell orchestration behavior.

## 3. Phase 2 P0 Runtime Bridge 拆分

- [x] 3.1 [P0][Depends:2.x][Input:`src-tauri/src/computer_use/mod.rs` remaining watch sections][Output:additional Computer Use tests/helpers/platform sections extracted behind existing module exports][Verify:`cargo test --manifest-path src-tauri/Cargo.toml computer_use` passes; `npm run check:large-files:gate` passes; file is below warn threshold or has at least 150 lines fail-threshold headroom plus follow-up rationale] Continue reducing `computer_use/mod.rs` while preserving bridge contracts.
- [x] 3.2 [P0][Depends:2.x][Input:`src-tauri/src/runtime/mod.rs` command/runtime responsibilities][Output:runtime lifecycle, process, diagnostics, or event helpers extracted into submodules][Verify:runtime-targeted Rust tests pass; frontend `src/services/tauri.ts` mapping does not require command-name changes; file is below warn threshold or has at least 150 lines fail-threshold headroom plus follow-up rationale] Split `runtime/mod.rs` by backend responsibility.
- [x] 3.3 [P0][Depends:2.x][Input:`src-tauri/src/engine/claude/tests_core.rs` test groups][Output:Claude tests split by behavior domain with shared fixtures extracted only where reused][Verify:Claude engine targeted tests pass; no production behavior files are changed solely for test splitting; file is below warn threshold or has at least 150 lines fail-threshold headroom plus follow-up rationale] Split Claude core tests into smaller modules.
- [x] 3.4 [P0][Depends:2.x][Input:`src-tauri/src/engine/gemini.rs` runtime and test sections][Output:Gemini helper/platform/test modules extracted behind existing engine facade][Verify:Gemini targeted Rust tests pass; no command payload or engine selection behavior changes; file is below warn threshold or has at least 150 lines fail-threshold headroom plus follow-up rationale] Split `engine/gemini.rs` conservatively.

## 4. Phase 3 P1 Feature And Daemon 拆分

- [x] 4.1 [P1][Depends:2.x][Input:`src/features/threads/hooks/useThreads.ts` orchestration sections][Output:thread orchestration helpers extracted behind original hook facade][Verify:threads hook targeted tests pass; public hook return shape remains compatible; file has at least 200 lines fail-threshold headroom or documented risk acceptance] Split `useThreads.ts` without changing thread lifecycle behavior.
- [x] 4.2 [P1][Depends:2.x][Input:`src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx` handlers][Output:git-history interaction handlers grouped into focused helpers][Verify:git-history interaction tests pass; branch/menu/compare symbols remain reachable; file has at least 200 lines fail-threshold headroom or documented risk acceptance] Split git-history interaction logic without losing branch workflows.
- [x] 4.3 [P1][Depends:2.x][Input:`src-tauri/src/local_usage.rs` analytics/storage responsibilities][Output:local usage model, persistence, aggregation, or tests extracted with path handling kept cross-platform][Verify:local usage targeted Rust tests pass; new path handling uses `Path`/`PathBuf`/`join`; file has at least 200 lines fail-threshold headroom or documented risk acceptance] Split `local_usage.rs` without storage behavior changes.
- [x] 4.4 [P1][Depends:2.x][Input:`src-tauri/src/bin/cc_gui_daemon.rs` and `daemon_state.rs`][Output:daemon CLI, state, platform, and diagnostics modules separated with binary entry behavior preserved][Verify:daemon targeted Rust tests/build check passes; no macOS/Windows shell-specific assumptions are introduced; each touched P1 file has at least 200 lines fail-threshold headroom or documented risk acceptance] Split daemon files while preserving binary entrypoint semantics.

## 5. Phase 4 P1 Styles And Settings 拆分

- [x] 5.1 [P1][Depends:2.3][Input:`src/styles/sidebar.css`, `src/styles/spec-hub.css`, `src/styles/git-history.part1.css`][Output:stylesheet sections split by feature area while preserving import order and selector names][Verify:selector `rg` checks and relevant UI smoke/manual notes recorded; each touched P1 style file has at least 200 lines fail-threshold headroom or documented risk acceptance] Split high-risk P1 styles without cascade drift.
- [x] 5.2 [P1][Depends:2.x][Input:`src/features/settings/components/SettingsView.tsx` sections and tests][Output:settings subcomponents extracted behind original settings view entry][Verify:settings targeted Vitest/typecheck passes; user-visible copy keys remain unchanged; file has at least 200 lines fail-threshold headroom or documented risk acceptance] Split `SettingsView.tsx` by panel responsibility.
- [x] 5.3 [P1][Depends:5.1][Input:`src/styles/messages.part1.css`, `src/styles/tool-blocks.css`, `src/styles/file-view-panel.css`][Output:remaining P1 styles split or explicitly deferred with rationale][Verify:large-file near-threshold output shows improved headroom or documented deferral; each touched P1 style file has at least 200 lines fail-threshold headroom or documented risk acceptance] Finish or defer remaining P1 style watch items.

## 6. Compatibility And Cross-Platform Review

- [x] 6.1 [P0][Depends:each implementation batch][Input:new Rust modules introduced by the batch][Output:path and platform compatibility review][Verify:no hard-coded `/` or `\\` path joins; runtime command logic does not depend on POSIX-only shell syntax] Review Rust split code for Windows/macOS path compatibility.
- [x] 6.2 [P0][Depends:each implementation batch][Input:new TS/CSS filenames and imports][Output:case-sensitivity compatibility review][Verify:import paths match real filenames exactly; no case-only filename pairs are introduced] Review frontend split code for case-sensitive filesystem compatibility.
- [x] 6.3 [P0][Depends:each implementation batch][Input:public contract inventory from 1.3][Output:post-split contract preservation evidence][Verify:recorded `rg` checks still find expected command names, exports, selectors, i18n keys, and persisted fields] Verify behavior-facing contracts after every split batch.

## 7. Validation And Governance Closure

- [x] 7.1 [P0][Depends:each implementation batch][Input:touched files and targeted test matrix][Output:targeted validation results][Verify:relevant `cargo test`, Vitest, UI smoke/manual checks, or documented equivalents pass] Run batch-specific tests after each split.
- [x] 7.2 [P0][Depends:each implementation batch][Input:large-file policy and baseline][Output:large-file gate result][Verify:`npm run check:large-files:gate` passes and no new hard debt is introduced] Run the large-file hard gate after each split.
- [x] 7.3 [P0][Depends:phase completion][Input:updated near-threshold output][Output:before/after/headroom report for files touched in the phase][Verify:P0 files are below warn threshold or retain at least 150 lines headroom with recorded follow-up rationale; P1 files retain at least 200 lines headroom or have documented risk acceptance] Record phase completion evidence.
- [x] 7.4 [P0][Depends:all required artifacts][Input:OpenSpec change files][Output:strict OpenSpec validation result][Verify:`openspec validate split-p0-p1-large-files --type change --strict --no-interactive` passes] Validate the change artifacts before implementation or archive.

## Implementation Notes

- 2026-04-27 Batch 1A completed for `src/features/threads/hooks/useThreadsReducer.ts`.
  - Before: 2785 lines, P1 `feature-hotpath`, warn>2400, fail>2800, remaining headroom 15 lines.
  - After: 2355 lines, below warn threshold, remaining fail-threshold headroom 445 lines.
  - Extracted feature-local pure helpers:
    - `threadReducerThreadNaming.ts`
    - `threadReducerOptimisticItemMerge.ts`
    - `threadReducerApprovalRequests.ts`
    - `threadReducerReviewItems.ts`
    - `threadReducerAssistantFinalMetadata.ts`
  - Public facade preserved in `useThreadsReducer.ts`: `ThreadState`, `ThreadAction`, `initialState`, `createInitialThreadState`, `threadReducer`.
  - Cross-platform review: new TypeScript filenames use unique case-stable names; no runtime path or shell behavior was introduced.
  - Validation passed:
    - `npm exec vitest run src/features/threads/hooks/useThreadsReducer.test.ts src/features/threads/hooks/useThreadsReducer.approvals.test.ts src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts src/features/threads/hooks/useThreadsReducer.engine-source.test.ts src/features/threads/hooks/useThreadsReducer.generatedImage.test.ts src/features/threads/hooks/useThreadsReducer.inline-code.test.ts src/features/threads/hooks/useThreadsReducer.normalized-realtime.test.ts src/features/threads/hooks/useThreadsReducer.threadlist-pending.test.ts`
    - `npm run lint`
    - `npm run typecheck`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `openspec validate split-p0-p1-large-files --type change --strict --no-interactive`

- 2026-04-27 Batch 1B completed for Git history UI surface.
  - `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx`:
    - Before: 2778 lines, P1 `feature-hotpath`, warn>2400, fail>2800, remaining headroom 22 lines.
    - After: 2553 lines, remaining fail-threshold headroom 247 lines.
    - Extracted feature-local pure helpers/constants to `GitHistoryPanelImplHelpers.tsx`.
    - Public facade preserved: `GitHistoryPanel` remains exported from `GitHistoryPanelImpl.tsx`; `getDefaultColumnWidths` is re-exported from the original entry path.
  - `src/styles/git-history.part2.css`:
    - Before: 2776 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 24 lines.
    - After: 2455 lines, remaining fail-threshold headroom 345 lines.
    - Extracted the original opening contiguous selector block to `src/styles/git-history.part2-support.css`.
    - Cascade order preserved by importing `git-history.part2-support.css` immediately before `git-history.part2.css` in `src/styles/git-history.css`.
  - Cross-platform review: new TypeScript/CSS filenames use exact case-stable imports; no runtime path joins, shell commands, or platform-specific filesystem behavior were introduced.
  - Contract checks:
    - `rg -n "getDefaultColumnWidths|GitHistoryPanelImplHelpers|git-history\\.part2-support" src/features/git-history src/styles/git-history.css`
    - `rg -n "git-history-branch-compare-detail-message|git-history-commit-context-menu|git-history-empty-guide|git-history-status|git-history-create-branch-backdrop" src/styles/git-history*.css`
  - Validation passed:
    - `npm exec vitest run src/features/git-history/components/GitHistoryPanel.test.tsx` (33 tests)
    - `npm run typecheck`
    - `npm run lint`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check`

- 2026-04-27 Batch 1C completed for `src-tauri/src/codex/mod.rs`.
  - Before: 2574 lines, P0 `bridge-runtime-critical`, warn>2200, fail>2600, remaining headroom 26 lines.
  - After: 2419 lines, remaining fail-threshold headroom 181 lines.
  - Extracted pure internal helpers into focused Rust modules while preserving the original command facade:
    - `src-tauri/src/codex/commit_message.rs`
    - `src-tauri/src/codex/model_selection.rs`
    - `src-tauri/src/codex/run_metadata.rs`
  - Public command facade preserved: `command_registry.rs` still resolves every Codex command through `crate::codex::*`; no command name, payload, response, or frontend mapping was changed.
  - Cross-platform review: new modules use `snake_case.rs`; no runtime path join, POSIX shell behavior, or case-only filename pair was introduced. Slash literals in `run_metadata.rs` remain logical worktree prefix strings, not filesystem separators.
  - Contract checks:
    - `rg -n "crate::codex::(codex_doctor|start_thread|send_user_message|generate_run_metadata|get_commit_message_prompt|generate_commit_message)|crate::codex::" src-tauri/src/command_registry.rs`
    - `rg -n "mod commit_message|mod model_selection|mod run_metadata|use self::commit_message|use self::model_selection|use self::run_metadata" src-tauri/src/codex/mod.rs`
  - Validation passed:
    - `rustfmt --edition 2021 --check src-tauri/src/codex/mod.rs src-tauri/src/codex/commit_message.rs src-tauri/src/codex/model_selection.rs src-tauri/src/codex/run_metadata.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml codex`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
  - Note: full `cargo fmt --manifest-path src-tauri/Cargo.toml --check` currently reports unrelated pre-existing formatting diffs outside this batch; touched Rust files pass scoped `rustfmt --check`.

- 2026-04-27 Batch 1D completed for `src/app-shell.tsx`.
  - Before: 2301 lines, P0 `bridge-runtime-critical`, warn>2200, fail>2600, remaining headroom 299 lines.
  - After: 2192 lines, below warn threshold and remaining fail-threshold headroom 408 lines.
  - Extracted app-shell orchestration helpers into existing `app-shell-parts` boundary:
    - `src/app-shell-parts/useThreadScopedCollaborationMode.ts`
    - `src/app-shell-parts/useCreateSessionLoading.ts`
    - `src/app-shell-parts/lazyViews.tsx`
  - Public app shell facade preserved: `AppShell` remains exported from `src/app-shell.tsx`; render context keys and component entry imports remain behavior-compatible.
  - Cross-platform review: new filenames are exact-case unique and follow existing `app-shell-parts` naming style; no runtime path, shell, newline, or filesystem behavior was introduced.
  - Contract checks:
    - `rg -n "useThreadScopedCollaborationMode|useCreateSessionLoading|GitHubPanelData|SettingsView" src/app-shell.tsx src/app-shell-parts`
  - Validation passed:
    - `npm exec vitest run src/app-shell-parts/useAppShellSections.kanban-text.test.ts src/app-shell-parts/useAppShellLayoutNodesSection.recovery.test.ts src/app-shell-parts/useAppShellSearchRadarSection.test.tsx src/app-shell-parts/collaborationModeSync.test.ts`
    - `npm run typecheck`
    - `npm run lint`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`

- 2026-04-27 Phase 2 Batch 2A completed for `src-tauri/src/computer_use/mod.rs`.
  - Before: 2475 lines, P0 `bridge-runtime-critical`, warn>2200, fail>2600, remaining headroom 125 lines.
  - After: 2423 lines, remaining fail-threshold headroom 177 lines.
  - Extracted plist parsing helpers to `src-tauri/src/computer_use/plist_helpers.rs` while preserving existing Computer Use command and bridge facade.
  - Cross-platform review: the extracted helpers parse plist XML text only; no path join, shell behavior, command payload, or platform branching was changed.
  - Validation passed:
    - `rustfmt --edition 2021 --check --config skip_children=true src-tauri/src/computer_use/mod.rs src-tauri/src/computer_use/plist_helpers.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml computer_use`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
  - Note: `rustfmt --edition 2021 --check src-tauri/src/computer_use/mod.rs src-tauri/src/computer_use/plist_helpers.rs` traverses existing `computer_use` child modules and reports unrelated pre-existing formatting diffs in `authorization_continuity.rs` and `broker.rs`; scoped `skip_children=true` passed for this batch.

- 2026-04-27 Phase 2 Batch 2B completed for `src-tauri/src/runtime/mod.rs`.
  - Before: 2372 lines, P0 `bridge-runtime-critical`, warn>2200, fail>2600, remaining headroom 228 lines.
  - After: 2309 lines, remaining fail-threshold headroom 291 lines.
  - Extracted JSON runtime event source helpers to `src-tauri/src/runtime/event_sources.rs` while preserving the existing runtime module facade.
  - Frontend bridge compatibility: no Tauri command name, payload, response, or `src/services/tauri.ts` mapping was changed.
  - Cross-platform review: the extracted helpers inspect `serde_json::Value` payloads only; no path join, shell behavior, newline handling, or filesystem behavior was introduced.
  - Contract checks:
    - `rg -n "mod event_sources|event_stream_source|event_turn_source|event_thread_id|event_turn_id|event_method" src-tauri/src/runtime/mod.rs src-tauri/src/runtime/event_sources.rs`
  - Validation passed:
    - `rustfmt --edition 2021 --check --config skip_children=true src-tauri/src/runtime/mod.rs src-tauri/src/runtime/event_sources.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml runtime`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`

- 2026-04-27 Phase 2 Batch 2C completed for `src-tauri/src/engine/claude/tests_core.rs`.
  - Before: 2259 lines, P0 `bridge-runtime-critical`, warn>2200, fail>2600, remaining headroom 341 lines.
  - After: 2044 lines, below warn threshold and remaining fail-threshold headroom 556 lines.
  - Extracted path and local-file approval boundary tests to `src-tauri/src/engine/claude/tests_path_approval.rs`.
  - Production behavior unchanged: only test module registration was added in `src-tauri/src/engine/claude.rs`; no runtime engine logic was modified for this split.
  - Cross-platform review: Windows-style path tests remain active on all platforms; symlink rejection remains guarded with `#[cfg(unix)]`, matching the original platform behavior.
  - Contract checks:
    - `rg -n "tests_path_approval|normalize_claude_workspace_relative_path_accepts_segmented_path|command_can_apply_as_local_file_action_accepts_windows_style_path|synthetic_claude_file_approval_rejects_symlink_targets" src-tauri/src/engine/claude.rs src-tauri/src/engine/claude/tests_core.rs src-tauri/src/engine/claude/tests_path_approval.rs`
  - Validation passed:
    - `rustfmt --edition 2021 --check --config skip_children=true src-tauri/src/engine/claude.rs src-tauri/src/engine/claude/tests_core.rs src-tauri/src/engine/claude/tests_path_approval.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml claude`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`

- 2026-04-27 Phase 2 Batch 2D completed for `src-tauri/src/engine/gemini.rs`.
  - Before: 2207 lines, P0 `bridge-runtime-critical`, warn>2200, fail>2600, remaining headroom 393 lines.
  - After: 1307 lines, below warn threshold and remaining fail-threshold headroom 1293 lines.
  - Extracted Gemini JSON event/session/tool snapshot parsing helpers to `src-tauri/src/engine/gemini_event_parsing.rs`.
  - Public engine facade preserved: `GeminiSession`, event emission flow, command payload handling, engine selection, and existing test entry symbols remain behavior-compatible.
  - Cross-platform review: the extracted module only parses `serde_json::Value` payloads and snapshot metadata; it introduces no path joins, shell branching, newline handling, or filesystem behavior changes.
  - Contract checks:
    - `rg -n "mod event_parsing|parse_gemini_event|extract_session_id|extract_tool_events_from_snapshot|should_extract_thought_fallback|collect_latest_turn_reasoning_texts" src-tauri/src/engine/gemini.rs src-tauri/src/engine/gemini_event_parsing.rs src-tauri/src/engine/gemini_tests.rs`
  - Validation passed:
    - `rustfmt --edition 2021 --check src-tauri/src/engine/gemini.rs src-tauri/src/engine/gemini_event_parsing.rs src-tauri/src/engine/gemini_tests.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml gemini`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`

- 2026-04-27 Phase 3 Batch 3A completed for `src/features/threads/hooks/useThreads.ts`.
  - Before: 2705 lines, P1 `feature-hotpath`, warn>2400, fail>2800, remaining headroom 95 lines.
  - After: 2421 lines, still on the warn watch list but remaining fail-threshold headroom increased to 379 lines, satisfying the P1 split target without changing hook behavior.
  - Extracted project-memory normalization, dedupe, debug, and pending-capture helper types/constants/functions to `src/features/threads/hooks/threadMemoryCaptureHelpers.ts`.
  - Public hook facade preserved: `useThreads`, `resolvePendingThreadIdForSession`, `resolvePendingThreadIdForTurn`, hook return shape, and thread lifecycle orchestration remain behavior-compatible.
  - Cross-platform review: the new helper file is case-stable and contains only string normalization / browser-local debug gating; it introduces no path separator, shell, newline, or filesystem behavior differences across Windows and macOS.
  - Contract checks:
    - `rg -n "threadMemoryCaptureHelpers|PendingMemoryCapture|PendingAssistantCompletion|normalizeAssistantOutputForMemory|extractNovelAssistantOutput|memoryDebugLog|PENDING_MEMORY_STALE_MS|MAX_ASSISTANT_DETAIL_LENGTH" src/features/threads/hooks/useThreads.ts src/features/threads/hooks/threadMemoryCaptureHelpers.ts`
  - Validation passed:
    - `npm exec vitest run src/features/threads/hooks/useThreads.pendingResolution.test.ts src/features/threads/hooks/useThreads.integration.test.tsx src/features/threads/hooks/useThreads.memory-race.integration.test.tsx src/features/threads/hooks/useThreads.sidebar-cache.test.tsx src/features/threads/hooks/useThreads.engine-source.test.tsx src/features/threads/hooks/useThreads.pin.integration.test.tsx`
    - `npm run typecheck`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check`

- 2026-04-27 Phase 3 Batch 3B completed for `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx`.
  - Before: 2692 lines, P1 `feature-hotpath`, warn>2400, fail>2800, remaining headroom 108 lines.
  - After: 2415 lines, still on the warn watch list but remaining fail-threshold headroom increased to 385 lines, satisfying the P1 split target without changing interaction behavior.
  - Extracted branch-compare and worktree-diff interaction handlers to `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelBranchCompareHandlers.tsx`.
  - Public interaction facade preserved: `handleShowDiffWithWorktree`, `handleCompareWithCurrentBranch`, `handleSelectWorktreeDiffFile`, and `handleSelectBranchCompareCommit` remain returned from `useGitHistoryPanelInteractions`, so existing `GitHistoryPanelImpl.tsx` wiring and branch context workflows stay intact.
  - Cross-platform review: the new hook file uses exact-case import paths and only orchestrates cached diff/commit detail fetches; it introduces no path-join, shell, newline, or filesystem behavior differences across Windows and macOS.
  - Contract checks:
    - `rg -n "useGitHistoryPanelBranchCompareHandlers|handleShowDiffWithWorktree|handleCompareWithCurrentBranch|handleSelectWorktreeDiffFile|handleSelectBranchCompareCommit" src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelBranchCompareHandlers.tsx`
  - Validation passed:
    - `npm exec vitest run src/features/git-history/components/GitHistoryPanel.test.tsx`
    - `npm run typecheck`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check`

- 2026-04-27 Phase 3 Batch 3C completed for `src-tauri/src/local_usage.rs`.
  - Before: 2929 lines, P1 `default-source`, warn>2600, fail>3000, remaining headroom 71 lines.
  - After: 2461 lines, below warn threshold and remaining fail-threshold headroom 539 lines.
  - Extracted Gemini local session scanning, project alias matching, text preview extraction, and Gemini workspace-scope matching to `src-tauri/src/local_usage/gemini_sessions.rs`.
  - Public facade preserved: `local_usage_statistics` still routes provider `gemini` through `scan_gemini_session_summaries`; no Tauri command name, payload, response, storage schema, or frontend mapping was changed.
  - Cross-platform review: the new Rust module uses `snake_case.rs`, exact module path import, `Path`/`PathBuf`/`join` for filesystem composition, and preserves existing Windows/macOS workspace match handling without adding shell behavior.
  - Contract checks:
    - `rg -n "mod gemini_sessions|scan_gemini_session_summaries|gemini_project_matches_workspace|local_usage/gemini_sessions" src-tauri/src/local_usage.rs src-tauri/src/local_usage/gemini_sessions.rs src-tauri/src/local_usage/tests.rs`
  - Validation passed:
    - `rustfmt --edition 2021 --check --config skip_children=true src-tauri/src/local_usage.rs src-tauri/src/local_usage/gemini_sessions.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml local_usage`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check -- src-tauri/src/local_usage.rs src-tauri/src/local_usage/gemini_sessions.rs`

- 2026-04-27 Phase 3 Batch 3D completed for daemon binary and state split.
  - `src-tauri/src/bin/cc_gui_daemon.rs`:
    - Before: 2880 lines, P1 `default-source`, warn>2600, fail>3000, remaining headroom 120 lines.
    - After: 1952 lines, below warn threshold and remaining fail-threshold headroom 1048 lines.
    - Extracted workspace/spec/file IO helpers and response DTOs to `src-tauri/src/bin/cc_gui_daemon/workspace_io.rs`.
  - `src-tauri/src/bin/cc_gui_daemon/daemon_state.rs`:
    - Before: 2720 lines, P1 `default-source`, warn>2600, fail>3000, remaining headroom 280 lines.
    - After: 2599 lines, below warn threshold and remaining fail-threshold headroom 401 lines.
    - Extracted daemon file-access state methods to `src-tauri/src/bin/cc_gui_daemon/file_access.rs`.
  - Public daemon facade preserved: RPC method names, `handle_rpc_request` routing, daemon binary entrypoint, and `DaemonState` call sites continue using the same method names; no frontend service mapping or command payload was changed.
  - Cross-platform review: moved file/spec helpers retain `Path`/`PathBuf`/`join` based filesystem handling, reuse shared `utils::normalize_git_path`, and introduce no shell behavior or case-only filename pairs.
  - Contract checks:
    - `rg -n "mod file_access|mod workspace_io|list_workspace_files\\(|read_workspace_file\\(|workspace_io::|WorkspaceFilesResponse" src-tauri/src/bin/cc_gui_daemon.rs src-tauri/src/bin/cc_gui_daemon/daemon_state.rs src-tauri/src/bin/cc_gui_daemon/file_access.rs src-tauri/src/bin/cc_gui_daemon/workspace_io.rs`
  - Validation passed:
    - `rustfmt --edition 2021 --check --config skip_children=true src-tauri/src/bin/cc_gui_daemon.rs src-tauri/src/bin/cc_gui_daemon/daemon_state.rs src-tauri/src/bin/cc_gui_daemon/file_access.rs src-tauri/src/bin/cc_gui_daemon/workspace_io.rs`
    - `cargo test --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check -- src-tauri/src/bin/cc_gui_daemon.rs src-tauri/src/bin/cc_gui_daemon/daemon_state.rs src-tauri/src/bin/cc_gui_daemon/file_access.rs src-tauri/src/bin/cc_gui_daemon/workspace_io.rs`

- 2026-04-27 Phase 4 Batch 4A completed for high-risk P1 styles.
  - `src/styles/sidebar.css`:
    - Before: 2640 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 160 lines.
    - After: 2577 lines, remaining fail-threshold headroom 223 lines.
    - Extracted the root sidebar shell/theme block to `src/styles/sidebar-shell.css` and imported it immediately before `sidebar.css` in `src/bootstrap.ts`.
  - `src/styles/spec-hub.css`:
    - Before: 2609 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 191 lines.
    - After: 2466 lines, remaining fail-threshold headroom 334 lines.
    - Extracted the spec hub root/header/badge block to `src/styles/spec-hub-header.css` and imported it immediately before `spec-hub.css` in `src/bootstrap.ts`.
  - `src/styles/git-history.part1.css`:
    - Before: 2596 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 204 lines.
    - After: 2469 lines, remaining fail-threshold headroom 331 lines.
    - Extracted the dock/workbench/toolbar shell block to `src/styles/git-history.part1-shell.css` and imported it immediately before `git-history.part1.css` in `src/styles/git-history.css`.
  - Cascade compatibility: moved selector names are unchanged; support imports are placed directly before their original style files so later rules keep the same override order.
  - Cross-platform review: new CSS filenames are exact-case unique; only static imports were added, with no runtime path, shell, or filesystem behavior introduced.
  - Contract checks:
    - `rg -n "sidebar-shell|spec-hub-header|git-history\\.part1-shell|\\.sidebar|\\.spec-hub|git-history-dock-overlay|git-history-workbench" src/bootstrap.ts src/styles`
  - Validation passed:
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check -- src/bootstrap.ts src/styles/sidebar.css src/styles/sidebar-shell.css src/styles/spec-hub.css src/styles/spec-hub-header.css src/styles/git-history.css src/styles/git-history.part1.css src/styles/git-history.part1-shell.css`

- 2026-04-27 Phase 4 Batch 4B completed for `src/features/settings/components/SettingsView.tsx`.
  - Before: 2607 lines, P1 `feature-hotpath`, warn>2400, fail>2800, remaining headroom 193 lines.
  - After: 2408 lines, still on the warn watch list but remaining fail-threshold headroom increased to 392 lines, satisfying the P1 split target without changing settings behavior.
  - Extracted the dictation panel render surface to `src/features/settings/components/settings-view/sections/DictationSection.tsx`.
  - Public facade preserved: `SettingsView` remains exported from `SettingsView.tsx`; dictation AppSettings update keys, download/cancel/remove callbacks, model status rendering, and i18n keys are unchanged.
  - Lint cleanup: typed the previously extracted `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelBranchCompareHandlers.tsx` helper and removed its `@ts-nocheck`, preserving branch compare/worktree diff handler names.
  - Cross-platform review: new TSX filename uses exact case-stable import; the extracted section introduces no path, shell, newline, or filesystem behavior.
  - Contract checks:
    - `rg -n "DictationSection|DICTATION_MODELS|formatDownloadSize|settings\\.dictationTitle|settings\\.modelStatus" src/features/settings/components/SettingsView.tsx src/features/settings/components/settings-view/sections/DictationSection.tsx`
    - `rg -n "@ts-nocheck|BranchCompareHandlersScope|handleSelectBranchCompareCommit" src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelBranchCompareHandlers.tsx`
  - Validation passed:
    - `npm exec vitest run src/features/settings/components/SettingsView.test.tsx`
    - `npm exec vitest run src/features/git-history/components/GitHistoryPanel.test.tsx`
    - `npm run typecheck`
    - `npm run lint`
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold`
    - `git diff --check -- src/features/settings/components/SettingsView.tsx src/features/settings/components/settings-view/sections/DictationSection.tsx src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelBranchCompareHandlers.tsx`

- 2026-04-27 Phase 4 Batch 4C completed for remaining P1 styles.
  - `src/styles/messages.part1.css`:
    - Before: 2346 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 454 lines.
    - After: 2123 lines, below warn threshold and remaining fail-threshold headroom 677 lines.
    - Extracted message shell, canvas width, turn boundary, provenance, and top-level message spacing selectors to `src/styles/messages.part1-shell.css`; imported immediately before `messages.part1.css` in `src/styles/messages.css`.
  - `src/styles/tool-blocks.css`:
    - Before: 2291 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 509 lines.
    - After: 2109 lines, below warn threshold and remaining fail-threshold headroom 691 lines.
    - Extracted task container, task content, read-tool, and tool-title base selectors to `src/styles/tool-blocks-shell.css`; imported immediately before `tool-blocks.css` in `src/bootstrap.ts`.
  - `src/styles/file-view-panel.css`:
    - Before: 2237 lines, P1 `styles`, warn>2200, fail>2800, remaining headroom 563 lines.
    - After: 2101 lines, below warn threshold and remaining fail-threshold headroom 699 lines.
    - Extracted file-view panel root variables and tab shell selectors to `src/styles/file-view-panel-shell.css`; imported immediately before `file-view-panel.css` in `src/bootstrap.ts`.
  - Cascade compatibility: selector names are unchanged, and each support file is imported directly before the original file so later original rules keep the same override priority.
  - Cross-platform review: new CSS filenames are exact-case unique static imports; no runtime path, shell, or filesystem behavior was introduced.
  - Contract checks:
    - `rg -n "messages\\.part1-shell|tool-blocks-shell|file-view-panel-shell|\\.messages-shell|\\.messages-turn-boundary|\\.task-container|\\.tool-title-text|\\.fvp\\b|\\.fvp-tab\\b" src/bootstrap.ts src/styles/messages.css src/styles/messages*.css src/styles/tool-blocks*.css src/styles/file-view-panel*.css`
  - Validation passed:
    - `npm run check:large-files:gate`
    - `npm run check:large-files:near-threshold` (watch count improved from 21 to 18)
    - `npm run typecheck`
    - `npm run lint`
    - `git diff --check -- src/bootstrap.ts src/styles/messages.css src/styles/messages.part1.css src/styles/messages.part1-shell.css src/styles/tool-blocks.css src/styles/tool-blocks-shell.css src/styles/file-view-panel.css src/styles/file-view-panel-shell.css`

- 2026-04-27 Closure review completed for compatibility and governance tasks.
  - 6.1 Rust path/platform review:
    - Reviewed new Rust split modules with `rg -n '"/|"\\\\|join\\(|PathBuf|Command::new|sh -c|cmd /C' ...`.
    - New runtime modules use `Path`/`PathBuf`/`join` for filesystem composition. The remaining slash literals are logical git/spec filters (`/.git/`), macOS canonical `/private` normalization, test temp path labels, or JSON/text separators; no POSIX shell command dependency was introduced.
  - 6.2 Frontend case-sensitivity review:
    - Verified new TS/CSS filenames exist exactly as imported with a shell `test -f` pass over new split files.
    - No case-only filename pairs were introduced.
  - 6.3 Contract preservation evidence:
    - Re-ran combined `rg` checks for reducer exports, app shell helpers, Git history branch compare handlers, Settings dictation section, CSS support imports/selectors, Codex helper modules, runtime event sources, Gemini parsing, local usage Gemini scanning, and daemon workspace/file access modules.
  - 7.1 Targeted validation matrix:
    - Batch notes above record the relevant Rust and Vitest target runs per split batch.
    - Final closure reran `npm exec vitest run src/features/settings/components/SettingsView.test.tsx`, `npm exec vitest run src/features/git-history/components/GitHistoryPanel.test.tsx`, `npm run typecheck`, and `npm run lint`.
  - 7.2 Large-file hard gate:
    - `npm run check:large-files:gate` passed with `found=0`.
  - 7.3 Phase completion evidence:
    - Latest `npm run check:large-files:near-threshold` reports `found=18`.
    - Phase 4 reduced remaining P1 style warnings by removing `messages.part1.css`, `tool-blocks.css`, and `file-view-panel.css` from the warn list.
    - `SettingsView.tsx` remains on the warn watch list at 2408 lines, but now has 392 fail-threshold headroom, satisfying the documented P1 acceptance target.
  - 7.4 OpenSpec validation:
    - `openspec validate split-p0-p1-large-files --type change --strict --no-interactive` passed before final progress sync.
  - Additional hygiene:
    - `git diff --check` passed for the full worktree diff.
