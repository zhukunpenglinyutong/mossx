## 1. Folder Storage And Backend Contract

- [x] 1.1 [P0][depends:none][I: existing workspace/session catalog storage][O: project-scoped folder tree persistence model with empty-tree default][V: Rust unit test covers first-read empty tree and persisted nested folders] 建立 folder tree 与 session folder assignment 的持久化模型。
- [x] 1.2 [P0][depends:1.1][I: folder persistence model][O: backend commands for list/create/rename/delete/move folder][V: Rust unit tests cover create, rename, nested move, cyclic-parent rejection, non-empty delete blocked] 实现 folder CRUD command，并固定非空 folder 默认阻止删除。
- [x] 1.3 [P0][depends:1.1][I: session catalog entries + folder assignments][O: backend command to assign session to folder/root][V: Rust unit tests cover same-project success, missing folder rejection, failed move preserving previous assignment] 实现 session folder assignment mutation。
- [x] 1.4 [P0][depends:1.2,1.3][I: source session owner + target folder owner][O: backend same-project boundary validation][V: Rust unit test rejects cross-project session/folder move with explicit error] 加固跨项目移动保护。

## 2. Session Catalog Projection Integration

- [x] 2.1 [P0][depends:1.1][I: existing project session catalog payload][O: catalog entries include folder assignment/root fallback][V: Rust or service test asserts assignment metadata and root fallback] 将 folder assignment 合入 project session catalog。
- [x] 2.2 [P0][depends:2.1][I: archive/unarchive/delete mutations][O: assignment cleanup and state consistency after mutations][V: tests cover archive preserving assignment and delete removing dangling assignment] 对齐 archive/delete/unarchive 与 folder assignment。
- [x] 2.3 [P1][depends:2.1][I: shared projection summary][O: folder-aware visible grouping without changing membership/count][V: frontend/service test asserts folder count does not inflate session count] 保证 folder tree 只组织 projection，不参与 membership 计算。
- [x] 2.4 [P1][depends:2.1][I: folder tree + session projection ordering][O: deterministic ordering with folders before sessions and stable folder sort][V: service/component test asserts deterministic ordering across refresh] 固定 folder tree 默认排序规则。

## 3. Frontend Folder Tree UX

- [x] 3.1 [P0][depends:2.1][I: folder tree API + session catalog payload][O: left workspace project area renders nested folder tree, root sessions, and discoverable New folder entry][V: Vitest/component test covers nested folders, root sessions, empty tree, New folder entry] 实现左侧项目区域 folder tree 渲染与新建入口。
- [x] 3.2 [P0][depends:3.1,1.2][I: folder CRUD commands][O: UI actions for create/rename/delete folder][V: Vitest covers create, rename, delete blocked/non-empty policy copy] 实现 folder CRUD 交互。
- [x] 3.5 [P0][depends:3.1,1.3,1.4][I: session row action menu + folder tree][O: menu-based Move to folder path limited to current project][V: Vitest covers moving by menu to folder/root and excludes other project folders] 实现菜单移动路径。
- [x] 3.6 [P1][depends:3.1,3.5][I: folder tree keyboard interaction][O: keyboard-accessible expand/collapse and move menu access][V: component test covers keyboard expand/collapse and menu opening] 补齐基础键盘可访问性。

## 4. Multi Engine History Attribution

- [x] 4.1 [P0][depends:none][I: current Codex history read model][O: Codex adapter emits unified engine history entry contract without behavior regression][V: existing Codex history tests plus identity namespace assertion] 对齐 Codex adapter 到三引擎统一输出 contract。
- [x] 4.2 [P0][depends:none][I: Claude Code local transcript/session files][O: Claude Code scanner extracts cwd/git root/worktree/project evidence][V: Rust unit tests cover cwd strict match, git-root strict match, known worktree match, inferred mapping, ambiguous unassigned, parse failure degradation] 补齐 Claude Code history scanner 与 attribution evidence。
- [x] 4.3 [P2][depends:none][I: Gemini local history source][O: Gemini adapter emits best-effort unified history entries and unresolved/degraded fallback][V: Rust unit tests cover readable history and missing metadata unassigned without blocking Codex/Claude] 接入 Gemini best-effort history adapter。
- [x] 4.4 [P0][depends:4.1,4.2,4.3][I: engine adapters + workspace catalog][O: shared attribution resolver for strict/inferred/unassigned across three engines][V: Rust tests cover per-engine classification and no cross-engine dedupe by title] 实现三引擎共享 project attribution resolver。

## 5. Global And Project History Surfaces

- [x] 5.1 [P0][depends:4.4][I: unified engine history entries][O: global history center engine filter for Codex/Claude Code/Gemini/all with Codex/Claude priority][V: frontend/service test covers engine filters, degraded marker per engine, Gemini degradation not blocking Codex/Claude] 扩展全局历史中心三引擎查询。
- [x] 5.2 [P0][depends:4.2,4.4][I: Claude Code attributed entries][O: project session catalog or related surface shows attributable Claude Code sessions][V: regression test proves Claude session with cwd evidence appears in matching project] 修复 Claude Code 项目历史漏显。
- [x] 5.3 [P1][depends:5.1,5.2,2.2][I: canonical session state][O: global/project/folder views share archive/delete state][V: tests cover archive in global reflected in project folder and delete in project removed from global] 对齐 global/project/folder 跨视图状态。

## 6. Verification

- [x] 6.1 [P0][depends:1.4,4.4,5.2][I: completed backend implementation][O: focused backend validation][V: `cargo test --manifest-path src-tauri/Cargo.toml` plus targeted folder/history attribution tests pass] 运行并修复 Rust 后端测试。
- [x] 6.2 [P0][depends:3.5,5.3][I: completed frontend implementation][O: focused frontend validation][V: `npm run typecheck` and focused Vitest suites for folder tree/session history pass] 运行并修复当前已落地 folder tree / menu move / session history 前端测试。
- [x] 6.3 [P1][depends:6.1,6.2][I: desktop app manual matrix][O: manual verification notes][V: same-project menu move works, cross-project move rejected, Claude/Codex/Gemini histories visible/degraded as expected] 执行最小人工验证矩阵。
- [x] 6.4 [P0][depends:6.1,6.2][I: current artifacts + implementation][O: strict OpenSpec validation result][V: `openspec validate manage-project-session-folders --strict` passes] 执行 OpenSpec strict validation。

## 7. v0.4.14 Hardening Follow-up

- [x] 7.1 [P0][depends:1.3,1.4,4.4][I: `assign_workspace_session_folder_core` + shared catalog/attribution resolver][O: command 层验证 source session 属于目标 project/workspace scope][V: Rust tests cover valid owner, wrong project, unresolved owner, target folder missing] 补齐 folder assignment source owner 校验。当前代码只校验 target folder 存在于传入 workspace metadata。
- [x] 7.2 [P0][depends:1.1,1.2,1.3,2.2][I: `read_catalog_metadata` / `write_catalog_metadata` callers][O: workspace-scoped atomic metadata mutation helper covering folder CRUD、assignment、delete cleanup][V: Rust tests cover concurrent mutation preservation and failed validation no-write] 收口 folder metadata 并发写覆盖风险。当前代码仍是 command-local JSON read-modify-write。
- [x] 7.3 [P1][depends:2.1,4.1,4.2,4.3][I: `build_workspace_scope_catalog_data` / `build_global_engine_catalog_entries` + engine history adapters][O: bounded backend page acquisition or documented capped scan per engine][V: backend tests prove first-page request does not exhaust large fixture history and preserves next cursor/partial marker] 下沉 session catalog 分页到后端 scanner。当前分页在完整 entries 构造后执行。
- [x] 7.4 [P1][depends:3.1,3.6][I: `WorkspaceSessionFolderTree` collapsed state + workspace UI preference storage][O: project-local folder collapsed state persistence][V: Vitest covers collapse, refresh/remount restore, deleted folder id ignored] 持久化 folder 展开/折叠状态。当前 collapsed ids 仅存在组件内存。
- [x] 7.5 [P2][depends:3.5][I: `useSidebarMenus` move-to-folder target list and sidebar menu path][O: large target list searchable picker or equivalent grouped selector][V: Vitest covers root always reachable, search filters current-project targets only, no cross-project target leakage] 优化大量 folder 下的 Move to folder 可用性。当前为线性 Tauri menu target list。
- [x] 7.6 [P0][depends:7.1,7.2][I: hardening implementation][O: focused backend verification][V: `cargo test --manifest-path src-tauri/Cargo.toml session_management` or equivalent targeted suites pass] 验证 owner 校验与 metadata 原子写。
- [x] 7.7 [P1][depends:7.3,7.4,7.5][I: hardening implementation][O: focused frontend/catalog verification][V: targeted Vitest suites for sidebar folder tree and workspace session catalog pass] 验证分页、折叠状态与大量目标交互。

## 8. 2026-05-08 Root Visibility And Governance Sync

- [x] 8.1 [P0][depends:3.1,5.1][I: sidebar/worktree/folder tree root sessions][O: workspace-scoped `visibleThreadRootCount` controls collapsed root session window][V: focused Vitest covers default 20, custom value, clamp, More/Load older gate] 将 root 会话默认显示数量从硬编码阈值收口为 workspace setting。
- [x] 8.2 [P0][depends:8.1][I: workspace settings update paths][O: frontend numeric parser and Rust settings update both reject partial/invalid input and clamp to `1..200`][V: `npm run typecheck`, focused SessionManagementSection tests, `cargo test --manifest-path src-tauri/Cargo.toml workspaces`] 补齐空值、非法字符串、超范围与命令路径绕过 UI 的边界处理。
- [x] 8.3 [P1][depends:8.1][I: `workspace-session-management` and `workspace-sidebar-visual-harmony` specs][O: main specs synchronized with root visibility delta requirements][V: `openspec validate configure-workspace-thread-root-visibility --strict --no-interactive`] 同步 root visibility 提案到主 specs。
- [x] 8.4 [P1][depends:8.2][I: `.github/workflows/large-file-governance.yml` and `.github/workflows/heavy-test-noise-sentry.yml`][O: Linux/macOS/Windows matrix validation and unique noise artifact names][V: `node --test scripts/check-large-files.test.mjs` and `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`] 补强大文件治理与告警门禁跨平台覆盖。
