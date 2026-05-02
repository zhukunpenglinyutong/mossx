## Why

Windows 用户冷启动后立即进入 `Settings > Runtime` 时，`Runtime Pool Console` 经常稳定显示全 0 或空列表，但稍后重新进入、手动刷新或其他恢复链路触发后又能看到 runtime rows。这个体验把“runtime 恢复尚未开始或尚未完成”的瞬时状态误报成“系统真实空闲”，削弱了 Runtime Pool 作为运维面板的可信度。

当前代码证据表明根因不是单纯刷新次数不足，而是首屏 snapshot 与 runtime reconnect/recover 生命周期错位：`RuntimePoolSection` 挂载时只读取一次 `getRuntimePoolSnapshot()`；`useWorkspaceRestore` 在 `runtimeRestoreThreadsOnlyOnLaunch=true` 时不会触发 runtime reconnect；backend `get_runtime_pool_snapshot()` 只读取 runtime manager 当前 entries，不会主动创建可展示的 runtime entry。

## 目标与边界

### 目标

- 修复 Windows 下 Runtime Pool 首屏初始加载空态误导问题，确保用户进入 Runtime 面板时能看到明确的 transient loading / bootstrap 状态。
- 在用户显式进入 Runtime 运维面板时，提供一次受控的 runtime 可见性恢复机会，而不是只读一个可能为空的瞬时 snapshot。
- 保持 `runtimeRestoreThreadsOnlyOnLaunch` 的全局语义：应用启动恢复线程元数据时，不批量拉起所有 workspace runtime。
- 对 Windows spawn、process diagnostics 或 runtime readiness 的尾延迟提供短周期 bounded refresh 兜底。
- 保持 macOS / Linux 现有 Runtime Pool 首屏行为兼容：已有 rows 的 snapshot 必须直接渲染，不得因为 Windows 修复额外触发 reconnect、额外等待或改变空态判断。

### 边界

- 本 change 聚焦 `Settings > Runtime` 的初始加载与空态判定，不重做 Runtime Pool Console 视觉设计。
- 不改变应用启动时 workspace restore 的默认策略，不把所有可见 workspace 自动恢复为 runtime-ready。
- 不引入新的 runtime ledger schema，不重构 runtime manager entries 模型。
- 第一阶段优先 frontend bootstrap 与测试；仅当现有 `connectWorkspace` / `ensureRuntimeReady` 无法表达面板恢复意图时，才考虑 backend source tagging 或 snapshot continuity refinement。
- 兼容性边界：bootstrap 必须是 snapshot-first 的补救路径。初始 snapshot 已经有 runtime rows 时，无论 Windows、macOS 还是 Linux，都必须直接展示 rows，不进入 reconnect/bootstrap/fallback。
- 平台边界：本变更不得引入 Windows-only API 到 frontend 主路径；平台差异只体现在手工验证与尾延迟风险解释中，代码行为必须对 macOS / Linux 保持可预测。

## 非目标

- 不修复 Claude/Codex streaming latency；该问题由独立 change 处理。
- 不把 Runtime Pool Console 改造成高频实时监控面板或永久 polling 面板。
- 不隐藏真实空态：当确实不存在可恢复的受管 runtime 时，面板最终仍应展示空态。
- 不通过修改 `restoreThreadsOnlyOnLaunch` 默认值绕过问题。

2026-04-27 标记：Windows native Claude Code 普通对话已在当前代码下测试正常，但该结果不归因于本 change。本 change 仅负责 Runtime Pool Console 首屏 visibility / bootstrap 体验，不能用来关闭 Claude streaming latency 或 final-only burst-flush 的验收项。

## What Changes

- 修改 `runtime-pool-console` 行为契约：Runtime 面板首屏不得把“恢复尚未开始/尚未完成”的瞬时空 snapshot 直接当作稳定空态展示。
- Runtime 面板进入时新增受控 bootstrap flow：
  - 先读取一次 runtime pool snapshot；如果已经存在 rows，直接渲染并结束首屏流程。
  - 识别当前 connected 且具备 Codex persistent runtime 恢复价值的 workspace。
  - 仅当首屏 snapshot 为空且存在 eligible workspace 时，对 eligible workspace 发起一次幂等、bounded 的 runtime readiness / reconnect 尝试。
  - bootstrap 完成后重新拉取 runtime pool snapshot。
- 增加 transient UI state：
  - `snapshot-loading`: 正在读取 snapshot。
  - `bootstrapping`: 正在尝试恢复 Runtime Pool 可见性。
  - `ready-empty`: bootstrap 与 bounded refresh 均完成后的真实空态。
- 增加短周期 bounded refresh fallback，用于吸收 Windows runtime spawn 与 process diagnostics 尾延迟；该 fallback 必须有最大次数、可取消，且拿到任一 row 后立即停止。
- 保持 refresh button 的手动刷新语义独立，不与首屏 bootstrap 的 once-per-entry guard 混在一起。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 应用启动时强制恢复所有可见 workspace runtime | Runtime Pool 首屏更容易有数据 | 破坏 `restoreThreadsOnlyOnLaunch` 语义，增加冷启动 CPU/IO 和进程数量，影响面过大 | 不采用 |
| B | Runtime 面板只做定时轮询 snapshot | 实现简单，能偶发刷出数据 | 没有桥接恢复链路；用户仍会先看到误导空态，且容易演变成无界 polling | 不采用 |
| C | Runtime 面板进入时触发一次受控 bootstrap，结束后 bounded refresh 兜底 | 精准匹配“用户显式打开运维面板”的意图；不改变全局启动策略；可测试、可回滚 | 需要传入 workspace context，并处理 cancellation / in-flight guard | **采用** |
| D | backend snapshot API 自动 ensure runtime ready | frontend 接口简单 | snapshot 从只读查询变成有副作用命令，语义混乱，可能导致每次刷新都启动 runtime | 不采用 |
| E | snapshot-first 兼容修复：已有 rows 直接渲染，只有空首屏才进入 bootstrap | 最大化保护 macOS/Linux 与已有正常路径；减少无意义 reconnect | 需要把空态、加载态、bootstrap 态分清楚 | **作为 C 的具体执行边界采用** |

## Capabilities

### New Capabilities

- 无。此变更收敛在现有 Runtime Pool Console 与 Runtime Orchestrator 能力内。

### Modified Capabilities

- `runtime-pool-console`: 增加首屏 bootstrap / transient empty contract，要求 Runtime 面板区分恢复中、加载中和真实空态。
- `runtime-orchestrator`: 明确用户显式进入 Runtime 面板可触发受控 runtime readiness/reconnect 尝试，但该动作不得改变应用启动时“只恢复线程元数据”的策略。

## 验收标准

- Windows 冷启动且 `runtimeRestoreThreadsOnlyOnLaunch=true` 时，用户立即打开 `Settings > Runtime`，面板 MUST 先展示 loading/bootstrap 状态，而不是直接稳定显示全 0 空态。
- macOS / Linux 或 Windows 的已有 runtime rows 场景下，初始 snapshot 非空时，面板 MUST 直接渲染现有 rows，不得额外等待 bootstrap 或触发 runtime reconnect。
- 当存在 connected 且可由 Codex persistent runtime 管理的 workspace 时，Runtime 面板 MUST 触发一次受控 runtime readiness/reconnect 机会，并在结束后重新读取 snapshot。
- 如果首个 snapshot 为空但后续 bounded refresh 获取到 rows，面板 MUST 展示 rows，不得永久停留空态。
- 如果不存在 eligible workspace 或最终确实没有可恢复 managed runtime，bootstrap 与 bounded refresh 结束后 MUST 展示真实空态。
- 快速切换 settings section 或卸载 Runtime 面板时，MUST 清理 timer / ignore late async completion，不得产生 React unmounted state update warning。
- 同一轮进入 Runtime section 不得并发触发多轮 reconnect；重复点击手动刷新不得绕过 bootstrap 的 in-flight guard。
- `runtimeRestoreThreadsOnlyOnLaunch` 的启动恢复语义 MUST 保持不变：应用启动恢复线程列表时仍不批量拉起 runtime。

## Impact

- Affected frontend:
  - `src/features/settings/components/settings-view/sections/RuntimePoolSection.tsx`: 首屏 snapshot loading、bootstrap state、bounded refresh、空态判定。
  - `src/features/settings/components/SettingsView.tsx`: 如 Runtime section 需要 workspace inventory，需要最小化透传 `allWorkspaces` 或等价 workspace context。
  - 可选新增 `src/features/settings/hooks/useRuntimePoolBootstrap.ts`: 将 bootstrap state machine 从大组件中抽离，避免把恢复逻辑散落在 UI render 中。
  - `src/services/tauri.ts`: 优先复用已有 `connectWorkspace()` 或 `ensureRuntimeReady()`，不新增 bridge 除非现有语义不足。
- Affected tests:
  - `src/features/settings/components/settings-view/sections/RuntimePoolSection.test.tsx`
  - 可选 `src/features/settings/hooks/useRuntimePoolBootstrap.test.ts`
- Affected backend:
  - 第一阶段无强制 backend 改动。
  - 可选 refinement：`src-tauri/src/runtime/mod.rs` / `src-tauri/src/codex/session_runtime.rs` 记录 `runtime-panel-bootstrap` recovery source，或增强 starting-but-not-ready snapshot continuity。
- Dependencies:
  - 不新增第三方依赖。
- Validation:
  - `npm run test -- RuntimePoolSection`
  - 如新增 hook：`npm run test -- useRuntimePoolBootstrap`
  - `npm run typecheck`
  - `npm run lint`
  - macOS / Linux regression smoke：已有 runtime rows 的 Runtime 面板首屏直接展示，不触发 bootstrap 等待
  - 若触及 backend：`cargo test --manifest-path src-tauri/Cargo.toml runtime`
