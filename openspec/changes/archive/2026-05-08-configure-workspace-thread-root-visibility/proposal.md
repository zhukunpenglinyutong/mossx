## Why

当前 sidebar 的 root 会话折叠态显示阈值是固定值，用户无法按项目调整。对于会话很多的项目，默认只看少量 root 会话会增加额外点击；对于会话较少的项目，固定大阈值又会让默认展示语义失去控制。

## What Changes

- 为 workspace settings 增加 `visibleThreadRootCount`，作为 sidebar 折叠态默认可见 root 会话数量配置。
- 在 `项目管理 -> 会话管理` 中提供可编辑入口，默认值为 `20`，并对输入做范围约束。
- sidebar / worktree / folder tree 的 root 会话折叠态统一读取该设置，而不再依赖前端硬编码。
- `More...` 与 `Load older...` 的展示条件改为跟随该设置，保持“先展开已加载数据，再进入分页”的原语义。

## 目标与边界

- 目标：
  - 让用户能按 workspace 自定义 sidebar 默认显示多少条 root 会话。
  - 默认行为改为 `20`，并保证设置改动后主界面即时生效。
  - 保持现有后端首屏 `200` 条拉取和 `loadOlder` 分页语义不变。
- 边界：
  - 该设置只影响 sidebar/worktree/folder tree 的 root 会话折叠态展示窗口。
  - 该设置不改变 session catalog 的查询 limit、排序、归档、筛选或 folder projection 规则。

## 非目标

- 不把 root 会话显示阈值做成全局 app setting。
- 不修改 `list_workspace_sessions` 的默认 `200` 条拉取上限。
- 不重做会话管理页的分页、筛选或批量治理交互。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `workspace-session-management`: 会话管理页需要暴露 workspace 级 root 会话显示阈值配置，并说明该配置影响 sidebar 默认展示窗口。
- `workspace-sidebar-visual-harmony`: sidebar 需要按 workspace 设置决定折叠态 root 会话默认可见数量，以及 `More...` / `Load older...` 的切换语义。

## Impact

- Affected code:
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/components/settings-view/sections/SessionManagementSection.tsx`
  - `src/features/app/components/Sidebar.tsx`
  - `src/features/app/components/ThreadList.tsx`
  - `src/features/app/components/WorktreeSection.tsx`
  - `src/features/app/components/WorkspaceSessionFolderTree.tsx`
  - `src/features/app/hooks/useThreadRows.ts`
  - `src/types.ts`
  - `src/services/tauri.ts`
  - `src-tauri/src/types.rs`
- Affected systems:
  - React settings surface
  - frontend->Tauri workspace settings payload
  - Rust workspace settings persistence
