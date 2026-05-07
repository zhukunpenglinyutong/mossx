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
- [x] 3.3 [P0][depends:3.1,1.3,1.4][I: DnD interaction layer][O: same-project drag and drop for session folder assignment][V: Vitest/e2e-style test covers same-project move and UI refresh] 实现同项目 session 拖拽移动。
- [x] 3.4 [P0][depends:3.3][I: cross-project drop targets][O: cross-project drag hover disabled state and drop rejection feedback][V: test covers invalid hover not highlighted, rejected drop preserving original assignment, explicit message] 实现跨项目拖拽保护提示。
- [x] 3.5 [P0][depends:3.1,1.3,1.4][I: session row action menu + folder tree][O: menu-based Move to folder path limited to current project][V: Vitest covers moving by menu to folder/root and excludes other project folders] 实现非拖拽移动路径。
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

- [x] 6.1 [P0][depends:1.4,3.4,4.4,5.2][I: completed implementation][O: focused backend validation][V: `cargo test --manifest-path src-tauri/Cargo.toml` plus targeted folder/history attribution tests pass] 运行并修复 Rust 后端测试。
- [x] 6.2 [P0][depends:3.4,5.3][I: completed frontend implementation][O: focused frontend validation][V: `npm run typecheck` and focused Vitest suites for folder tree/session history pass] 运行并修复前端类型与组件测试。
- [ ] 6.3 [P1][depends:6.1,6.2][I: desktop app manual matrix][O: manual verification notes][V: same-project DnD works, cross-project DnD rejected, Claude/Codex/Gemini histories visible/degraded as expected] 执行最小人工验证矩阵。
- [x] 6.4 [P0][depends:6.3][I: final artifacts + implementation][O: strict OpenSpec validation result][V: `openspec validate manage-project-session-folders --strict` passes] 执行 OpenSpec strict validation。
