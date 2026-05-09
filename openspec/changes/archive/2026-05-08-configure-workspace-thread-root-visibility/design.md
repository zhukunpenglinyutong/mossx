## Context

当前 sidebar root 会话折叠态阈值由前端常量控制，无法区分不同项目的会话密度。用户希望在 `项目管理 -> 会话管理` 中直接调节这个值，并让 sidebar 立即按当前 workspace 生效。

这次改动跨越：
- React 设置页 `SessionManagementSection`
- sidebar / worktree / folder tree 线程列表渲染链
- `update_workspace_settings` 的 frontend->Tauri->Rust 持久化 contract

## Goals / Non-Goals

**Goals:**
- 新增 workspace 级 `visibleThreadRootCount` 设置，默认值 `20`。
- 会话管理页提供可编辑入口，并在保存后即时影响 sidebar。
- `More...` / `Load older...` 统一读取当前 workspace 的生效阈值。
- 前后端双边做 clamp，避免坏数据污染 UI。

**Non-Goals:**
- 不把该设置迁移到全局 `AppSettings`。
- 不调整会话列表查询 `limit`、cursor pagination 或 active projection 算法。
- 不重做会话管理页布局，只做局部配置入口补充。

## Decisions

### Decision 1: 把阈值挂在 `WorkspaceSettings`，而不是 `AppSettings`

- 选择：
  - 在 `WorkspaceSettings` 中新增 `visibleThreadRootCount?: number | null`。
- 原因：
  - 配置入口位于项目级会话管理，用户预期是“每个项目自己记住”。
  - 侧栏本身按 workspace/worktree 分开展示，workspace 级配置更符合现有数据模型。
- 备选：
  - `AppSettings` 全局统一值。
  - 放弃原因：无法表达“这个项目很多，需要 100；另一个项目只想看 10”。

### Decision 2: 用共享 normalize helper 统一默认值与范围

- 选择：
  - 定义默认值 `20`、最小值 `1`、最大值 `200`，并提供共享 normalize/clamp helper。
- 原因：
  - 设置页展示、sidebar 渲染、测试断言都需要同一条规则。
  - 避免再次出现 `useThreadRows` 和 `ThreadList` 各自硬编码漂移。
- 备选：
  - 只在设置页保存时 clamp。
  - 放弃原因：历史数据、手工构造对象或旧版本 payload 仍可能带来脏值。

### Decision 3: 显式把生效阈值沿线程列表链路下传

- 选择：
  - `useThreadRows` 接收 `visibleThreadRootCount` 参数。
  - `ThreadList` / `WorktreeSection` / `WorkspaceSessionFolderTree` 显式接收当前 workspace 的生效阈值。
- 原因：
  - 阈值已经变成 workspace-scoped runtime data，不适合继续隐藏在模块内常量中。
  - 显式 contract 更利于测试不同 workspace 的差异。
- 备选：
  - 在 `useThreadRows` 内部重新读取全局状态。
  - 放弃原因：会把纯派生逻辑重新耦合进 hook / component state。

### Decision 4: 设置页使用轻量数值输入 + 保存动作

- 选择：
  - 在 `SessionManagementSection` 中展示一个 numeric draft 输入和保存按钮，保存时调用 `onUpdateWorkspaceSettings`。
- 原因：
  - 该页面已经是治理面板，显式保存更符合现有 settings 风格，也更安全。
  - 避免用户半输入时立即把无效值写进 workspace settings。
- 备选：
  - 输入即保存。
  - 放弃原因：会放大暂态脏值和频繁跨层写入。

## Risks / Trade-offs

- [Risk] 前端类型、Tauri payload、Rust struct 三处字段名不一致
  → Mitigation: 同步更新 `src/types.ts`、`src-tauri/src/types.rs`、`update_workspace_settings` 路径，并跑 `typecheck` + focused tests。

- [Risk] worktree / folder tree 忘记读取当前 workspace 阈值，导致局部 surface 语义漂移
  → Mitigation: 统一通过同一个 prop / helper 下传，测试覆盖 sidebar 列表阈值行为。

- [Risk] 用户输入 `0`、负数或超大值导致 UI 语义异常
  → Mitigation: 设置页保存前 clamp，sidebar 消费前再次 normalize，最大值与首屏加载窗口保持一致为 `200`。
