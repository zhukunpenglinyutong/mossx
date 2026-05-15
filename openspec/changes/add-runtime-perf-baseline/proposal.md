## Why

`feature/v0.4.18` 在主干完成了 Claude 引擎稳定性、Threads 收敛、本地项目记忆语义召回三件套，但同时把多个核心 hub 推到了它们的体量上限：

- `src/features/threads/hooks/useThreadMessaging.ts` — 2550 行
- `src/features/app/hooks/useAppServerEvents.ts` — 2364 行
- `src/features/composer/components/Composer.tsx` — 2307 行
- `src/features/messages/components/MessagesRows.tsx` — 1914 行
- `src/features/threads/utils/streamLatencyDiagnostics.ts` — 1383 行

仓库已经在 `scripts/realtime-perf-report.ts` + `realtimeReplayHarness` 上沉淀了一套 fixture-replay perf 基础设施（CPU proxy / frame proxy / integrity gate），但目前只覆盖 realtime event 域。**长会话渲染、Composer 输入、冷启动**这三条用户能直接感知的热路径，目前没有可重现的性能基线，也没有可被 CI 引用的硬阈值。

如果直接进入"性能调优"，会出现两类风险：

1. 没有 baseline 的优化是赌博 — 改完之后无法证明"快了 / 没退化"。
2. 现有 `useMemo / useCallback / React.memo` 已经 158 处局部使用，继续打补丁会让巨型 hub 的传播半径更难分析。

本变更目标：**在不修改业务代码（runtime / messaging / composer / threads）的前提下，为 v0.4.18 后续性能优化建立 4 个可重现的 baseline 场景、3 类指标、1 份可被 CI 引用的报告**。

中文一句话：先把秤校准，再上称体重；不要边称边减肥。

## Priority Calibration / 优先级校准

| Priority | Included Area | Why Included | If Not Fixed | If Fixed |
|---|---|---|---|---|
| P0 | long-conversation render baseline | `MessagesRows.tsx` 1914 行 + 无虚拟化是用户感知最强的卡点 | 后续虚拟化 / memo 优化无法量化收益 | 长会话 commit duration / scroll FPS 可被回归 |
| P0 | composer-input-latency baseline | `Composer.tsx` 2307 行单文件，输入字符到屏幕的延迟决定使用感 | INP 退化无人察觉 | INP / keystroke→paint 可被回归 |
| P0 | realtime-stream-latency baseline | 复用 `realtimeReplayHarness`，把 fixture 扩到 v0.4.18 stream-json 修复后的形状 | 已修复的首包延迟回退无哨兵 | first-token / inter-token latency 可被回归 |
| P0 | cold-start-and-bundle baseline | 1040 文件 / +115k 行变更后，bundle 与首屏渲染需要锚定 | 后续 chunk 拆分无对照 | bundle size / TTI / LCP 可被回归 |
| P1 | runtime telemetry hook | 4 个 baseline 都依赖统一的采集入口 | 每条路径各自实现采集，碎片化 | web-vitals + Profiler.onRender 经 `rendererDiagnostics` 单点接入 |
| P1 | report governance | 报告需要可被人和 CI 同时消费 | 报告漂移、无法对比版本 | `docs/perf/baseline.{md,json}` 为 latest，`docs/perf/history/v0.4.18-baseline.{md,json}` 为本变更锚定的归档版本 |
| P1 | large-file & heavy-test sentry | 新增脚本和 fixture 不能制造新的大文件 / 噪声 | 性能基线本身违反治理铁律 | 新增文件全部低于 large-file 阈值，测试不产生 stdout 喷射 |

提案边界：本提案 **不包含** 任何业务代码修改，**不引入** 长列表虚拟化、不拆分巨型 hub、不重构 composer。后续是否做 A（虚拟化）/ B（事件 batching）/ C（hub 拆分），由本基线产出的数据决定。

## What Changes

- 新增 capability `runtime-perf-baseline`，沉淀本次基线的契约：四场景 / 三指标 / 报告产物 / 阈值规则。
- 新增 4 个 baseline 采集脚本：
  - `npm run perf:long-list:baseline`（长会话渲染场景）
  - `npm run perf:composer:baseline`（Composer 输入场景）
  - `npm run perf:realtime:extended-baseline`（扩展现有 realtime harness 覆盖 stream-json 修复后形状）
  - `npm run perf:cold-start:baseline`（冷启动 / bundle 体积场景）
- 通过 `installRendererLifecycleDiagnostics` 入口在 opt-in/dev 环境挂接 web-vitals（LCP / INP / CLS），通过 `RendererDiagnosticEntry` 通道落盘；React Profiler 只用于 fixture producer harness，不包裹现有 `Composer` / `MessagesRows` runtime 根节点。
- 在 `docs/perf/baseline.md`（latest）产出统一报告，同时 mirror 写入 `docs/perf/history/v0.4.18-baseline.md` 作为版本锚点；JSON 工件成对落盘供后续 PR 引用。
- 不修改 `useThreadMessaging` / `useAppServerEvents` / `Composer` / `MessagesRows` 等业务代码。

## Namespace Note

`runtime-perf-baseline` 沿用 `runtime-*` 性能/运行时 capability 命名族，而不使用新建 `spec-hub-*` 前缀，原因是本变更直接约束 renderer runtime diagnostics、realtime replay harness 与 cold-start baseline 的运行时采集契约。该命名与现有 `runtime-*`、`performance-*` 主线 capability 保持语义邻近；后续 sync/archive 时不得将其误判为 parallel namespace drift。

## Scope

### In Scope

- Long-conversation render scenario：fixture-driven，至少覆盖 200 / 500 / 1000 条 thread item 的 commit duration 与 scroll FPS。
- Composer input latency scenario：模拟连续输入 ≥ 50 字符的 keystroke→paint 延迟。
- Realtime stream extended baseline：在 `realtimeReplayHarness` 基础上扩两个 fixture——Claude stream-json first-token slow path、Codex prompt-enhancer dedup path。
- Cold-start baseline：Vite build artifact + first render 的 timing 采集。
- 采集入口：runtime 真实遥测仅基于 `rendererDiagnostics.installRendererLifecycleDiagnostics` 注入 web-vitals；fixture producer harness 使用 React Profiler.onRender 采样并统一写入 baseline JSON。
- 报告产物：`docs/perf/baseline.{md,json}`（latest）+ `docs/perf/history/v0.4.18-baseline.{md,json}`（versioned archive）。
- 治理：新增脚本与 fixture 全部走 `check:large-files:gate`、`check:heavy-test-noise`。

### Out of Scope

- 任何业务代码（hooks / components / threads / composer / runtime）修改。
- 长列表虚拟化、消息渲染 memo 化、composer 拆分、巨型 hub 拆分。
- 事件 batching、流式 throttle 等运行时行为变更。
- bundle splitting / lazy import 实际改造。
- 引入新的 e2e 框架（playwright / lighthouse 作为可选 follow-up，不在本变更内强制）。
- 跨平台 GPU/视频解码层 baseline。

## Engineering Constraints

### Non-Behavior-Change Guarantee / 零行为变更保证

本变更 MUST 保证：

- 关闭采集开关时（`VITE_ENABLE_PERF_BASELINE=0`，默认值），所有现有路径行为 100% 与基线分支等价。
- 采集开关打开时，所有 runtime 副作用必须经 `rendererDiagnostics`，不能引入新的全局变量、全局事件、全局 polyfill。
- React Profiler MUST 只在 baseline fixture 脚本 / test harness 中启用；不得为了 runtime 采集修改 `Composer` / `MessagesRows` / `useThreadMessaging` / `useAppServerEvents`。
- 任何采集脚本 MUST 是 `npm run` 入口，不允许在 dev/build pipeline 默认触发。

### Cross-Platform Compatibility / 跨平台兼容

- baseline 脚本 MUST 能在 `ubuntu-latest`、`macos-latest`、`windows-latest` 上执行。
- fixture MUST NOT 假设特定换行符、路径分隔符、字体可用性。
- 冷启动 baseline 在 Windows 上若无法采集到 LCP（headless 模式限制），MUST 显式记录跳过原因。

### Heavy Test Noise Sentry

Refers to:

- `.github/workflows/heavy-test-noise-sentry.yml`

When this change adds new test/scripts that print baseline output, it MUST keep:

```bash
node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
npm run check:heavy-test-noise
```

- baseline 脚本默认 MUST 静默运行；详细输出走 `--verbose` 或 markdown 报告。
- fixture 失败 path MUST 用 assertion，不允许 console.error 泛滥。

### Large File Governance Sentry

Refers to:

- `.github/workflows/large-file-governance.yml`

When this change adds scripts / fixtures / reports, it MUST keep:

```bash
node --test scripts/check-large-files.test.mjs
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

- 单个采集脚本 MUST < 400 行。
- fixture 文件按场景拆分，单文件 MUST < 400 行。
- markdown 报告不计入源码尺寸，但 JSON 工件 MUST 写到 `docs/perf/` 而非 `src/`。

## Impact

- Frontend:
  - 新增 `src/services/perfBaseline/**`（采集层）
  - 新增 `src/features/threads/contracts/realtimePerfExtendedFixture.ts`
  - `src/services/rendererDiagnostics.ts` 仅扩展，不修改既有 entry semantics
- Scripts:
  - 新增 `scripts/perf-long-list-baseline.ts`
  - 新增 `scripts/perf-composer-baseline.ts`
  - 新增 `scripts/perf-cold-start-baseline.mjs`
  - 扩展 `scripts/realtime-perf-report.ts` 增加 `--profile=extended` 模式
- Docs:
  - 新增 `docs/perf/baseline.{md,json}` 与 `docs/perf/history/v0.4.18-baseline.{md,json}`
  - 新增 `docs/perf/README.md` 描述报告 schema 与读数方法
- Dependencies:
  - 新增 `web-vitals@^4.2.4`（运行时 ~3KB gzipped，dev/prod 共享；若升级 5.x，必须用 follow-up change 重新核对 API 与 rating schema）
  - **无新 native 依赖**
- CI / Governance:
  - heavy test noise sentry：新脚本必须保持低噪
  - large-file sentry：新文件全部低于阈值
  - 本变更**不引入** CI 强制 perf gate；后续是否把 baseline 升格为 gate 由 follow-up change 决定

## Risks

- **web-vitals 在 Tauri webview 上的兼容性**：Tauri 通过 wry 调用各平台的原生 webview，特性矩阵分平台：macOS = WebKit (WKWebView)、Windows = WebView2 (Chromium)、Linux = WebKitGTK。Windows 上 PerformanceObserver 与 INP 支持最全，macOS / Linux 的 WebKit 系列对部分 entry types 与 `event` timing 可能缺失。Mitigation：每个平台先 feature-detect，缺失指标显式记录为 `unsupported` 并附原因，不影响其它指标。
- **fixture 与真实场景偏差**：纯 replay 与真实用户长会话不完全等价。Mitigation：报告中显式标注 "fixture-based" vs "in-app-telemetry"，两类指标分开列。
- **采集本身扭曲性能数据**：Profiler.onRender / web-vitals 自身有开销。Mitigation：所有采集走 `VITE_ENABLE_PERF_BASELINE` 开关，默认关闭；CI 上仅在 baseline job 中打开。
- **报告漂移**：JSON schema 升级时旧报告失效。Mitigation：JSON 第一字段 `schemaVersion`，schema 文档与代码同库维护。
- **触发 large-file / heavy-noise 哨兵**：新脚本与 fixture 容易超阈值。Mitigation：按场景拆 fixture，单脚本 ≤ 400 行硬性约束。

## Migration Strategy

1. 先写 capability spec、设计文档、tasks.md，固定术语和指标定义。
2. 引入 `web-vitals@^4.2.4` 依赖与 `perfBaseline` 采集层，但不接入任何业务组件根节点。
3. 扩展 `rendererDiagnostics` 增加 perf event kind 与双 bucket 裁剪：non-perf 保留现有 200 cap，perf 独立 1000 cap，行为开关默认关闭。
4. 实现 4 个 baseline 脚本，每个独立可运行。
5. 跑出第一份 `docs/perf/baseline.md` + 归档版本 `docs/perf/history/v0.4.18-baseline.md`，作为初始锚点。
6. 文档约定后续 PR 引用 baseline 报告的方式（diff 阈值，% 退化警戒）。
7. 提交 follow-up backlog：A 长列表虚拟化 / B 事件 batching / C hub 拆分由 baseline 数据决定先后。

## Validation

Always-required checks for implementation batches:

```bash
npm run typecheck
npm run test
npm run perf:realtime:boundary-guard
openspec validate add-runtime-perf-baseline --strict --no-interactive
```

When-touched governance checks:

```bash
node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
npm run check:heavy-test-noise
node --test scripts/check-large-files.test.mjs
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

Baseline-production checks (one-shot):

```bash
npm run perf:long-list:baseline
npm run perf:composer:baseline
npm run perf:realtime:extended-baseline
npm run perf:cold-start:baseline
```

Rules:

- baseline 脚本失败 MUST 阻塞当前变更的归档。
- 任何采集脚本 MUST 在没有交互式终端（CI）下运行通过。
- 跨平台缺口 MUST 在 `docs/perf/baseline.md` 的 Section B 显式列出（同时 mirror 进 `docs/perf/history/v0.4.18-baseline.md`）。
