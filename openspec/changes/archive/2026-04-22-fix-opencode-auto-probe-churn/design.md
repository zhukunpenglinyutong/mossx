## Context

当前 OpenCode 自动探测有三条主要链路：

1. `useSidebarMenus` 在打开工作区菜单时会 `force` 执行 `getOpenCodeProviderHealth()`。
2. `useSidebarMenus` 在菜单保持打开期间，只要发现 workspace + engine ready，也会再次自动 `prime`。
3. `app-shell.tsx` 为了刷新 Claude pending thread 的模型，会调用 `refreshEngines()`；但 `refreshEngines()` 会刷新所有 engine，并顺带触发 OpenCode detection 路径。

这三条链路叠加后，会在用户根本没有主动使用 OpenCode 的情况下不断拉起 `opencode` CLI，表现为 CPU 抖动、菜单停留在“检测中...”、整体交互发卡。

另一个实现层面的约束是：如果只是删除自动 probe，但手动 refresh 仍然依赖父层 `engineOptions` 重新下发才能更新菜单状态，那么用户会感知到 refresh 按钮“点了没反应”或菜单被意外关闭。  
因此本次不仅要把 probe 改成 manual-only，还要把 workspace menu 的 refresh affordance 做成可在当前弹层内稳定完成诊断回显的交互闭环。

## Goals / Non-Goals

**Goals:**

- 默认不自动探测 OpenCode provider health。
- Claude-only 的模型刷新只影响 Claude，不再放大成 all-engine refresh。
- 保留手动 refresh 的探测能力，避免功能回退。

**Non-Goals:**

- 不改 backend auth command 的具体实现。
- 不改 OpenCode 会话创建、agent list、model list 的用户主动加载链路。
- 不引入新的全局 polling/cache 层。

## Decisions

### Decision 1: 移除 sidebar menu 的自动 OpenCode `prime`

- 选项 A：保留自动 `prime`，只做 debounce / throttle。
- 选项 B：完全移除自动 `prime`，仅保留 refresh action 手动触发。

选择 B。

原因：

- 用户诉求是“只在手动刷新时检测”，不是“少检测一点”。
- debounce 只能减轻频率，不能消除后台副作用。
- sidebar menu 已经有显式 refresh affordance，符合用户心智。

### Decision 2: 把 Claude pending thread 的模型刷新收敛为 engine-scoped refresh

- 选项 A：继续调用 `refreshEngines()`，依赖内部缓存来降低成本。
- 选项 B：新增/复用 engine-scoped model refresh，只刷新 Claude 当前模型。

选择 B。

原因：

- 当前问题的本质是错误的刷新粒度。
- 只因为 Claude 新线程需要模型刷新，就去探测 OpenCode，是典型的 cross-engine side effect。
- engine-scoped refresh 能最直接切断无关引擎开销。

### Decision 3: 不再在 `useEngineController` 默认刷新里自动查询 OpenCode provider health

- 选项 A：保留自动 provider health，继续在 `availableEngines` 上展示 requires-login。
- 选项 B：provider health 改为 explicit refresh-only，默认把已安装 OpenCode 视为 ready，登录状态由用户主动检查。

选择 B。

原因：

- 自动 provider health 本身就是本次 CPU churn 的直接来源之一。
- 登录诊断属于 explicit diagnostic，不应该绑在 app bootstrap / workspace switch 上。
- 用户后续仍可通过 refresh 或 OpenCode 管理面板获取真实连接状态。

### Decision 4: workspace menu 的 refresh 必须在当前弹层内完成状态回显，而不是依赖父层 rerender

- 选项 A：refresh 只触发外层 `onRefreshEngineOptions()`，菜单状态等待父组件重新传入 props 后再变化。
- 选项 B：refresh 接收返回的 engine refresh result，并在 `useSidebarMenus` 内立刻更新当前菜单 action 的 availability / status；同时按钮事件不关闭菜单。

选择 B。

原因：

- 这次把 OpenCode probe 改成 manual-only 后，refresh 按钮就成了用户唯一的显式诊断入口，不能再让它依赖“也许稍后会发生”的父层 rerender。
- 菜单保持打开并立即回显结果，才能让用户看见“CLI not installed / Sign in required / ready”等状态切换，减少误判。
- 对 OpenCode 来说，只有当手动 refresh 结果确认 engine 已安装时，再补做 provider-health probe，才能避免重新引入后台 churn。

## Risks / Trade-offs

- [Risk] OpenCode 在默认态不再提前暴露 requires-login 状态
  → Mitigation：保留手动 refresh 和 OpenCode runtime/control panel 诊断入口。

- [Risk] 现有测试假设菜单打开后会自动 probe，需要同步改断言
  → Mitigation：补回归测试，明确“菜单打开不 probe，手动 refresh 才 probe”。

- [Risk] Claude model refresh 改为 engine-scoped 后可能漏掉原本依赖 all-engine refresh 的隐式行为
  → Mitigation：仅替换 Claude pending thread 那条 path，并保留全局 manual refresh 能力。

## Migration Plan

1. 更新 OpenSpec delta spec，明确 OpenCode readiness probe 改为 manual-only。
2. 修改 frontend hooks，切断自动 provider-health probe 与 cross-engine refresh。
3. 补测试，验证 no auto probe / manual refresh still works。
4. 运行 targeted test + frontend quality gates。

回滚方案：

- 若发现 OpenCode readiness 信息丢失过多，可回滚到本次变更前版本，恢复自动 `prime` 与 `refreshEngines()` 路径。

## Open Questions

- 暂无。当前需求边界清晰，且已有显式 refresh 入口可承载手动检测语义。
