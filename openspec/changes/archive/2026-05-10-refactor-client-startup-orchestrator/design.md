## Context

客户端打开后的加载链路目前由多个 React hooks 自发触发：bootstrap 先读 client stores，`AppShell` 挂载后 settings、workspace、engine/model、skills、prompts、commands、workspace files、git、threads/sessions、session radar、dictation 等 hooks 并行发起 IPC。单个 hook 看起来合理，但组合后没有全局启动预算、没有统一去重、没有取消语义，也没有足够 trace 证据解释卡顿来源。

本设计把启动期副作用收敛到 frontend `Startup Orchestrator`。它不接管业务数据模型，也不替代 backend `runtime-orchestrator`；它只负责“客户端启动与前台恢复期间，哪些加载任务可以何时运行”。

## Goals / Non-Goals

**Goals:**

- 明确启动阶段：`critical`、`first-paint`、`active-workspace`、`idle-prewarm`、`on-demand`。
- 将启动任务注册为可审计的 task descriptor，而不是隐式 mount-time side effect。
- 支持 priority、dedupe、timeout、cancel、fallback 和 trace。
- 保证首屏 shell 可交互优先，active workspace minimal hydration 优先。
- 将大仓库/多 workspace 下的重型扫描迁移到 idle 或 on-demand。
- 通过分批迁移降低风险，先迁移最容易造成卡顿的启动任务。

**Non-Goals:**

- 不改变 thread/session、workspace file tree、git diff、engine/model 的业务数据结构。
- 不把 managed runtime 生命周期并入客户端启动 orchestrator。
- 不引入第三方调度框架。
- 不要求一次性迁移所有 hooks；允许保留不影响启动关键路径的现有 hook。
- 不把所有 IPC 合并成一个 backend bootstrap command。

## Decisions

### Decision 1: 使用 frontend task registry，而不是 backend 聚合启动接口

启动问题的主要矛盾是“何时加载、是否可取消、是否可降级、是否重复触发”，而不是单纯 IPC 数量。backend 聚合接口会减少调用次数，但会把重型 file/git/session/model 扫描集中成一个更大的阻塞点，且更难按 UI 可见性取消。

选择 frontend task registry：

- 每个 task 声明 phase、priority、workspace scope 和 fallback。
- UI 可见性和 active workspace 状态可以直接参与调度。
- 后续迁移可以按 feature hook 分批推进。

替代方案：

- 局部给 hooks 加 debounce：短期有效，但规则仍分散。
- 后端 bootstrap command：IPC 简化，但取消和降级能力差。

### Decision 2: task descriptor 是唯一启动入口

启动期任务必须通过 descriptor 注册：

```ts
type StartupPhase =
  | "critical"
  | "first-paint"
  | "active-workspace"
  | "idle-prewarm"
  | "on-demand";

type StartupCancelPolicy = "none" | "cancel-on-workspace-change" | "yield-to-foreground";

interface StartupTaskDescriptor<T> {
  id: string;
  phase: StartupPhase;
  priority: number;
  dedupeKey: string;
  timeoutMs: number;
  concurrencyKey: string;
  workspaceScope: "global" | { workspaceId: string };
  cancelPolicy: StartupCancelPolicy;
  traceLabel: string;
  run: (context: StartupTaskContext) => Promise<T>;
  fallback: (reason: StartupFallbackReason) => T | Promise<T>;
}
```

实现可以调整类型细节，但 contract 不应变：任务必须能被识别、排序、去重、超时、取消和追踪。

`concurrencyKey` 用于表达资源预算维度，例如 `thread-session-scan`、`workspace-file-tree`、`git-diff`、`engine-model-catalog`。它和 `dedupeKey` 不同：`dedupeKey` 解决“同一件事不要重复做”，`concurrencyKey` 解决“同类重活不要同时做太多”。

### Decision 3: phase 语义固定，任务归属可迭代

阶段定义：

- `critical`: render 前必须完成的最小依赖，例如 client stores、settings、workspace list。
- `first-paint`: shell 首屏渲染与 cached/sidebar skeleton 所需的轻量任务。
- `active-workspace`: 当前 workspace 可操作所需的 bounded hydration，例如 thread/session first page、git status once、minimal engine/model selection。
- `idle-prewarm`: 不阻塞交互的预热，例如 skills/prompts/commands catalog、non-active session catalog、engine model catalog。
- `on-demand`: 需要 UI 可见性或用户动作的重型任务，例如 full file tree、git diff preload、完整 session merge、dictation model status。

任务归属在迁移中可以调整，但必须满足 spec 中的首屏边界和 heavy data 规则。

### Decision 4: 去重基于 dedupeKey，取消基于 workspace scope 与 foreground priority

`dedupeKey` 由 command class、workspaceId、panel visibility、task parameters 组成，避免多个 hooks 或 focus events 重复发起同类 IPC。workspace-scoped cancellable tasks 在 active workspace 切换后必须取消或降级，防止旧 workspace 抢占新 workspace 的资源。

不可取消的任务必须短、幂等、可超时；否则不得放入启动阶段。

### Decision 5: trace 先落在 frontend diagnostics，再逐步补 backend label

第一阶段记录 frontend task 生命周期：queued、started、completed、failed、timed_out、cancelled、degraded。每条记录包含 task id、phase、trace label、workspace scope、timestamps、duration、fallback status。

backend 侧先不改 command contract，只在重型 command 调用路径补 label/耗时日志或诊断事件。这样能先获得定位价值，同时避免扩大 API 改动面。

### Decision 6: 启动预算是硬约束，不是观测建议

orchestrator 必须维护 startup budget：

- `shell-ready`: 主窗口 shell 已渲染，基础布局和缓存 sidebar 可见。
- `input-ready`: composer 或主要输入控件可响应，不被启动任务阻塞。
- `active-workspace-ready`: active workspace 的 bounded first-page 数据和 minimal engine/model/git status 可用。
- `idle-delay`: 首屏后至少等待一小段时间再启动 opportunistic prewarm，避免和首屏 commit 抢主线程。
- `idle-slice-budget`: 每轮 idle 执行的最大 wall time，超出后必须 yield。
- `phase-concurrency-cap`: 每个 phase 同时运行的 task 上限。
- `heavy-command-cap`: file/git/session/model 等 heavy command class 的并发上限。

默认值应保守，并通过 trace 校准；实现时可以把具体数字放在常量或内部配置中，但不能没有预算层。

### Decision 7: cancellation 分层表达，避免伪取消

Tauri/Rust command 不是天然可取消。设计上取消分四层：

- `soft-ignore`: command 继续执行，但结果带 generation/workspace token 校验；过期结果不得写入当前 UI 状态。
- `cooperative-abort`: frontend 传递 abort intent，backend 或 long-running loop 自愿检查并提前返回。
- `yield-only`: idle task 暂停后续步骤，但当前短操作自然完成。
- `hard-abort`: 仅用于确实支持 AbortSignal 或可安全中断的任务。

第一阶段默认使用 `soft-ignore` 和 `yield-only`，不要承诺所有 backend command 都能 hard abort。

### Decision 8: React 接入使用稳定外部 store，避免调度器反向制造 render 风暴

orchestrator core 不应依赖 React，也不应在每个 trace event 上驱动 AppShell 大面积 state update。React 层只订阅必要 selector：

- shell 只订阅 phase milestone 和少量 degraded state。
- diagnostics 面板订阅 trace ring buffer。
- feature panel 只订阅自身 task 的 status。

实现上优先使用稳定 store + selector 或 `useSyncExternalStore` 风格接入。需要 UI 过渡时，React 层可以使用 transition，但 scheduler core 不应直接持有 component state setter。

### Decision 9: 迁移期必须治理 legacy 双路径

迁移过程中最大的风险不是 orchestrator 本身，而是旧 hook 和新 task descriptor 同时调用同一个 IPC。每迁移一个 feature，需要先做 legacy startup side-effect audit：

- 列出该 feature 启动时会触发的 IPC。
- 给每个 IPC 指定唯一 owner：legacy hook 或 orchestrator task。
- 迁移后用 test/spy/trace 证明同一个 owner 不会双发。
- 新增启动 IPC 时必须先注册 descriptor 或明确声明不是 startup-time work。

### Decision 10: 跨平台兼容和 CI sentry 是实现门禁

Startup Orchestrator 属于客户端启动关键路径，不能写成“本机 macOS 能跑”的实现。所有实现必须兼容 GitHub Actions 的 Ubuntu、macOS、Windows matrix。

跨平台约束：

- 路径处理必须使用现有跨平台 path 工具或 Tauri/Rust/Node 标准能力，禁止拼接 `/` 假设。
- 测试不得依赖文件系统大小写、路径分隔符、平台默认 shell、locale 或时区。
- timer、idle scheduling、fake timers 必须可在 Node/Vitest 和三平台 CI 上稳定复现。
- diagnostics/log 输出必须稳定，避免 Windows 换行、路径、耗时抖动导致 snapshot 或 parser 噪声。
- Tauri/Rust command trace 不得假设 Unix process model；Windows wrapper/process-tree 差异只作为诊断 label，不作为前端调度前提。

CI gate 约束：

- Large File Governance Sentry 必须继续通过：`node --test scripts/check-large-files.test.mjs`、`npm run check:large-files:near-threshold`、`npm run check:large-files:gate`。
- Heavy Test Noise Sentry 必须继续通过：`node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`、`npm run check:heavy-test-noise`。
- 新增测试必须控制日志输出，禁止为调试方便大量打印 task lifecycle 或 trace。
- 新增 trace fixtures、baseline samples 或 diagnostics snapshots 必须控制体积；大样本应通过生成器或小型 fixture 表达。
- 实现不得新增 TypeScript、ESLint、Vitest、Node test、Rust 编译或测试告警；若 CI 已有历史噪声，迁移 PR 必须证明噪声数量未增加。

## Migration Plan

1. 建立 orchestrator core、task descriptor 类型、trace store 和 focused tests。
2. 先做 read-only trace spike：记录现有启动任务、IPC、里程碑和耗时，不改变加载行为。
3. 补 startup budget、concurrency cap、cancellation policy 和 React store 接入。
4. 接入 bootstrap/AppShell 边界，只让关键路径通过 orchestrator 标记并 trace，不改变业务行为。
5. 迁移低风险 idle/on-demand 任务：dictation status、skills/prompts/commands、collaboration modes、agents、engine model catalog。
6. 迁移 thread/session hydration：active workspace first page 优先，完整 catalog merge 改 idle/on-demand，非 active workspace 不再启动即全量恢复。
7. 迁移 file/git：file tree 默认浅层或按面板可见加载，git diff 仅在面板可见、用户显式动作或 idle budget 下加载，git status 保留 active workspace bounded refresh。
8. 迁移 focus/visibility refresh：统一提交 refresh task，增加 cooldown、coalescing 和 dedupe。
9. 补 startup diagnostics UI 或开发者诊断入口，并根据 trace 调整 phase 归属。
10. 在每个迁移批次运行 large-file governance 与 heavy-test-noise sentry 对应命令，防止 trace/test fixture 或 noisy tests 污染 CI。

Rollback:

- 每批迁移保留 feature-level fallback，允许单独回退到原 hook 加载路径。
- Orchestrator 失败时必须降级为 cached/skeleton UI，不阻塞 AppShell。
- 如果某个任务迁移导致行为回归，只回退该 task descriptor，不回退整个 orchestrator。

## Risks / Trade-offs

- 启动任务抽象过重 → 先只覆盖启动期和 focus refresh，不泛化成全局任务系统。
- 迁移过程中双路径重复加载 → 每个迁移批次必须用 `dedupeKey` 和 focused tests 证明不会重复 IPC。
- idle 任务延后导致某些面板首次打开变慢 → 面板打开时使用 on-demand 高优先级任务并展示明确 loading 状态。
- 取消语义与现有 async hooks 冲突 → 先对可取消任务使用 request generation / ignored stale result，再逐步接入 AbortSignal。
- trace 数据膨胀 → 保留最近启动窗口和 bounded ring buffer，不持久化完整历史。
- orchestrator 自身造成 render 风暴 → core 不接 React state setter，UI 只通过 selector 订阅必要状态。
- 并发 cap 过低导致后台预热太慢 → 默认保守，允许按 trace 调整，但不能绕过 cap。
- `Modified Capabilities: None` 低估了延迟加载的可见行为 → 实现阶段若改变某个面板的用户可见加载语义，必须补对应 capability delta。
- 三平台 timing 抖动导致测试不稳定 → 测试使用 fake timers 和 deterministic scheduler，不断言真实 wall-clock 毫秒级精度。
- trace fixture 体积失控触发 large-file governance → 使用最小 fixture，避免提交大日志、大 trace dump 或录屏文件。
- task lifecycle 日志污染 heavy-test-noise gate → 默认静默，诊断输出必须可控并只在显式 debug 或失败路径输出。

## Open Questions

- 默认 idle delay 和每轮 idle budget 应该是多少。
- startup trace 是否只进入 diagnostics store，还是需要暴露一个开发者面板。
- `preloadGitDiffs` 的默认值是否应在本变更中改为 false，还是仅改变触发条件。
- 完整 file tree 的“浅层加载”边界是否按目录层级、节点数量，还是按耗时 budget 定义。
- startup budget 的初始数值是否按平台区分，例如 macOS/Windows/Linux 使用不同默认值。
- 哪些 backend command 值得接入 cooperative abort，哪些只做 soft-ignore。
