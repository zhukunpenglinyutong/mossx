# Proposal: Progressive Workspace File Tree Loading

## Why

大型工作区的右侧文件树当前会把“尚未扫描到子节点”的普通目录误判为“不可展开目录”。在 5 万级文件项、1GB+ 多模块项目中，初始扫描受文件数、entry 数和时间预算限制后，用户会看到 Finder 中有内容的目录在应用内没有展开箭头，表现为“文件加载不全”。

这个问题现在需要修复，因为现有实现已经有 special directory lazy loading 的局部能力，但协议层没有表达 `unknown / partial / has_more`，导致普通大目录无法渐进式恢复完整内容。

## 目标与边界

### 目标

- 将右侧文件树从“初始全量快照推断目录可展开性”调整为“显式目录 child state + 按需加载”。
- 在保持首屏性能预算的前提下，保证普通源码目录、模块目录、文档目录即使初始未扫到子节点，也能通过展开动作继续加载。
- 后端 response MUST 能表达目录子项状态，例如 `known_empty`、`known_has_children`、`unknown`、`partial`、`has_more` 等等价语义。
- 前端 MUST 将 `unknown` 或 `partial` 目录渲染为可探测/可展开状态，不再把未知目录渲染成 leaf。
- special directory progressive loading 继续保留，并作为通用渐进式目录加载协议的一个策略分支。
- 初始加载、目录展开、刷新、Git ignored decoration、文件打开、拖拽引用、detached file explorer 需要保持行为一致。

### 边界

- 本变更聚焦 workspace file tree 的数据获取协议、目录展开状态和渐进式加载体验。
- 本变更可以调整 Tauri command response schema，但必须保持旧字段兼容期，避免一次性破坏现有调用方。
- 本变更不要求一次性实现全仓库搜索索引或完整文件系统 watcher 索引。
- 本变更不改变文件读写、删除、复制、打开方式选择、Spec Hub root action 的既有命令语义。

## 非目标

- 不通过单纯调大 `12_000` 文件上限或 `1.2s` 时间预算来解决问题。
- 不在初始加载阶段递归扫描完整工作区。
- 不把 `node_modules`、`target`、`dist` 等 special directories 重新纳入初始深度扫描。
- 不引入数据库、常驻索引服务或跨进程文件索引 daemon。
- 不重做整个 `FileTreePanel` 视觉结构、root node 设计或 file preview 渲染链路。

## What Changes

- Backend workspace file listing contract will add explicit scan metadata:
  - directory child state for returned directories
  - response scan state such as complete/partial
  - optional continuation signal for oversized directory children
  - budget evidence for diagnostics where useful
- Initial workspace file listing will prioritize a bounded, interactive tree skeleton:
  - root-level entries should be complete when possible
  - deep descendants may be partial or omitted under budget
  - omitted descendants must not make their parent directory appear permanently empty
- Directory expansion will become the canonical recovery path:
  - expanding an `unknown` or `partial` directory calls the one-level directory-child command
  - returned child directories remain expandable unless proven empty
  - repeated expansion reuses loaded children until refresh
- Frontend file tree state will merge initial snapshot and per-directory child fetches with explicit node load state.
- UI affordance will show expandable state for unknown/partial directories and recoverable loading/error states for failed expansion.
- Existing special directory loading will be retained, but it will no longer be the only progressive-loading path.
- Debug output and tests will distinguish:
  - truly empty directory
  - directory whose children are not loaded yet
  - directory whose children are partially loaded due to budget

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只调大 `list_workspace_files_inner(root, 12_000)` 上限和扫描时间预算 | 改动最小，短期能缓解部分仓库 | 大项目仍会触顶；首屏 I/O 峰值更高；仍无法表达未知目录；用户仍可能看到假空目录 | 不采用 |
| B | 保留初始快照，但为目录增加 `childState/scanState/hasMore`，所有未知目录都可按需展开 | 改动范围可控；保留现有数组字段兼容；性能和完整性都可渐进改善 | 需要前后端协议和测试一起更新；旧调用方需要兼容默认值 | 采用 |
| C | 建立完整 workspace file index 或 watcher-backed cache，前端只读索引 | 长期查询能力最强 | 引入持久索引、一致性、跨平台 watcher 和恢复策略，超过当前问题范围 | 暂不采用 |

## Capabilities

### New Capabilities

- `workspace-filetree-progressive-scan-protocol`: Defines the workspace file tree scan metadata, unknown/partial directory semantics, and on-demand recovery behavior for large workspaces.

### Modified Capabilities

- `workspace-filetree-special-directory-loading`: Generalize special-directory progressive loading so special directories remain lazy, while ordinary directories can also become progressively loadable when scan state is unknown or partial.
- `client-startup-orchestration`: Align file tree hydration with the existing requirement that complete file tree loading is deferred to on-demand or idle work, while ensuring deferred loading remains discoverable and recoverable from the visible tree.

## 验收标准

- 在包含 50,000+ 文件/目录项的大型 workspace 中，初始文件树必须在预算内保持可交互，不能因为完整扫描未完成而卡住 UI。
- Finder 中有子项的普通目录即使初始未返回子节点，也必须在文件树中显示为可展开或可探测状态。
- 展开普通 `unknown` 目录时，前端必须调用 directory-child query，并将返回的直接子文件和子目录合并进当前树。
- 展开 special directory 仍然只加载一层直接子项，且 nested child 继续渐进式加载。
- 真正空目录必须能被标记为 empty，避免无限显示可展开状态。
- 当单目录子项超过当前预算时，UI 必须保留 `partial/has_more` 等价状态，不能静默丢弃后续子项。
- 刷新文件树后，已加载的懒加载目录状态必须可被正确重建或清理，不得混入其他 workspace。
- 文件打开、preview、tab open、drag-to-composer、file mention insertion、Git ignored decoration、detached file explorer 必须保持兼容。
- 后端必须拒绝路径穿越或 workspace 外目录请求，并返回可恢复错误。
- 测试至少覆盖：
  - Rust: 初始扫描预算命中时目录不被永久视为空
  - Rust: 单目录子项预算命中时返回 partial/has_more 语义
  - Frontend: 普通 unknown 目录可展开并触发 child fetch
  - Frontend: truly empty 目录不会反复请求
  - Regression: special directory lazy loading、FileTree root node、detached file explorer 仍可用

## Impact

- Frontend:
  - `src/features/files/components/FileTreePanel.tsx`
  - `src/features/files/components/FileTreePanel.run.test.tsx`
  - `src/features/files/components/DetachedFileExplorerWindow.tsx`
  - `src/features/files/components/FileExplorerWorkspace.tsx`
  - `src/features/workspaces/hooks/useWorkspaceFiles.ts`
  - `src/features/workspaces/hooks/useWorkspaceFiles.test.tsx`
  - `src/services/tauri.ts`
- Backend:
  - `src-tauri/src/bin/cc_gui_daemon/file_access.rs`
  - `src-tauri/src/bin/cc_gui_daemon/workspace_io.rs`
  - `src-tauri/src/workspaces/commands.rs`
  - `src-tauri/src/workspaces/files.rs`
  - `src-tauri/src/types.rs` if shared DTO types need extension
- Contracts:
  - `WorkspaceFilesResponse` gains additive metadata fields while preserving existing `files`, `directories`, `gitignored_files`, and `gitignored_directories`.
  - `list_workspace_directory_children` gains explicit complete/partial/has_more semantics.
- Specs:
  - new `workspace-filetree-progressive-scan-protocol`
  - modified `workspace-filetree-special-directory-loading`
  - modified `client-startup-orchestration`
