# Design: Progressive Workspace File Tree Loading

## Context

当前右侧文件树由 backend 返回 `WorkspaceFilesResponse`，主体字段是：

- `files: string[]`
- `directories: string[]`
- `gitignored_files: string[]`
- `gitignored_directories: string[]`

主窗口和 detached file explorer 复用同一套 `useWorkspaceFiles` + `FileTreePanel` 路径。前端通过 `files/directories` 构建树，再用 `hasChildren || isLazyLoadable` 判断目录是否可展开。`isLazyLoadable` 目前主要来自 special directory 规则，例如 `node_modules`、`vendor`、`dist`、`target`、`build`。

后端扫描有三类预算：

- 初始 workspace listing 传入 `max_files = 12_000`
- 目录展开 listing 传入 `max_entries = 2_000`
- 扫描过程受 `WORKSPACE_SCAN_ENTRY_BUDGET = 30_000` 和 `WORKSPACE_SCAN_TIME_BUDGET = 1_200ms` 约束

这套模型在中小项目中可用，但在 50,000+ 项的大项目中有一个结构性缺陷：response 没有表达“该目录可能有子项，但本轮没扫到”。前端只能把没有 child node 的普通目录当成不可展开目录，于是用户看到的就是“目录不全”。

本设计把文件树从“全量快照推断模型”改成“显式目录状态 + 按需恢复模型”。

## Goals / Non-Goals

**Goals:**

- Backend response 明确表达目录 child state 和 scan state。
- 前端能区分 `empty`、`loaded`、`unknown`、`partial`。
- 普通目录在 unknown/partial 状态下也能展开并触发 direct-children fetch。
- special directory lazy loading 继续复用，但不再是渐进式加载的唯一入口。
- 初始加载维持现有性能预算，不通过扩大预算换完整性。
- 保持旧 `files/directories/gitignored_*` 字段兼容，降低调用方迁移风险。
- 主窗口 file tree 和 detached file explorer 使用同一协议与状态机。

**Non-Goals:**

- 不实现持久化 workspace file index。
- 不实现 watcher-backed 全量目录缓存。
- 不改文件读写、删除、复制、拖拽、预览和打开方式的命令语义。
- 不重构整个 `FileTreePanel` 视觉布局。
- 不要求一次性消除所有旧数组字段消费面。

## Decisions

### Decision 1: Add metadata beside existing path arrays

Adopt additive response metadata instead of replacing `files/directories`.

Proposed shape:

```ts
type WorkspaceFilesResponse = {
  files: string[];
  directories: string[];
  gitignored_files: string[];
  gitignored_directories: string[];
  scan_state?: "complete" | "partial";
  limit_hit?: boolean;
  directory_entries?: WorkspaceDirectoryEntry[];
};

type WorkspaceDirectoryEntry = {
  path: string;
  child_state: "unknown" | "loaded" | "empty" | "partial";
  special_kind?: "dependency" | "build_artifact" | null;
  has_more?: boolean;
};
```

Rationale:

- Existing consumers can continue reading arrays.
- New file tree code can prefer `directory_entries` when present.
- Backend can roll out metadata independently for daemon and Tauri command paths.

Alternatives considered:

- Replace arrays with a tree DTO. Rejected because it would force a larger frontend and spec-hub compatibility migration.
- Add only `limit_hit` at response level. Rejected because it cannot tell which directory should remain expandable.

### Decision 2: Treat unknown directory children as expandable

Frontend node state should not equate “no known children” with “empty”.

Directory node states:

```ts
type FileTreeDirectoryLoadState =
  | "loaded"
  | "empty"
  | "unknown"
  | "partial"
  | "loading"
  | "error";
```

Render rule:

- `loaded`: expandable if children exist.
- `empty`: not expandable after direct child fetch confirms no children.
- `unknown`: expandable and fetches direct children on first expand.
- `partial`: expandable and fetches/continues direct children.
- `loading`: spinner/disabled repeat fetch for that node.
- `error`: expandable retry affordance or retry on expand.

Rationale:

- This fixes the false leaf bug directly.
- It avoids making all directories look fully loaded when they are only known by path.
- It maps naturally to the existing lazy directory loading sets.

Alternatives considered:

- Mark every directory as lazy forever. Rejected because truly empty directories would always look expandable and repeatedly fetch unless extra state is added.
- Keep special-directory-only lazy behavior. Rejected because the user issue happens in ordinary module/source directories.

### Decision 3: Initial listing remains bounded and shallow-biased

Initial listing should preserve current budget discipline:

- Root-level entries should be collected and sorted first.
- Special directories should still be pruned from deep traversal and returned as lazy nodes.
- Deep traversal may populate known descendants while budget remains.
- When file, entry, or time budget is hit, response should be `scan_state = partial`.
- Any directory that is included without confirmed direct children should default to `unknown`, not `empty`.

Rationale:

- Large workspaces stay responsive.
- Existing file search/autocomplete can still use the best-effort file array.
- Completeness becomes recoverable through expansion rather than front-loaded.

Alternatives considered:

- Load only root-level entries on initial request. Rejected for phase 1 because it may degrade existing medium-project ergonomics and file search richness more than needed.
- Full recursive scan in a background thread before showing the tree. Rejected because it delays correctness and creates racey UI states without solving explicit child-state semantics.

### Decision 4: Directory-child query returns direct children plus completion state

`list_workspace_directory_children` should remain a one-level command, but response metadata must indicate whether the returned children are complete.

Behavior:

- Direct children are sorted by name before truncation.
- Response returns direct files and directories only.
- If `files + directories < max_entries` and scan budget did not expire, directory is complete.
- If max entries or scan time budget is hit, response is partial and `has_more = true`.
- A directory with no returned children and complete scan is `empty`.

Rationale:

- One-level fetch keeps expansion cost bounded.
- Sorting before truncation gives stable visible ordering.
- `has_more` prevents silent loss for directories with more than 2,000 direct children.

Alternatives considered:

- Recursive fetch when expanding a directory. Rejected because expanding one large module could recreate the initial-scan performance problem.
- Cursor pagination in the first step. Deferred; `has_more` can expose the need without forcing UI pagination into the first implementation.

### Decision 5: Merge loaded children by path and workspace generation

Frontend should keep lazy-loaded files, directories, and directory metadata keyed by workspace id and path. On workspace switch or full refresh:

- clear stale lazy state for old workspace
- preserve only state proven to belong to the current workspace generation
- prefer latest direct-child response for a directory

Rationale:

- Prevents loaded children from one workspace leaking into another.
- Matches existing `useWorkspaceFiles` stale-response protection.
- Keeps detached explorer and embedded tree behavior aligned.

Alternatives considered:

- Let each `FileTreePanel` own independent all-state forever. Rejected because refresh/workspace switch bugs become more likely.
- Move all tree state into a global store immediately. Rejected because it is unnecessary for this change and expands blast radius.

## Migration Plan

1. Extend Rust `WorkspaceFilesResponse` with optional metadata fields while preserving existing arrays.
2. Add Rust helper types for directory child state and scan state in both command paths that currently define workspace file DTOs.
3. Update initial scan to emit metadata:
   - special directories as `unknown` or `partial`
   - directories with known children as `loaded`
   - directories without confirmed children as `unknown` when scan is partial
4. Update directory-child scan to emit complete/partial/empty metadata.
5. Update TypeScript Tauri bridge types to accept optional metadata.
6. Update `useWorkspaceFiles` to preserve response metadata and expose it to file tree consumers.
7. Update `FileTreePanel` builder and render logic to use explicit directory load state.
8. Keep fallback behavior for old responses:
   - special directories remain lazy
   - directories with children are loaded
   - directories without children default to current behavior unless response scan state says partial
9. Add targeted Rust and Vitest coverage.
10. Run focused file tree tests, typecheck, and relevant Rust tests.

Rollback strategy:

- Because metadata fields are additive, rollback can keep backend fields unused while frontend falls back to current array-only behavior.
- If frontend rollout shows regressions, disable ordinary-directory unknown expansion while keeping special directory lazy loading intact.

## Risks / Trade-offs

- [Risk] Optional metadata can create two behavior paths during migration. -> Mitigation: centralize response normalization in TS so `FileTreePanel` consumes one normalized model.
- [Risk] Marking too many directories as unknown may show expandable affordances for directories that are actually empty. -> Mitigation: direct-child fetch marks confirmed empty directories as `empty` and caches that state.
- [Risk] `has_more` without full pagination may still leave very large single directories incomplete. -> Mitigation: phase 1 must expose partial state visibly; follow-up can add cursor pagination if real users hit this case.
- [Risk] Existing search/autocomplete may still rely on partial `files[]`. -> Mitigation: do not claim global file completeness; keep the change scoped to file tree discoverability and expansion.
- [Risk] Duplicate DTO definitions exist in `src-tauri/src/workspaces/files.rs` and daemon workspace IO. -> Mitigation: update both paths in the same implementation task and add tests around both if practical.

## Open Questions

- Should phase 1 include user-visible `Load more` for `has_more`, or is a partial indicator plus refresh enough?
- Should initial scan become root-plus-one-level only after metadata lands, or should it keep current best-effort deep traversal for compatibility?
- Should `directory_entries` include counts when known, or should counts be deferred until pagination/indexing work?
