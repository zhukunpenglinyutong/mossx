## Design Goal

为 v0.4.18 后续性能优化建立一份**可重现、可对比、可被 CI 引用**的基线。基线本身不优化任何东西。

## 设计原则

1. **零业务行为变更**。采集开关默认关闭；开关打开时仅在 `rendererDiagnostics` 通道写入条目。
2. **复用 > 新建**。`realtimeReplayHarness` / `rendererDiagnostics` / `RendererDiagnosticEntry` 是已存在的基础设施，本变更优先扩展它们而非另起炉灶。
3. **fixture 与真实遥测分离**。fixture-replay 提供"可对比"，web-vitals 提供"真实分布"，两类指标在报告中分组呈现，不混用。
4. **指标先于实现**。每个场景先固定 metric 定义和单位，再写采集脚本。

## 场景矩阵（Scenario Matrix）

| Scenario ID | Trigger | Input Fixture | Primary Metrics | Pass Condition (this change) |
|---|---|---|---|---|
| `S-LL-200` | Long list render | 200 thread items（混合 user/assistant/tool/reasoning） | `commitDurationP50/P95`、`firstPaintAfterMount` | 跑通即通过；记录绝对值 |
| `S-LL-500` | Long list render | 500 thread items | 同上 | 跑通即通过 |
| `S-LL-1000` | Long list render | 1000 thread items | 同上 + `scrollFrameDropPct` | 跑通即通过 |
| `S-CI-50` | Composer input | 连续输入 50 字符（每键 16ms 间隔） | `keystrokeToCommitP95`、`inputEventLossCount` | 跑通即通过 |
| `S-CI-100-IME` | Composer input + IME | 50 字符 + 10 次 IME composition | 同上 + `compositionToCommit` | 跑通即通过 |
| `S-RS-FT` | Realtime stream first-token | Claude stream-json fixture（含 5s 首包延迟 path） | `firstTokenLatency`、`interTokenJitterP95` | 跑通即通过 |
| `S-RS-PE` | Prompt-enhancer dedup path | Claude enhancer fixture（含重复响应） | `dedupHitRatio`、`assemblerLatency` | 跑通即通过 |
| `S-CS-COLD` | Cold start | Vite build artifact | `bundleSizeMain/Vendor`、`firstPaintMs`、`firstInteractiveMs` | 跑通即通过 |

> "Pass Condition" 本变更只要求"跑通并记录"。**阈值化哨兵留给后续 change**。

## 指标定义（Metric Glossary）

### 渲染层（fixture-replay）

- `commitDurationP50/P95`：从 React Profiler `onRender` 收集的 commit phase 耗时百分位（ms）。
- `firstPaintAfterMount`：组件 mount 起，到 `requestAnimationFrame` 首帧的耗时（ms）。
- `scrollFrameDropPct`：固定速率滚动 2s 内，掉帧率（基于 `requestAnimationFrame` 间隔 > 16.67ms 计数）。

### 输入层（fixture-replay）

- `keystrokeToCommitP95`：模拟 keystroke 事件到下一次 React commit 完成的 P95 耗时（ms）。
- `inputEventLossCount`：50 字符输入中，dispatch 但未在 50ms 内反映到 state 的次数。
- `compositionToCommit`：IME composition end 到 commit 的耗时（ms）。

### 流式层（fixture-replay，复用 realtimeReplayHarness）

- `firstTokenLatency`：从 turn started 到首个 assistant text delta 的耗时（ms）。
- `interTokenJitterP95`：相邻 delta 间隔的 P95（ms）。
- `dedupHitRatio`：dedup 命中数 / 总响应数。
- `assemblerLatency`：fixture 中所有 turn 的 conversationAssembler 处理总耗时（ms）。

### 启动层（build + headless render）

- `bundleSizeMain/Vendor`：`dist/assets/*.js` 主包与 vendor 包的 gzipped size（bytes）。
- `firstPaintMs`：Tauri webview headless 启动至 `paint` event 的耗时（ms）。
- `firstInteractiveMs`：到首个 user-interactive moment 的耗时（ms）。

### 真实遥测（web-vitals，开关打开时）

- `LCP`、`INP`、`CLS`：web-vitals 库标准实现，单位 ms / score。
- 仅在 `VITE_ENABLE_PERF_BASELINE=1` 且 dev 模式下采集，绝不在 release build 默认开启。
- `web-vitals` 依赖锁定 `^4.2.4`；升级到 5.x 需要 follow-up change 重新验证 callback shape 与 rating schema。

## 工具链与数据流

```
┌─────────────────────────────────────────────────────────────┐
│                    Baseline Producer                         │
├─────────────────────────────────────────────────────────────┤
│  scripts/perf-long-list-baseline.ts                          │
│    ├─ load fixture: longListFixture/{200,500,1000}.ts        │
│    ├─ render in jsdom + React Profiler.onRender              │
│    └─ aggregate → JSON                                       │
│                                                              │
│  scripts/perf-composer-baseline.ts                           │
│    ├─ load fixture: composerInputFixture/{50,100ime}.ts      │
│    ├─ simulate keystroke via @testing-library/react          │
│    └─ aggregate → JSON                                       │
│                                                              │
│  scripts/realtime-perf-report.ts --profile=extended          │
│    └─ extends existing realtimeReplayHarness                 │
│                                                              │
│  scripts/perf-cold-start-baseline.mjs                        │
│    ├─ vite build (--mode baseline)                           │
│    ├─ measure bundle gzipped size                            │
│    └─ tauri webview headless launch timing                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────────────────────┐
              │   Aggregator + Reporter      │
              │  scripts/perf-aggregate.mjs  │
              └─────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────────────────────┐
        │  Latest:                                              │
        │   docs/perf/baseline.md  (人读)                        │
        │   docs/perf/baseline.json (CI 读)                      │
        │  Versioned archive:                                   │
        │   docs/perf/history/<version>-baseline.{md,json}     │
        └──────────────────────────────────────────────────────┘
```

## 采集层架构（仅当 `VITE_ENABLE_PERF_BASELINE=1`）

```
┌──────────────────────────────────────────────────────────┐
│  src/services/perfBaseline/index.ts                       │
│    - isPerfBaselineEnabled()  环境开关读取               │
│    - reportWebVital(metric)   web-vitals 回调适配         │
│    - reportProfilerSample(id,phase,actualDuration,...)    │
│                                                            │
│  src/services/perfBaseline/profilerHarness.tsx             │
│    - <PerfProfiler id> 仅供 baseline fixture producer 使用 │
│    - 不接入现有 Messages / Composer runtime 根节点         │
└──────────────────────────────────────────────────────────┘
                            ↓
                            │ runtime web-vitals 透过 rendererDiagnostics
                            │ 写 RendererDiagnosticEntry
                            │ label: "perf.web-vital"
                            ↓
        ┌──────────────────────────────────────────┐
        │  src/services/rendererDiagnostics.ts      │
        │  （现有，最小扩展）                         │
        └──────────────────────────────────────────┘
```

## 关键决策（ADR-style）

### ADR-1：为什么不直接接 lighthouse / playwright

- lighthouse 适合 web app，对 Tauri webview headless 启动场景适配成本高。
- playwright 强大但引入 native 依赖、CI 耗时翻倍，与"零业务变更"原则不符。
- 当前 jsdom + React Profiler + vite build 已经能覆盖 80% baseline 需求。lighthouse / playwright 留作 follow-up 选项。

### ADR-2：为什么 web-vitals 而不是自己写 PerformanceObserver

- web-vitals 是 Google 官方实现，处理了 LCP layout shift correction、INP event filtering 等坑。
- 体积 ~3KB gzipped，feature-detect 后无副作用。
- 自己写易踩坑且没收益。

### ADR-3：为什么 `VITE_ENABLE_PERF_BASELINE` 默认关闭

- 任何采集都有 overhead。Profiler.onRender 在 React 19 即使是 production build 也会启用 profiling 路径，因此本变更不把 Profiler 接入业务 runtime。
- 默认关闭确保 release build 与基线分支零差异，符合"零行为变更"硬约束。
- baseline 采集时由 CI job 或开发者显式打开。

### ADR-4：fixture-replay 与真实遥测分两栏报告

- fixture-replay 提供"对比基准"（A vs B 的差值有意义）。
- 真实遥测提供"分布形状"（绝对值有意义，但环境噪声大）。
- 混合在一起会让阈值化判定无法做。

### ADR-5：JSON schema 第一字段 `schemaVersion: "1.0"`

- 后续指标增删通过 minor 升版（1.x），breaking change 升 major。
- 报告读取方先校验 schemaVersion，避免静默漂移。

### ADR-6：为什么 capability 使用 `runtime-perf-baseline`

- 本 capability 的主语是运行时性能采集契约，不是 OpenSpec hub 自身的治理能力。
- 仓库已有 `conversation-realtime-client-performance`、`performance-compatibility-diagnostics` 与多个 `runtime-*` capability；`runtime-perf-baseline` 更容易与 renderer diagnostics、realtime replay、cold-start 等运行时资产建立检索关联。
- 这是对 canonical `spec-hub-*` 新能力前缀的有意例外，sync/archive 时应保留该名称，避免无意义重命名制造历史断点。

## 现有基础设施清单（复用而非重造）

| 现有资产 | 用途 | 本变更如何复用 |
|---|---|---|
| `src/features/threads/contracts/realtimeReplayHarness.ts` | realtime event replay + CPU/frame proxy | 增加 `--profile=extended` 参数，挂两个新 fixture |
| `src/features/threads/contracts/realtimeReplayFixture.ts` | replay event 生成 | 新增 `realtimePerfExtendedFixture.ts` 兄弟文件 |
| `scripts/realtime-perf-report.ts` | realtime baseline 报告 | 扩展输出格式，统一 schemaVersion |
| `src/services/rendererDiagnostics.ts` | 渲染端 lifecycle 诊断写入 | 新增 perf event label 与双 bucket 裁剪；不修改既有 entry 语义 |
| `@tanstack/react-virtual`（已有） | virtual scroll 能力 | **本变更不使用**，留给后续优化 change |
| `npm run check:large-files:gate` | 大文件治理 | 新脚本与 fixture 必须通过 |
| `npm run check:heavy-test-noise` | 测试噪声治理 | 新脚本默认静默 |

## 报告样例（最终落盘格式预览）

`docs/perf/baseline.md` 顶部章节（本次同时写入 `docs/perf/history/v0.4.18-baseline.md`）：

```markdown
# v0.4.18 Performance Baseline

Generated at: 2026-05-15T10:00:00Z
Schema version: 1.0
Branch: feature/v0.4.18
Commit: <sha>

## Section A — Fixture-Replay Baseline

| Scenario | Metric | Value | Unit | Notes |
|---|---|---|---|---|
| S-LL-200 | commitDurationP50 | 4.2 | ms | |
| S-LL-200 | commitDurationP95 | 9.1 | ms | |
| S-LL-1000 | scrollFrameDropPct | 18.4 | % | |
| S-CI-50 | keystrokeToCommitP95 | 32.7 | ms | |
| S-RS-FT | firstTokenLatency | 412 | ms | with stream-json fix |
| S-CS-COLD | bundleSizeMain | 1.84 | MB | gzipped |

## Section B — Cross-Platform Notes

- Windows: cold-start LCP 不可采集（webview headless 限制），已跳过并记录。

## Section C — Residual Risks
...
```

## 与后续优化提案的接口

本基线产出后，后续可以衍生（不在本变更内执行）：

- `optimize-long-list-virtualization`（基于 `S-LL-*` 数据）
- `optimize-realtime-event-batching`（基于 `S-RS-*` 数据）
- `refactor-mega-hub-split`（基于 commit duration 热点）
- `optimize-bundle-chunking`（基于 `S-CS-COLD` 数据）

每个 follow-up change MUST 引用本基线报告的具体行作为 acceptance criteria。

## 报告归档协议（Report Archival Protocol）

为避免后续 follow-up change 在不同版本产出报告时撞名，本变更约定：

- **Latest（始终最新）**：`docs/perf/baseline.md` + `docs/perf/baseline.json`
  - 每次 `npm run perf:baseline:all` 覆盖写入，反映当前 HEAD 的最新基线。
- **Versioned archive（按版本归档）**：`docs/perf/history/<version>-baseline.md` + `.json`
  - `<version>` 取自 `package.json` 的 version 字段（如 `v0.4.18`）。
  - 由 aggregator 在写入 latest 的同时复制一份到 history 路径，已存在则在文件名追加 `-<timestamp>` 后缀，保留历史多次采样。
- **本变更首次产出的归档版本**：`docs/perf/history/v0.4.18-baseline.md`，作为锚点。
- **后续 follow-up change**（如 `optimize-long-list-virtualization`）MUST：
  - 引用 `docs/perf/history/v0.4.18-baseline.md` 中具体 scenario id + metric 值作为对照基线。
  - 实现完成后跑一次 baseline，更新 `docs/perf/baseline.md` 与 `docs/perf/history/<new-version>-baseline.md`。
- 报告路径 MUST 与 `docs/perf/README.md` 中描述的 schema 保持一致；schema 升级触发 path 变更时，旧 history 文件 MUST 原样保留。

## 容量与缓冲约定（Buffer Capacity Lock-in）

为保证采集层的内存可预测性，本变更在 `## 1. Foundations` 阶段 lock 死以下数值：

| 常量 | 数值 | 与现有资产的关系 | 说明 |
|---|---|---|---|
| `MAX_RENDERER_DIAGNOSTICS` | 200 | 现有 `rendererDiagnostics.ts` | 不修改 |
| `MAX_PERF_ENTRIES` | 1000 | 新增于 `perfBaseline/index.ts` | perf 类条目独立 cap，按时间顺序 evict |
| `PERF_SAMPLE_RATE_PROFILER` | 1.0 | 新增于 `perfBaseline/index.ts` | dev 默认全采，CI baseline job 全采，未来阈值化时再考虑降采样 |
| `WEB_VITALS_RATING_SCHEMA` | "v3" | web-vitals 库内置 | 锁定使用 web-vitals 4.x 系列的 rating schema |

变更原则：

- 任何对上述数值的调整 MUST 在 follow-up change 中显式列出原因与回归影响。
- `rendererDiagnostics` MUST 使用双 bucket 裁剪：non-perf entries 保留现有 `MAX_RENDERER_DIAGNOSTICS=200`，`perf.*` entries 独立保留 `MAX_PERF_ENTRIES=1000`；合并落盘时不得让全局 200 cap 截断 perf entries。
- 现有 non-perf diagnostics buffer 行为 MUST NOT 受 `MAX_PERF_ENTRIES` 影响。

## Open Questions（待进入实现前再决）

1. `S-CS-COLD` 的 Tauri webview headless 是否可在 CI 上稳定运行？若否，先用 web mode 退化采集，在报告中标注偏差。
2. web-vitals 在 macOS/Linux WebKit 系列上的 INP 支持需要实测；Windows WebView2 上 INP 已稳定支持。缺失时降级为 `null` + `unsupported` 并附平台原因。
3. `S-LL-1000` fixture 数据是否使用真实历史 thread 脱敏后生成？是否需要数据脱敏脚本？默认先用 synthetic data，必要时再切。
4. `docs/perf/history/` 下的归档文件是否纳入 git？默认纳入，方便 PR 评审横向对比；若文件量增长触发 large-file 哨兵，则改为只保留 N 个最近版本。
