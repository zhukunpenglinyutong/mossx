## Context

右侧文件树的主数据源是 `useWorkspaceFiles`。当前 hook 在 `workspaceId` 或 `connected` 变化时立即清空 `files/directories`，再由另一个 effect 触发 `getWorkspaceFiles`。这让“当前 workspace snapshot 尚未确认”与“当前 workspace 已确认为空”都表现成空数组。

`FileTreePanel` 又会在空数组且非 loading 时渲染空态，因此用户点击左侧项目或会话后，会看到项目根节点下显示“无可用文件”。页面切换或后续刷新重新触发加载后，真实文件列表恢复。

## Goals / Non-Goals

**Goals:**

- 文件树刷新状态机必须区分 pending / loaded-empty / loaded-non-empty。
- workspace 切换、connection 抖动或慢请求期间不得展示确定空态。
- 保留 stale response guard，旧 workspace 响应不能覆盖新 workspace。
- 保持 embedded file panel 与 detached file explorer 共享行为。

**Non-Goals:**

- 不修改 Rust 文件扫描。
- 不改变 Tauri command payload。
- 不重构 FileTreePanel 的交互模型。
- 不改变 progressive loading 的特殊目录策略。
- 不重设文件树整体视觉；只修正 pending loading indicator 可见性与一致性。

## Decisions

### Decision 1: 在 hook 层维护 snapshot lifecycle

`useWorkspaceFiles` 增加当前加载完成的 workspace 标记，并让 `isLoading` 覆盖“当前 workspace 尚未完成首轮加载”的状态。切换 workspace 时可以清理不匹配 snapshot，但不能同时把状态表达成 loaded-empty。

Alternatives:

- 只在 `FileTreePanel` 层隐藏空态：改动更小，但会让其它 consumer 继续拿到错误空态。
- 引入全局 cache：能减少空白，但超出当前 bug 需要，增加 stale data 风险。

Rationale:

hook 是 file tree runtime snapshot 的 single source of truth，把 pending 语义放在这里能让 main/detached 两处消费一致。

### Decision 2: 空态必须基于完整 tree entries

`FileTreePanel` 的 loading/empty 判断必须同时考虑 files 与 directories。只有目录没有文件也是有效项目树，不应显示空态。

Alternatives:

- 只继续看 files：保留现状，但会误伤目录型 workspace 或初始只返回目录的扫描结果。

Rationale:

file tree 的实体是 `files + directories`，空态判断只看文件违背当前后端 payload contract。

### Decision 3: 不改变 backend contract

继续使用现有 `getWorkspaceFiles(workspaceId)`，只修正 frontend lifecycle。

Alternatives:

- 让后端返回 `loaded` 或 `snapshotId`：语义更强，但需要跨层 contract，当前问题可在前端最小修复。

Rationale:

本 bug 是前端把未知态误渲为空态，不需要扩展后端。

### Decision 4: pending loading 使用内联 spinner 而非大面积 skeleton

`FileTreePanel` 的 pending 态应在 root 下方显示克制的 inline loading row：小型 spinner + `files.loadingFiles` 文案。它比大面积 skeleton 更适合窄文件树，也能沿用项目里 `LoaderCircle` + spin 的统一 loading 语言。

Alternatives:

- 大面积 skeleton：可见性强，但在文件树里显得笨重，且会制造“很多文件占位”的错误预期。
- 继续使用白色透明度：深色主题可接受，但浅色主题仍像空白。

Rationale:

本问题的用户感知是“没有 loading 过程”。内联 spinner 能清楚表达 pending，又不会污染文件树的结构密度。

## Risks / Trade-offs

- [Risk] 保留旧 workspace snapshot 可能短暂显示错项目文件 → Mitigation：workspaceId 改变时仍清理不匹配 entries，但状态保持 loading/pending。
- [Risk] connected=false 时 loading 长时间存在 → Mitigation：仅在有 active workspace 且尚未完成当前 workspace snapshot 时保持 pending；真实断开错误由现有 workspace/runtime 状态表达。
- [Risk] 测试 fake timers 与 effect 顺序脆弱 → Mitigation：focused hook tests 明确断言 `isLoading`、files、stale response。

## Migration Plan

1. 更新 `useWorkspaceFiles` 状态机。
2. 更新 `FileTreePanel` 空态判断。
3. 添加 focused Vitest。
4. 运行 `pnpm vitest run src/features/workspaces/hooks/useWorkspaceFiles.test.tsx src/features/files/components/FileTreePanel.run.test.tsx`。
5. 如需完整门禁，运行 `npm run typecheck`。

Rollback:

- 回退本 change 的前端代码与 OpenSpec artifacts 即可；无数据迁移和后端 schema 变更。

## Open Questions

- 无。
