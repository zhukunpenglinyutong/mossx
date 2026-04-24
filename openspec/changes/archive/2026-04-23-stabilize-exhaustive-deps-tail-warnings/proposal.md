## Why

仓库的 `react-hooks/exhaustive-deps` warning 已经压到了最后 6 条，而且都落在叶子 feature 文件里。继续保留不会立刻破功能，但会让 lint 长期带噪，也让后续维护者难以区分“历史残留”与“新回归”。

现在处理的原因很直接：这是最后一轮低风险收尾，适合单独建 change，一次把 warning 清到 `0`。

## 目标与边界

- 目标：收掉仓库最后 6 条 `react-hooks/exhaustive-deps` warning，并保持 file tree、detached file explorer、git-history cleanup、task create modal、layout nodes、worktree prompt 行为不回退。
- 边界：只做 dependency remediation 和 ref cleanup，不改 feature 结构、不改用户可见交互。

## 非目标

- 不处理其他 lint 类别。
- 不做跨 feature 重构。
- 不改 Tauri/runtime contract。

## What Changes

- 新建一条收尾 OpenSpec change，覆盖剩余 6 条 warning。
- 补齐 5 个叶子文件中的缺失依赖。
- 修正 `GitHistoryPanelImpl.tsx` 的 cleanup ref-warning。
- 用 lint/typecheck 和 feature 就近测试做最终验收。

## Capabilities

### New Capabilities

- `exhaustive-deps-tail-warning-stability`: 约束仓库尾部剩余 exhaustive-deps warning 必须通过低风险 remediation 收尾，并保持既有行为兼容。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src/features/files/components/FileTreePanel.tsx`
  - `src/features/files/hooks/useDetachedFileExplorerState.ts`
  - `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx`
  - `src/features/kanban/components/TaskCreateModal.tsx`
  - `src/features/layout/hooks/useLayoutNodes.tsx`
  - `src/features/workspaces/components/WorktreePrompt.tsx`
- Affected workflow:
  - `openspec/changes/stabilize-exhaustive-deps-tail-warnings/**`
  - `.trellis/tasks/04-23-stabilize-exhaustive-deps-tail-warnings/prd.md`

## Acceptance Criteria

- 仓库 `react-hooks/exhaustive-deps` warning 降到 `0`。
- `npm run lint`、`npm run typecheck` 和相关 feature 定向测试通过。
- 被触达 feature 的用户行为不回退。
