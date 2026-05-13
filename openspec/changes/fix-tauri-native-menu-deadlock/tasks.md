## 1. Incident Contract And Guardrails

- [x] 1.1 [P0][depends:none][I: macOS 0.4.16 hang report + current native menu callsites][O: native menu risk inventory][V: inventory includes `CheckpointCommitDialog`, `useSidebarMenus`, `useFileLinkOpener`, and remaining `src/features/**` callsites] 建立 native popup 风险清单。
- [x] 1.2 [P0][depends:1.1][I: `@tauri-apps/api/menu` callsites][O: allowlist policy][V: app-level menu allowed, high-risk renderer feature popup disallowed] 定义 native menu allowlist。
- [x] 1.3 [P0][depends:1.2][I: scripts/check patterns][O: static guard script or existing guard extension][V: guard fails on non-allowlisted `src/features/**` direct menu import / popup usage] 增加 native menu regression guard。

## 2. Renderer Menu Primitive

- [x] 2.1 [P0][depends:1.2][I: existing sidebar/context menu UI patterns][O: shared renderer context menu primitive][V: unit tests cover open, close, disabled item, outside click, Escape, viewport clamp] 实现轻量 renderer-owned menu primitive。
- [x] 2.2 [P0][depends:2.1][I: existing CSS variables and z-index layers][O: stable menu styling][V: desktop/mobile viewport does not overflow and does not obscure critical dialogs incorrectly] 接入视觉和定位规则。
- [x] 2.3 [P1][depends:2.1][I: keyboard accessibility expectations][O: basic keyboard/focus behavior][V: Escape closes; disabled item cannot be activated; focus does not trap app permanently] 补基础可访问性。

## 3. P0 High-Risk Menu Migration

- [x] 3.1 [P0][depends:2.1][I: `src/features/status-panel/components/CheckpointCommitDialog.tsx`][O: renderer-owned commit message engine/language selector][V: Vitest covers each engine/language payload and no `@tauri-apps/api/menu` import remains] 迁移 commit message nested native menu。
- [x] 3.2 [P0][depends:2.1][I: `src/features/app/hooks/useSidebarMenus.ts`][O: renderer-owned thread/worktree context menus][V: tests cover rename, auto-name, sync, pin, copy id, archive, move folder, size label, delete] 迁移 sidebar thread/worktree menu。
- [x] 3.3 [P0][depends:2.1][I: `src/features/messages/hooks/useFileLinkOpener.ts`][O: renderer-owned file link context menu][V: tests cover open file, open configured target, reveal, copy link, disabled download placeholder] 迁移 file link menu。
- [x] 3.4 [P0][depends:3.1,3.2,3.3][I: migrated files][O: no native popup in P0 paths][V: `rg -n \"@tauri-apps/api/menu|Menu\\.new|MenuItem\\.new|\\.popup\\(\"` shows no P0 path usage] 验证 P0 路径移除 native popup。

## 4. Backend Defensive Lock Scope

- [x] 4.1 [P0][depends:none][I: `src-tauri/src/menu.rs`][O: no-lock-during-mutator implementation for text updates][V: Rust targeted test or code review evidence shows mutex guard dropped before Tauri mutator] 修复 `MenuItemRegistry::set_text` 持锁调用 native mutator。
- [x] 4.2 [P1][depends:4.1][I: menu registry accelerator/text update code][O: consistent helper pattern][V: existing app menu behavior and tests remain green] 统一 registry handle clone/update 模式。

## 5. P1 Remaining Native Popup Migration

- [x] 5.1 [P1][depends:2.1,3.4][I: `GitDiffPanel`, `GitHistoryWorktreePanel`][O: renderer-owned git context menus][V: targeted tests cover existing git menu actions] 迁移 git 相关 context menus。
- [x] 5.2 [P1][depends:2.1,3.4][I: `FileTreePanel`, `PromptPanel`, `ComposerQueue`, `useLayoutNodes`][O: renderer-owned remaining feature menus][V: static guard allowlist shrinks to app-level native menu only or documented exceptions] 迁移剩余 feature native popup。
- [x] 5.3 [P1][depends:5.1,5.2][I: native menu usage guard][O: fail-mode enforcement][V: CI/local validation fails on any new non-allowlisted feature native menu usage] 将 guard 从 inventory/warn 收紧到 fail。

## 6. Verification

- [x] 6.1 [P0][depends:3.4,4.1][I: OpenSpec change artifacts][O: strict OpenSpec validation][V: `openspec validate fix-tauri-native-menu-deadlock --type change --strict --no-interactive` passes] 验证 OpenSpec change。
- [x] 6.2 [P0][depends:3.1,3.2,3.3][I: migrated frontend tests][O: focused Vitest results][V: checkpoint/sidebar/file-link targeted tests pass] 跑 P0 targeted frontend tests。
- [x] 6.3 [P0][depends:4.1][I: Rust menu registry][O: targeted Rust test result][V: `cargo test --manifest-path src-tauri/Cargo.toml menu` or closest targeted subset passes] 跑 backend targeted tests。
- [x] 6.4 [P0][depends:1.3,3.4][I: static guard][O: guard output][V: guard reports no P0 native popup regressions] 跑 native menu static guard。
- [x] 6.5 [P0][depends:3.4][I: macOS desktop app][O: manual hang matrix evidence][V: repeated commit selector/sidebar/file-link interactions remain responsive without force quit] 执行 macOS 手测矩阵。
- [x] 6.6 [P0][depends:1.3,3.4,4.1][I: project quality gate][O: basic regression evidence][V: `npm run typecheck`, affected Vitest suites, `npm run check:large-files:gate` pass] 执行基础质量门禁。

## 7. Release Notes And Follow-up

- [x] 7.1 [P0][depends:6.5][I: incident analysis][O: release note / changelog bullet][V: note mentions macOS hang fix and migrated menus without exposing noisy internals] 准备用户可读修复说明。
- [x] 7.2 [P1][depends:6.6][I: remaining native allowlist][O: cleanup issue or follow-up change if any exceptions remain][V: every remaining exception has owner and removal plan] 收口剩余例外。
