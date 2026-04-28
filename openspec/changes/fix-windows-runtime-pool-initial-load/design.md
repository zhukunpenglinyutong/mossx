## Context

`Runtime Pool Console` 当前是一个只读 snapshot-first 的设置面板：`RuntimePoolSection` 在挂载时调用一次 `getRuntimePoolSnapshot()`，之后只依赖手动刷新或 runtime mutate 后的返回值更新。这个模型在已有 runtime entry 时成立，但在 Windows cold launch + `runtimeRestoreThreadsOnlyOnLaunch=true` 时会失真。

现有启动恢复链路刻意把 workspace/thread metadata restore 与 runtime restore 分离：`useWorkspaceRestore` 会在 `restoreThreadsOnlyOnLaunch` 打开时传入 `allowRuntimeReconnect: false`。这符合 Runtime Orchestrator 的资源控制目标，但也意味着 Runtime 面板打开时，runtime manager 里可能还没有任何可展示 entry。backend `get_runtime_pool_snapshot()` 只是读取当前 manager state，不会主动补 runtime entry。

因此本设计把 Runtime 面板首屏加载定义为一个 UI-level bootstrap flow：用户显式进入 Runtime 运维面板时，frontend 可以触发一次受控 runtime readiness / reconnect 机会；这个动作不同于应用启动恢复，也不能把 snapshot query 本身改成有副作用命令。

## Goals / Non-Goals

**Goals:**

- 首屏区分三种状态：读取 snapshot、恢复 runtime 可见性、真实空态。
- 对 connected 且具备 Codex persistent runtime 价值的 workspace 发起一次 bounded bootstrap。
- bootstrap 后重新读取 snapshot，并用短周期 bounded refresh 吸收 Windows runtime spawn / diagnostics 尾延迟。
- 保持 `runtimeRestoreThreadsOnlyOnLaunch` 的 launch-time metadata-only 语义。
- 保持 macOS / Linux 兼容：如果初始 snapshot 已有 rows，Runtime 面板沿用现有直接渲染路径，不增加 reconnect、等待或额外副作用。
- 用 focused Vitest 覆盖 bootstrap、retry、empty state 和 cleanup。

**Non-Goals:**

- 不改变 app launch restore 策略，不批量启动所有 visible workspace runtime。
- 不把 `getRuntimePoolSnapshot()` 改成会启动 runtime 的命令。
- 不引入永久 polling、runtime event bus 新能力或 backend ledger schema 重构。
- 不把 Runtime Pool Console 变成 streaming latency 诊断修复入口。
- 不为 macOS / Linux 增加平台特化逻辑，不让 Windows 首屏修复改变非 Windows 正常快照渲染路径。

## Decisions

### Decision 1: 保持 snapshot API 只读，把 bootstrap 放在 Runtime 面板入口

`getRuntimePoolSnapshot()` 继续表达“读取当前 runtime manager 状态”。Runtime 面板自己的 bootstrap flow 负责在用户显式进入面板时尝试恢复可见性。

Alternatives considered:

- 让 backend snapshot API 自动 `ensureRuntimeReady()`：接口简单，但会让 refresh/query 变成有副作用操作，后续任何调用者都可能意外启动 runtime。
- 应用启动时统一恢复 runtime：能让 Runtime 面板更容易有数据，但破坏 `restoreThreadsOnlyOnLaunch` 的资源边界。

Rationale:

查询与恢复分离能保留 runtime manager 的可预测性，也让“打开运维面板”这个用户意图在 frontend 明确可见、可测试。

### Decision 2: Runtime 面板接收最小 workspace inventory，而不是耦合 app-shell 巨型上下文

`SettingsView` 已拥有 `allWorkspaces` / grouped workspace 数据。Runtime section 只需要最小字段来识别 eligible workspace：`id`、连接状态、必要的 path/name 诊断信息。当前 `WorkspaceInfo` 没有 per-workspace engine discriminator；本变更不新增 cross-layer 字段，eligible filter 先限定为 connected workspace，并复用现有 Codex runtime acquisition path。实现时优先传递现有 `WorkspaceInfo[]`，不把 thread list、composer state 或 app-shell action 全量下钻。

Alternatives considered:

- 在 `RuntimePoolSection` 内部重新读取 workspace 列表：会增加新的数据源与同步问题。
- 直接传入整个 app-shell context：短期方便，长期会扩大 settings 组件耦合。

Rationale:

这个 change 的行为边界很窄，组件输入也应窄。Runtime 面板只需要判断哪些 workspace 值得 bootstrap，不需要拥有 app-shell 编排权。

### Decision 3: 优先复用现有 `connectWorkspace()` / `ensureRuntimeReady()`，不新增 bridge

现有 `src/services/tauri.ts` 已有 `connectWorkspace(id, recoverySource?)` 和 `ensureRuntimeReady(workspaceId)`。第一版实现应复用其中一个作为 bootstrap action，并传入可诊断 source，例如 `runtime-panel-bootstrap`。

Selection rule:

- 若需要完整 reconnect path 与现有 recovery source 诊断，优先 `connectWorkspace(id, "runtime-panel-bootstrap")`。
- 若只需要确保 Codex runtime ready 且不需要 workspace connect side effect，评估 `ensureRuntimeReady(workspaceId)`。
- 只有当二者都无法表达“Runtime 面板受控恢复”时，才新增 Tauri bridge。

Rationale:

复用现有 runtime acquisition path 可以继承 orchestrator 的 singleflight / idempotency / duplicate guard，避免为 Runtime 面板创建第二套恢复协议。

### Decision 4: Bootstrap state machine 必须 once-per-entry、bounded、cancellable

建议 state model：

- `idle`
- `bootstrapping`
- `snapshot-loading`
- `fallback-refreshing`
- `ready`
- `error`

建议流程：

1. Runtime section mount。
2. 先进入 `snapshot-loading` 并读取一次 runtime pool snapshot。
3. 如果 snapshot 已有 rows，直接进入 `ready` 并渲染 rows；不得触发 bootstrap 或 fallback refresh。
4. 如果 snapshot 为空，再计算 eligible connected workspaces。
5. 若存在 eligible workspace，进入 `bootstrapping` 并按顺序或小并发执行 runtime readiness / reconnect。
6. bootstrap settle 后重新读取 snapshot。
7. 如果 snapshot 仍为空且本轮尝试过 bootstrap，则执行 300ms-500ms、最多 4-6 次的 bounded refresh。
8. 任一 refresh 得到 row 后立即停止；section unmount / switch 时取消后续 state update。

Rationale:

Windows 下 runtime spawn 与 process diagnostics 可能有尾延迟；bounded fallback 是吸收尾延迟的保险丝，而不是主路径。once-per-entry guard 能避免用户切 tab 或 rerender 触发 reconnect 风暴。

### Decision 4.1: 非 Windows 正常路径必须 snapshot-first 直通

macOS / Linux 上如果 runtime manager 已经有 rows，Runtime 面板首屏必须维持现有体验：读取 snapshot 后直接展示，不等待 bootstrap，不触发 reconnect，不运行 fallback timer。Windows 上同样遵循这个直通规则；本 change 只修复“首屏为空但存在可恢复 runtime 价值”的错位状态，不接管所有 Runtime 面板加载。

Alternatives considered:

- 无条件 bootstrap：能最大化恢复机会，但会让 macOS / Linux 的正常路径多一次 runtime readiness 副作用。
- 平台判断只在 Windows 启用：表面上保护 macOS / Linux，但会把行为分裂到平台条件里，并漏掉非 Windows 上同类空首屏错位。

Rationale:

snapshot-first 直通比 platform-only guard 更稳：已有数据时零额外行为；确实空首屏时再进入统一、bounded 的恢复路径。这样既解决 Windows 症状，也不破坏 macOS / Linux 已有正常路径。

### Decision 5: 空态必须在 bootstrap settled 后才可稳定展示

Runtime 面板 rows 区域需要区分：

- transient：正在读取 snapshot 或恢复 runtime 可见性。
- true empty：eligible workspace 不存在，或 bootstrap + fallback 均结束后仍无 rows。

Rationale:

这直接修复用户误判。统计卡片也不应在 transient 阶段用稳定 0 强化“系统真实空闲”的错觉；可以继续显示 skeleton / loading copy，或显示上一次 snapshot 并附带刷新中状态。

### Decision 6: Backend refinement 只作为 P1 观测增强

若第一版 frontend bootstrap 仍无法解释部分 races，可在 backend 中记录 `runtime-panel-bootstrap` recovery source，或提升 starting-but-not-ready row continuity。该 refinement 不应阻塞 frontend-first 修复。

Rationale:

当前问题的主要错位发生在面板入口与恢复链路之间。先收敛 UI lifecycle，避免为了首屏空态直接重构 runtime manager。

## Risks / Trade-offs

- [Risk] 打开 Runtime 面板被误实现成恢复所有 workspace runtime。  
  Mitigation: eligible filter 限定 connected workspace，并保留 snapshot-first、bounded 次数和 stop-on-first-row；不新增 launch-time bulk restore。

- [Risk] bootstrap 与现有 automatic recovery guard 并发，造成重复 reconnect。  
  Mitigation: 复用 `connectWorkspace` / orchestrator idempotency，并在 frontend 加 once-per-entry in-flight guard。

- [Risk] fallback refresh 清理不完整，快速切 section 后仍 setState。  
  Mitigation: effect cancellation flag + timer cleanup，测试覆盖 unmount。

- [Risk] UI 在 transient 阶段仍显示全 0 summary cards，用户继续误判。  
  Mitigation: rows 空态与 summary 文案共同受 bootstrap/loading state 约束。

- [Risk] Windows diagnostics 慢导致 bootstrap 体验仍有等待感。  
  Mitigation: bounded refresh 用短窗口吸收尾延迟；若 diagnostics 仍明显拖慢，再进入 backend source tagging / stale snapshot refinement。

- [Risk] Windows 修复影响 macOS / Linux 正常 Runtime 面板首屏。  
  Mitigation: 强制 snapshot-first 直通；非空 snapshot 不允许进入 bootstrap/fallback；增加非 Windows 或 platform-neutral regression test。

## Migration Plan

1. 增加 Runtime 面板 bootstrap hook 或 section 内部 state machine。
2. 从 `SettingsView` 向 `RuntimePoolSection` 透传最小 workspace inventory。
3. Runtime 面板进入时先读取 snapshot；非空直接渲染，空 snapshot 才执行 once-per-entry bootstrap。
4. 增加 transient loading UI 与真实空态判定。
5. 增加 bounded refresh fallback 与 cleanup。
6. 补齐 targeted Vitest。
7. 若需要 backend observability，再补 `runtime-panel-bootstrap` source tag。

Rollback strategy:

- frontend 回滚：移除 workspace props、bootstrap hook/state 与 bounded refresh，恢复为单次 snapshot read。
- backend 若有 optional source tag：删除 source tag 相关断言即可，不影响 runtime manager 主流程。

## Open Questions

- Eligible workspace 的精确判定是否只看 `engineType === "codex"`，还是还应纳入 provider/profile 是否启用 persistent session。
- Runtime 面板每次进入是否都执行一次 bootstrap，还是只在 settings modal 生命周期内第一次进入执行。
- transient 阶段 summary cards 是显示 skeleton、上一次 snapshot，还是以 badge 标明“正在刷新状态”。
