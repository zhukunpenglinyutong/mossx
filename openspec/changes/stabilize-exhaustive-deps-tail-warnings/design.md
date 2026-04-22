## Context

当前仓库剩余的 `react-hooks/exhaustive-deps` warning 只剩 6 条，分别分布在 `files`、`git-history`、`kanban`、`layout`、`workspaces` 这些叶子文件。它们已经不属于高风险 orchestrator，而是适合最后一轮集中收尾的尾巴。

## Goals / Non-Goals

**Goals:**

- 通过最小改动把最后 6 条 warning 清零。
- 对缺依赖直接补齐，对 ref cleanup warning 使用 React lint 推荐模式修正。
- 用 feature 就近测试确认行为不漂。

**Non-Goals:**

- 不重构相关 feature。
- 不新增共享 helper 或 abstraction。
- 不顺手处理与本轮 warning 无关的问题。

## Decisions

### Decision 1: 5 条缺依赖直接补最小集合

- 选项 A：继续容忍尾巴 warning。
- 选项 B：在叶子文件中直接补齐实际引用的依赖。

选择 B。

原因：这些文件不再是主链热点，补依赖的回归面很小，继续保留只会拖慢 lint 清洁度。

### Decision 2: git-history cleanup 改为稳定 helper，而不是 mount-time snapshot

- 选项 A：在 effect mount 时拍 `createPrProgressTimerRef.current` 快照供 cleanup 使用。
- 选项 B：抽成稳定 cleanup helper，在 unmount 时读取最新 ref 值。

选择 B。

原因：timer ref 会在 mount 后变化，mount-time snapshot 可能拿到初始 `null`，会错过真正的 interval 清理。

## Risks / Trade-offs

- [TaskCreateModal 补依赖后 effect 重跑更频繁] → 保留 `isOpen` guard，不改 effect body。
- [Detached file explorer helper 稳定化后 effect 依赖变化] → 用 `useCallback` 固定 helper，避免每次 render 都触发初始化 effect。
- [最后一轮跨 feature 收尾容易夹带杂质] → 只改 6 个 warning 对应点，不碰其他逻辑。
