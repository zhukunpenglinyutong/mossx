## Why

用户在左侧点击项目或会话后，右侧文件树会短暂显示“无可用文件”，但切换任意页面后又恢复。这个问题会让用户误判项目目录为空，本质是前端在 workspace/session 切换时把未知加载态错误降级成确定空态。

## 目标与边界

- 修复右侧 embedded file tree 在 workspace/session 切换、workspace 状态刷新、短暂 disconnected/connected 抖动期间的瞬态空态。
- 保持现有 Tauri `list_workspace_files` contract 不变。
- 保持 detached file explorer 与 embedded file panel 共用的文件树数据获取 hook 行为一致。

## 非目标

- 不重写文件扫描后端。
- 不改变特殊目录 progressive loading 语义。
- 不重设文件树整体视觉、context menu、文件打开多 Tab 行为；仅允许修复 pending loading indicator 的可见性与一致性。

## What Changes

- 文件树数据 hook MUST 区分“尚未完成当前 workspace 首次加载”和“已确认当前 workspace 为空”。
- 切换 workspace 或 workspace connection 状态刷新时，UI MUST NOT 将 pending snapshot 渲染为“无可用文件”。
- pending snapshot 的 loading indicator MUST 在浅色/深色主题下都可见，且 SHOULD 复用项目内的小型 inline loading 视觉语言。
- async 刷新仍 MUST 忽略旧 workspace 的 stale response，避免旧数据覆盖新 workspace。
- 文件树空态判断 SHOULD 同时考虑 files 与 directories，避免只有目录的 workspace 被误判为空。

## Capabilities

### New Capabilities

- `workspace-filetree-refresh-state`: 定义 workspace file tree 刷新、切换和空态的状态一致性 contract。

### Modified Capabilities

- `workspace-filetree-root-node`: 补充 root node 下空态显示必须基于已完成的当前 workspace snapshot。

## 技术方案

### 方案 A：在 `useWorkspaceFiles` 增加 snapshot lifecycle 状态（推荐）

- hook 维护当前 snapshot 所属 workspace、是否已完成当前 workspace 加载、是否 pending。
- workspace 切换或连接态抖动时不立刻把未知态标记为空，而是进入 loading/pending。
- 优点：single source of truth 在数据层，embedded 与 detached 两处自然一致。
- 缺点：需要补充 hook 级 race/transition 测试。

### 方案 B：只在 `FileTreePanel` 屏蔽空态

- UI 层在 `isLoading` 或 workspace 切换期间隐藏“无可用文件”。
- 优点：改动小。
- 缺点：空态语义仍分散在 UI，后续其它 consumer 仍可能复现；无法根治 stale snapshot lifecycle。

### 取舍

采用方案 A，必要时辅以极小 UI 空态判断修正。原因是问题根因在数据 hook 的状态机，而不是展示文案。

## 验收标准

- 点击左侧项目/会话切换期间，右侧文件树不得先闪成“无可用文件”再恢复。
- 当前 workspace 文件刷新慢或 connection 短暂抖动时，文件树展示 loading/pending 或保留安全快照，不展示错误空态。
- 真实空目录仍能显示空态。
- 旧 workspace 的慢响应不会覆盖当前 workspace。
- focused Vitest 覆盖切换、抖动和 stale response 场景。

## Impact

- 前端 hook：`src/features/workspaces/hooks/useWorkspaceFiles.ts`
- 前端组件：`src/features/files/components/FileTreePanel.tsx`
- 测试：`src/features/workspaces/hooks/useWorkspaceFiles.test.tsx`，必要时补充 `FileTreePanel` focused test
- API/依赖：无新增依赖；无 Tauri/Rust command contract 变更
