# Project Session Management Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前设置页中的项目会话管理 section 升级为独立的 Session Management capability，提供真实分页读取、archive/unarchive/delete 治理，以及 archived session 默认不出现在主界面。

**Architecture:** 采用三层结构：各引擎历史源先进入 backend `session catalog` 聚合层，再由设置页会话管理页面消费完整 catalog query，最后由主界面 session surfaces 只消费 active-only visibility projection。实现顺序遵循“先 contract、后 settings page、再 main UI filtering、最后回归验证”。

**Tech Stack:** Tauri 2.x, Rust backend commands, React 19, TypeScript, file-based persistence, Vitest, cargo test

---

### Task 1: Freeze Scope And Contracts

**Files:**
- Reference: [proposal.md](/Users/chenxiangning/code/AI/github/mossx/openspec/changes/project-session-management-center/proposal.md)
- Reference: [design.md](/Users/chenxiangning/code/AI/github/mossx/openspec/changes/project-session-management-center/design.md)
- Reference: [workspace-session-management spec](/Users/chenxiangning/code/AI/github/mossx/openspec/changes/project-session-management-center/specs/workspace-session-management/spec.md)

**Step 1: Freeze implementation defaults**

Decisions to honor:
- `Shared Session` is out of phase-one write management.
- `archive current open session` uses soft semantics.
- `sizeBytes/sourceLabel` are optional for non-Codex phase one.

**Step 2: Freeze backend command names**

Use these names unless a stronger repo convention is discovered:
- `list_workspace_sessions`
- `archive_workspace_sessions`
- `unarchive_workspace_sessions`
- `delete_workspace_sessions`

**Step 3: Freeze minimum phase-one payload**

Required fields:
- `sessionId`
- `workspaceId`
- `engine`
- `title`
- `updatedAt`
- `archivedAt`
- `threadKind`

Optional phase-one fields:
- `source`
- `sourceLabel`
- `sizeBytes`
- `nextCursor`
- `partialSource`

**Step 4: Commit planning checkpoint**

Suggested commit message:
```bash
git commit -m "docs: freeze project session management implementation contract"
```

### Task 2: Backend Catalog Read Path

**Files:**
- Modify: [src-tauri/src/command_registry.rs](/Users/chenxiangning/code/AI/github/mossx/src-tauri/src/command_registry.rs)
- Modify: [src-tauri/src/state.rs](/Users/chenxiangning/code/AI/github/mossx/src-tauri/src/state.rs)
- Modify: [src-tauri/src/codex/mod.rs](/Users/chenxiangning/code/AI/github/mossx/src-tauri/src/codex/mod.rs)
- Modify: [src-tauri/src/storage.rs](/Users/chenxiangning/code/AI/github/mossx/src-tauri/src/storage.rs)
- Create: `src-tauri/src/session_management.rs`
- Test: `src-tauri/src/session_management/tests.rs` or colocated module tests

**Step 1: Create Rust catalog module shell**

Add:
- catalog entry type
- query type
- batch result type

**Step 2: Implement read-only `list_workspace_sessions` for Codex first**

Behavior:
- reuse existing Codex unified history path
- normalize into catalog entries
- support `status=active|archived|all`
- support `cursor/limit`

**Step 3: Add catalog metadata reader**

Behavior:
- read workspace-scoped archive metadata file
- merge `archivedAt` into catalog entries
- keep file access behind existing lock + atomic-write conventions

**Step 4: Add degraded marker path**

Behavior:
- if local scan fails but live data exists, return `partialSource`
- do not fail whole catalog read unnecessarily

**Step 5: Add backend tests**

Cover:
- first-page read
- next-cursor continuation
- archived filtering
- deterministic ordering
- degraded marker behavior

**Step 6: Run Rust tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml session_management
```

### Task 3: Backend Archive/Unarchive/Delete Batch Path

**Files:**
- Modify: `src-tauri/src/session_management.rs`
- Modify: [src-tauri/src/local_usage/session_delete.rs](/Users/chenxiangning/code/AI/github/mossx/src-tauri/src/local_usage/session_delete.rs)
- Modify: [src-tauri/src/shared/codex_core.rs](/Users/chenxiangning/code/AI/github/mossx/src-tauri/src/shared/codex_core.rs)
- Test: backend session management tests

**Step 1: Implement `archive_workspace_sessions`**

Behavior:
- Codex: call native archive first, then write metadata
- non-Codex: metadata-only archive allowed in phase one
- return per-session structured result

**Step 2: Implement `unarchive_workspace_sessions`**

Behavior:
- clear archive metadata
- restore default visibility
- preserve partial-failure reporting

**Step 3: Implement `delete_workspace_sessions`**

Behavior:
- reuse existing delete paths where available
- only delete requested targets
- keep partial failures in result payload

**Step 4: Add backend tests**

Cover:
- full success
- partial failure
- retry-safe behavior
- archive then unarchive visibility transition

**Step 5: Run Rust tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml session_management local_usage
```

### Task 4: Frontend Service And Types

**Files:**
- Modify: [src/services/tauri.ts](/Users/chenxiangning/code/AI/github/mossx/src/services/tauri.ts)
- Modify: [src/types.ts](/Users/chenxiangning/code/AI/github/mossx/src/types.ts)
- Create: `src/features/session-management/types.ts`
- Create: `src/features/session-management/services/sessionManagement.ts`
- Test: service mapping tests

**Step 1: Add TS types for catalog entry and query**

Include:
- `WorkspaceSessionCatalogEntry`
- `WorkspaceSessionCatalogQuery`
- batch mutation result types

**Step 2: Add Tauri wrapper functions**

Add:
- `listWorkspaceSessions`
- `archiveWorkspaceSessions`
- `unarchiveWorkspaceSessions`
- `deleteWorkspaceSessions`

**Step 3: Add mapping/normalization tests**

Cover:
- camelCase mapping
- optional metadata
- partialSource passthrough

**Step 4: Run targeted tests**

Run:
```bash
npm run test -- sessionManagement tauri
```

### Task 5: Dedicated Settings Page

**Files:**
- Modify: [src/features/settings/components/SettingsView.tsx](/Users/chenxiangning/code/AI/github/mossx/src/features/settings/components/SettingsView.tsx)
- Modify: [src/features/settings/components/settings-view/settingsViewAppearance.ts](/Users/chenxiangning/code/AI/github/mossx/src/features/settings/components/settings-view/settingsViewAppearance.ts)
- Modify: [src/features/settings/components/settings-view/sections/OtherSection.tsx](/Users/chenxiangning/code/AI/github/mossx/src/features/settings/components/settings-view/sections/OtherSection.tsx)
- Create: `src/features/session-management/components/SessionManagementView.tsx`
- Create: `src/features/session-management/hooks/useWorkspaceSessionCatalog.ts`
- Create: `src/features/session-management/utils/*`
- Test: `src/features/settings/components/SettingsView.test.tsx`
- Test: `src/features/session-management/components/SessionManagementView.test.tsx`

**Step 1: Add new settings section key**

Behavior:
- add dedicated `session-management` settings section
- route sidebar selection to this new section

**Step 2: Create session management view model hook**

Behavior:
- manage workspace selection
- manage query state
- manage cursor-based paging
- manage selection state

**Step 3: Create dedicated management page**

Must render:
- workspace picker
- keyword query
- engine filter
- status filter
- result list
- batch action bar
- pagination/load-more trigger

**Step 4: De-scope old inline section**

Behavior:
- old `ProjectSessionManagementSection` stops being primary surface
- either remove from `OtherSection` or replace with jump entry

**Step 5: Add tests**

Cover:
- navigation to new section
- workspace switching
- paging
- filter changes
- batch action state

### Task 6: Main UI Active-Only Visibility Projection

**Files:**
- Modify: [src/features/threads/hooks/useThreadActions.ts](/Users/chenxiangning/code/AI/github/mossx/src/features/threads/hooks/useThreadActions.ts)
- Modify: [src/features/threads/hooks/useThreadActions.helpers.ts](/Users/chenxiangning/code/AI/github/mossx/src/features/threads/hooks/useThreadActions.helpers.ts)
- Modify: [src/features/workspaces/components/WorkspaceHome.tsx](/Users/chenxiangning/code/AI/github/mossx/src/features/workspaces/components/WorkspaceHome.tsx)
- Modify: `src/features/app/components/Sidebar.tsx`
- Modify: `src/features/layout/hooks/topbarSessionTabs.ts`
- Test: existing thread/topbar/home tests

**Step 1: Centralize active-only visibility rule**

Behavior:
- archived session hidden by default
- no component-specific guesswork

**Step 2: Apply rule to sidebar thread list**

Behavior:
- archived entries do not appear in default visible set

**Step 3: Apply rule to workspace home recent list**

Behavior:
- recent list excludes archived entries

**Step 4: Apply rule to topbar session tab recovery**

Behavior:
- archived sessions do not re-enter recovered/visible tab window

**Step 5: Preserve soft archive semantics**

Behavior:
- if current session is archived while open, current context may remain until explicit navigation change
- after refresh/restart it should disappear from default surfaces

**Step 6: Run targeted tests**

Run:
```bash
npm run test -- useThreadActions WorkspaceHome topbarSessionTabs Sidebar
```

### Task 7: Verification Matrix

**Files:**
- Modify: relevant frontend/backend tests
- Reference: [tasks.md](/Users/chenxiangning/code/AI/github/mossx/openspec/changes/project-session-management-center/tasks.md)

**Step 1: Validate real pagination**

Cases:
- 200+ session dataset
- multi-page cursor reads
- deterministic sort

**Step 2: Validate archive visibility**

Cases:
- archive removes from main UI
- restart keeps hidden
- unarchive restores

**Step 3: Validate partial failures**

Cases:
- batch archive partial fail
- batch delete partial fail
- retry preserves failed selection

**Step 4: Run project quality gates**

Run:
```bash
npm run lint
npm run typecheck
npm run test
npm run check:runtime-contracts
npm run doctor:strict
cargo test --manifest-path src-tauri/Cargo.toml
```

### Task 8: Rollout And Recovery

**Files:**
- Reference: [design.md](/Users/chenxiangning/code/AI/github/mossx/openspec/changes/project-session-management-center/design.md)

**Step 1: Roll out backend contract first**

Reason:
- lets frontend develop against stable query/mutation shape

**Step 2: Roll out dedicated settings page second**

Reason:
- makes new capability user-visible before main UI projection change

**Step 3: Roll out main-surface filtering third**

Reason:
- reduces risk of silent visibility regressions before management UI exists

**Step 4: Define rollback**

Rollback order:
- disable main UI archived filtering
- keep management page read-only
- keep backend catalog read path

**Step 5: Commit in small checkpoints**

Suggested sequence:
```bash
git commit -m "feat: add workspace session catalog contract"
git commit -m "feat: add session management settings page"
git commit -m "feat: hide archived sessions from default main surfaces"
git commit -m "test: add session management regression coverage"
```
