## 1. Backend Contract

- [x] 1.1 Add additive workspace file tree metadata DTOs for scan state, directory child state, special kind, and has-more semantics in the daemon path. Input: current `WorkspaceFilesResponse` and directory-child response structs. Output: old arrays preserved plus optional metadata fields. Verify with Rust type checks and serialization snapshots or focused assertions.
- [x] 1.2 Add the same additive metadata DTOs to the non-daemon Tauri workspace file listing path. Input: `src-tauri/src/workspaces/files.rs` and command wrappers. Output: command responses share equivalent metadata semantics across both backends. Verify by compiling `src-tauri` and checking TypeScript bridge compatibility.
- [x] 1.3 Keep path boundary and traversal rejection behavior unchanged for directory-child requests. Input: existing workspace path validation helpers. Output: metadata changes do not loosen workspace-root containment. Verify with existing path traversal tests or add a focused Rust regression if missing.

## 2. Backend Scan Semantics

- [x] 2.1 Mark initial workspace listings as partial when file count, entry count, or time budget is reached. Input: `list_workspace_files_inner` budgets and scan accounting. Output: `scan_state=partial` and `limit_hit=true` or equivalent evidence when any budget stops scanning. Verify with a budget-forced Rust test.
- [x] 2.2 Emit directory metadata for returned directories during initial scans. Input: scanned files, scanned directories, special-directory classification, and scan completion evidence. Output: directories are marked `loaded`, `empty`, `unknown`, or `partial` without treating unconfirmed children as empty. Verify with Rust tests covering a truncated ordinary directory.
- [x] 2.3 Preserve special directory pruning while exposing special directories as progressively loadable. Input: dependency and build-artifact directory classifiers. Output: special directories keep descendants out of initial listing and get `special_kind` plus unknown or partial child state. Verify with existing special-directory lazy-loading tests plus one metadata assertion.
- [x] 2.4 Return bounded one-level metadata for directory-child listings. Input: `list_workspace_directory_children_inner(root, rel_path, 2_000)`. Output: direct files/directories only, sorted before truncation, with complete/empty/partial and `has_more` semantics. Verify with Rust tests for empty directory and oversized direct-child directory.

## 3. Frontend Bridge And Normalization

- [x] 3.1 Extend TypeScript response types for workspace file listings and directory-child listings. Input: `src/services/tauri.ts`. Output: optional `scan_state`, `limit_hit`, `directory_entries`, `child_state`, `special_kind`, and `has_more` fields without breaking old callers. Verify with `npm run typecheck`.
- [x] 3.2 Normalize optional metadata in `useWorkspaceFiles`. Input: backend responses with and without metadata. Output: consumers receive one normalized model with safe defaults for legacy array-only responses. Verify with hook tests for legacy and metadata-enabled payloads.
- [x] 3.3 Scope progressive file tree state by workspace and refresh generation. Input: current stale-response protection and refresh flow. Output: lazy files, lazy directories, directory metadata, loading state, and error state are cleared or reconciled on workspace switch and refresh. Verify with hook or component tests simulating workspace change.

## 4. File Tree Interaction

- [x] 4.1 Add explicit directory load state handling to file tree construction. Input: `FileTreePanel` tree builder, special-directory checks, lazy-loaded child sets, and normalized metadata. Output: directory nodes distinguish `loaded`, `empty`, `unknown`, `partial`, `loading`, and `error`. Verify with focused tree-builder or render tests.
- [x] 4.2 Render ordinary unknown or partial directories as expandable and fetch direct children on first expand. Input: existing `canExpand = hasChildren || isLazyFolder` behavior. Output: unknown/partial ordinary directories use the same directory-child command path as special directories. Verify with Vitest interaction test asserting fetch invocation and merged children.
- [x] 4.3 Cache confirmed empty directories as empty and prevent repeated fetch loops. Input: directory-child response with no files or directories and complete state. Output: the directory stops showing a false expandable affordance until refresh. Verify with Vitest interaction test for collapse/re-expand behavior.
- [x] 4.4 Preserve existing file actions and explorer variants. Input: embedded file tree, detached file explorer, preview/open/drag/mention flows, Git ignored decoration, and root node behavior. Output: progressive loading changes do not regress existing interactions. Verify with focused regression tests for `FileTreePanel.run.test.tsx` and detached explorer coverage where available.

## 5. Validation

- [x] 5.1 Run OpenSpec strict validation for this change. Input: completed proposal, design, specs, and tasks. Output: `openspec validate improve-progressive-file-tree-loading --strict --no-interactive` passes.
- [x] 5.2 Run focused frontend validation. Input: changed TypeScript files and file tree tests. Output: `npm run typecheck` and focused Vitest suites for `FileTreePanel` and `useWorkspaceFiles` pass, or failures are documented with root cause.
- [x] 5.3 Run focused backend validation. Input: changed Rust workspace file listing and directory-child tests. Output: focused `cargo test --manifest-path src-tauri/Cargo.toml ...` passes, or failures are documented with root cause.
- [x] 5.4 Document any deferred follow-up for real pagination when `has_more=true`. Input: implementation outcome and test evidence. Output: follow-up note only if phase 1 exposes partial state without a Load More UI. Verify by linking the note to this OpenSpec change or implementation PR.
