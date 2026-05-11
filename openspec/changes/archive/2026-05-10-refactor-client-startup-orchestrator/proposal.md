## Why

当前客户端启动是 mount-driven：`AppShell` 与各 feature hooks 在首次挂载时各自触发 IPC、扫描、恢复与预加载，首屏所需数据和机会型预热混在一起并发执行。随着 workspace、thread/session、file tree、git diff、engine/model catalog 数量增长，冷启动和切回前台会出现重复刷新、I/O 峰值和 UI 卡顿，且缺少统一的启动耗时证据。

这个变更要把“打开客户端后默认加载什么、何时加载、能否取消、如何观测”从分散 hook 副作用重构为显式的客户端启动调度契约。

## 目标与边界

- 建立 frontend `Startup Orchestrator`，统一管理客户端启动期和前台恢复期的加载任务。
- 把启动任务分成 `critical`、`first-paint`、`active-workspace`、`idle-prewarm`、`on-demand` 阶段。
- 让每个启动任务声明 `id`、`phase`、`priority`、`dedupeKey`、`timeoutMs`、`workspaceScope`、`cancelPolicy`、`traceLabel` 与 degraded fallback。
- 将重型 mount-time effects 迁出首屏关键路径，包括 thread/session catalog 扫描、完整 file tree、git diff preload、skills/prompts/commands catalog、engine model catalog、dictation model status 等。
- 保留用户可感知的启动语义：窗口尽快可交互，active workspace 优先恢复，缓存数据可先展示，慢任务以 skeleton/degraded 状态补齐。
- 为 startup tasks 和关键 backend commands 增加 trace 证据，支持定位“哪个启动任务让客户端卡住”。

## 非目标

- 不在本变更中迁移 backend storage format 或 thread/session 数据模型。
- 不改变 Claude Code、Codex、Gemini 的 runtime acquire 语义；已有 `runtime-orchestrator` 仍负责 managed runtime 生命周期。
- 不一次性删除所有现有 hooks；允许按风险分批迁移到 orchestrator。
- 不引入新的第三方调度库，优先使用现有 React/Tauri/TypeScript 基础能力实现。
- 不把启动优化伪装成业务功能改动；业务行为变化必须在 specs 阶段单独声明。

## 技术方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| A. 局部止血 | 在现有 hooks 内加 debounce、延迟、条件判断，逐个关闭重型预加载 | 改动小、见效快、风险低 | 规则分散，后续新增 hook 仍会绕过约束；重复刷新和可观测性问题难以根治 | 只适合短期 hotfix，不作为主方案 |
| B. Startup Orchestrator | 新增统一 task registry/scheduler，所有启动期加载必须声明 phase、priority、dedupe、timeout、cancel 与 trace | 启动行为可审计、可测试、可分阶段迁移；能系统性压缩首屏关键路径 | 初期需要抽象任务边界，并迁移一批 hooks | 采用此方案 |
| C. Backend 聚合启动接口 | 后端提供一个聚合 `bootstrap` command，一次返回尽可能多的启动数据 | IPC 次数少，前端调用简单 | 容易把重型扫描集中成单点阻塞；取消、降级、按需加载更差；不能解决前端 focus/mount 重复触发 | 不采用，可作为个别轻量数据聚合的后续优化 |

## What Changes

- 新增 `client-startup-orchestration` capability，用于定义客户端启动任务分层、调度、去重、取消、降级与追踪要求。
- 引入 frontend startup task registry，禁止启动期重型 IPC 直接由 mount-time `useEffect` 无约束触发。
- 将启动关键路径收敛为：client stores、app settings、workspace list、shell render、active workspace minimal state。
- 将 active workspace hydration 限制为首屏必要数据：thread/session first page、git status once、当前 engine/model selection minimal state。
- 将非 active workspace hydration、完整 session catalog merge、完整 file tree、git diffs、commands/prompts/skills/collaboration/agent catalogs、dictation status 等迁入 idle 或 on-demand 阶段。
- 为 focus/visibility refresh 增加 cooldown、coalescing 与 dedupe，避免用户切回应用时重复触发 workspace/thread/git/file 扫描。
- 增加 startup trace 数据：每个 task 记录 queued、started、settled、timeout、cancelled、fallback、duration、workspace scope、command label。
- 增加 startup budget 口径，明确首屏、可输入、active workspace ready、idle budget、最大并发任务数与 trace 采样边界。
- 明确 cancellation 不是所有任务都能硬中断；不可硬取消的 Tauri/Rust command 必须支持 soft cancel 或 stale result ignore。
- 明确 React 接入边界，orchestrator 不直接制造大面积 render，只通过稳定 store/selector 暴露状态。
- 增加迁移期 guardrails，禁止同一启动 IPC 同时由 legacy hook 和 orchestrator 双路径触发。
- 增加跨平台实现约束，所有 scheduler、timer、path、IPC、diagnostics 与测试写法必须兼容 Windows、macOS、Linux。
- 增加 CI 噪声与大文件治理约束，后续实现不得引入新的 lint/test warning、large-file governance debt 或 heavy-test-noise gate 失败。
- 为大仓库和多 workspace 场景提供 degraded UX：缓存 sidebar、skeleton、显式“仍在加载”状态，而不是阻塞主 UI。

## Capabilities

### New Capabilities

- `client-startup-orchestration`: 定义客户端启动加载的 phase contract、task metadata、调度规则、首屏关键路径边界、idle/on-demand hydration、focus refresh 合并以及 startup trace 证据。

### Modified Capabilities

- None. 现有 workspace/session/file/git/model 能力在本提案阶段作为被调度对象接入；若 specs/design 阶段确认某个功能的可见行为需要改变，再为对应 capability 增加 delta。

## Impact

- Frontend 启动入口：`src/bootstrapApp.tsx`、`src/App.tsx`、`src/app-shell.tsx`、`src/app-shell-parts/**`。
- Frontend hooks/services：settings、workspaces、threads/session catalog、engine/models、skills/prompts/commands、git status/diffs、workspace files、dictation、menu、session radar、kanban 等启动相关 hooks。
- Backend/Tauri commands：不改变业务 API 语义，但需要为重型启动 command 增加 trace label、耗时日志或诊断事件。
- Tests：新增 orchestrator unit tests、phase ordering tests、dedupe/cancel/timeout tests、focus coalescing tests；为迁移后的 hooks 添加 focused regression tests。
- CI gates：实现必须继续通过 large file governance sentry 与 heavy test noise sentry，包括 Ubuntu、macOS、Windows matrix。
- Dependencies：不新增第三方 runtime dependency。

## 验收标准

- 首屏 render 不再等待 thread/session 全量恢复、完整 file tree、git diff preload、skills/prompts/commands catalog 或 dictation status。
- 启动后前 2 秒内只允许执行 `critical`、`first-paint` 与 active workspace minimal hydration；非 active workspace 扫描只能通过 idle slot 或用户显式交互触发。
- startup trace 必须能标记 `shell-ready`、`input-ready`、`active-workspace-ready` 三个里程碑，并记录每个里程碑之前运行过的任务集合。
- orchestrator 必须限制每个 phase、workspace scope 与 heavy command class 的并发数量，避免把分散 I/O 风暴变成集中 I/O 风暴。
- 同一 `dedupeKey` 的启动任务在并发 mount、workspace switch、focus/visibility 事件中只运行一次或复用同一个 in-flight promise。
- active workspace 切换时，旧 workspace 的可取消 hydration 必须被取消或降级，不得继续抢占新 active workspace 的首屏资源。
- 对无法硬取消的 backend command，旧 workspace 结果必须被识别为 stale result，不能覆盖新 active workspace 状态。
- `preloadGitDiffs`、完整 file tree、完整 session catalog merge 必须满足可见性或 idle budget 条件，不能无条件进入启动关键路径。
- focus/visibility refresh 在短时间重复触发时必须合并，并保留最后一次有效刷新意图。
- startup trace 能回答每个启动任务的 phase、开始时间、结束时间、耗时、状态、fallback 与关联 workspace。
- 实现不得新增 TypeScript、ESLint、Vitest、Node test、Rust 编译或测试告警；确有既有告警时必须证明未增加噪声。
- 实现必须兼容 Windows、macOS、Linux，不得依赖单平台 path separator、shell command、timer 行为或文件系统大小写特性。
- 实现必须满足 `large-file-governance.yml` 门禁：`node --test scripts/check-large-files.test.mjs`、`npm run check:large-files:near-threshold`、`npm run check:large-files:gate`。
- 实现必须满足 `heavy-test-noise-sentry.yml` 门禁：`node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`、`npm run check:heavy-test-noise`。
- 在大仓库、多 workspace、历史会话多的场景下，客户端应先进入可交互 shell，再渐进补齐后台数据；失败任务不得拖垮 AppShell。

## 深度推演

L2 根因不是“某几个 IPC 慢”，而是启动 ownership 失控：每个 hook 都认为自己在做局部合理的初始化，组合起来却形成全局无预算的 I/O 风暴。L3 设计法则是：启动期不是副作用堆叠，而是一条有预算、有优先级、有取消语义的 pipeline；任何绕过 pipeline 的预加载都会重新制造系统熵。
