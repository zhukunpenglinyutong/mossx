## Context

当前工作区会话体系里至少存在两套“项目会话”来源：

1. `Session Management`
   - 通过 `src-tauri/src/session_management.rs` 读取真实 catalog
   - main workspace 会聚合 child worktrees
   - 支持 `active / archived / all`
   - 能暴露 `partialSource`

2. sidebar / `Workspace Home`
   - 主要依赖 `threadsByWorkspace`、运行时线程状态与局部 recent slice
   - 默认只看 active/unarchived
   - 不天然知道 project scope、page total、partial source

因此，同一 workspace 在两个 surface 上看到的数量差异并不一定是 bug，但它被实现成了“不可解释差异”。用户会把这种差异理解成路径写死、漏读 worktree、或者 archive 状态失真。

这个 change 的关键不是再补一个 hint，而是建立一个明确的 ownership：

- backend 负责真实 catalog scope 与 projection summary
- frontend surface 负责窗口化展示、runtime 状态 overlay 与 copy

## Goals / Non-Goals

**Goals:**

- 用一套共享 `workspace session catalog projection` contract 定义 main/worktree scope。
- 让默认主界面的 active projection 与 `Session Management(strict + active)` 有同源可追溯性。
- 让 `Session Management` 明确区分 filtered total 与 current page visible。
- 让 partial/degraded source 在所有相关 surface 上可解释。
- 保持 archive/unarchive 既有行为，不引入新的存储层。

**Non-Goals:**

- 不在本轮替换全部 `threadsByWorkspace` 运行时状态模型。
- 不在本轮改造 `related` catalog 归因逻辑。
- 不在本轮重做 sidebar / homepage 视觉布局。
- 不在本轮实现新的持久化缓存格式。

## Decisions

### Decision 1: backend 统一产出 scope resolver 与 projection summary

**Decision**

在 `session_management` 侧引入共享 `workspace session catalog projection summary`，复用现有 `catalog_workspace_scope()` 作为唯一 scope resolver，并为指定 workspace 返回：

- `scopeKind` (`project` / `worktree`)
- `ownerWorkspaceIds`
- `activeTotal`
- `archivedTotal`
- `allTotal`
- `partialSources`
- 可选 `visibleWindowHint` / `lastUpdatedAt`

**Why**

- scope 归属与 partial source 本来就在 backend 更容易保证一致。
- 如果由 frontend 从多个 surface 自己推导，worktree aggregation、engine degradation、archive 状态会继续漂移。

**Alternative considered**

- 在 frontend 基于 `threadsByWorkspace + listWorkspaceSessions()` 临时拼 summary：
  - 优点：实现快
  - 风险：继续复制 scope 逻辑，Windows/macOS 路径和 worktree 边界更容易失真

### Decision 2: 主界面 surface 以共享 active projection 决定 membership，runtime state 仅做 overlay

**Decision**

sidebar 与 `Workspace Home` 的默认会话集合改为消费共享 catalog 的 `strict + active + unarchived` projection。`threadsByWorkspace`、`threadStatusById`、`lastAgentMessageByThread` 仍保留，但只负责：

- processing / reviewing / unread 等 runtime 状态
- active thread 选中态
- 点击后 reopen / hydrate 辅助

它们不再单独决定“这个项目到底有哪些默认可见会话”。

**Why**

- 只有这样，sidebar/home 与 `Session Management(strict + active)` 才能天然共享一套 membership 语义。
- runtime overlay 仍然保留即时性，不会牺牲交互反馈。

**Alternative considered**

- 保持 sidebar/home 用本地线程列表，只把 count 改成 summary：
  - 优点：改动小
  - 风险：数字看起来统一了，但列表成员仍可能不同，问题只是被掩盖

### Decision 3: `Session Management` 必须显式表达 total vs visible page

**Decision**

`Session Management` 继续使用真实分页 catalog，但页面文案和 selection 工具条必须明确区分：

- `filtered total`：当前 filter/scope 下完整结果总量
- `page visible`：当前已加载页里的条目数
- `selected count`：当前已选中的条目数

**Why**

- 目前最容易误导用户的点之一，就是把当前 page 的 `entries.length` 误读成“项目总量”。
- 一旦分页、partial source 或 worktree aggregation 参与，`entries.length` 不再具有 total 语义。

**Alternative considered**

- 继续在标题里只显示一个简化 count：
  - 优点：界面简洁
  - 风险：含义不清，根因不会消失

### Decision 4: partial/degraded source 要进入 shared contract，而不是散落在单个页面 copy

**Decision**

`partialSource` / degraded marker 进入 projection summary，使 sidebar、`Workspace Home`、`Session Management` 都能在需要时渲染同一语义的说明。

**Why**

- 现在 partial source 只在 `Session Management` 能被感知，其他 surface 会把“只拿到部分结果”误表现成“项目就这么多会话”。

**Alternative considered**

- 只在 `Session Management` 保留 degraded 提示：
  - 优点：无需动主界面
  - 风险：不同 surface 会继续展示相互矛盾的“确定性事实”

## Risks / Trade-offs

- [Risk] sidebar/home 改为 shared projection 后，首次加载成本高于纯本地线程列表
  - Mitigation: 提供 lightweight summary + windowed active entries 接口，避免把完整分页 catalog 直接搬到主界面。

- [Risk] 共享 projection 与现有 runtime thread cache 叠加时，可能出现短暂 membership 切换
  - Mitigation: 使用 projection 作为 membership source，runtime cache 仅补状态；为空态时沿用既有 stable empty-state 规则，禁止抖动刷新。

- [Risk] 项目 scope、worktree scope 与 `related` scope 的边界可能继续被误用
  - Mitigation: 本 change 明确只统一 `strict` + default main-surface projection，不把 `related` 混进默认主界面。

- [Trade-off] 这次会增加一个新的 summary contract / hook 层
  - 这是有意为之。没有中间 contract，就无法长期约束多个 surface 的语义一致性。

## Migration Plan

1. 在 backend `session_management` 中补 projection summary 类型与返回路径，复用现有 scope resolver。
2. 在 `src/services/tauri/sessionManagement.ts` / `src/services/tauri.ts` 增加 summary DTO 与调用封装。
3. 在 frontend 新增共享 hook / adapter，统一为：
   - `Session Management`
   - sidebar
   - `Workspace Home`
   提供同源 `strict + active` projection 数据与 degraded metadata。
4. 调整 `Session Management` count 文案，分离 total / visible / selected。
5. 让 sidebar / `Workspace Home` 从共享 projection 读默认会话 membership，再叠加 runtime status。
6. 补齐 targeted tests，并用 lint/typecheck/test 做回归验证。

**Rollback**

- 若主界面消费 shared projection 带来明显性能或回归风险，可先保留 backend summary 与 `Session Management` count 修复，同时让 sidebar/home 暂时只消费 summary 但不切换 membership source。
- 即使回滚主界面 membership 统一，也不应回滚 shared scope resolver 与 total/visible 分离，因为这是问题根因的最小修复。

## Open Questions

- sidebar 是否需要展示显式 `active total` badge，还是只在 `Workspace Home` / `Session Management` 暴露该信息。
- 主界面默认会话窗口的条数上限采用复用现有 recent slice，还是新增独立 projection window 参数。
