# Add Runtime Perf Baseline

## Goal

为 `feature/v0.4.18` 后续性能优化建立**可重现、可对比、可被 CI 引用**的 fixture-based baseline。本任务**不修改任何业务代码**，只搭采集层 + 脚本 + 报告。

## Linked OpenSpec Change

- `openspec/changes/add-runtime-perf-baseline/proposal.md`
- `openspec/changes/add-runtime-perf-baseline/design.md`
- `openspec/changes/add-runtime-perf-baseline/tasks.md`
- `openspec/changes/add-runtime-perf-baseline/specs/runtime-perf-baseline/spec.md`

> 该 change `openspec validate --strict` 通过；全仓 260/260 specs 通过。

## Capability

- 新增 `runtime-perf-baseline`（命名空间已在 proposal §Namespace Note 与 design ADR-6 留痕）

## Scenario Matrix（4 类热路径）

| Scenario ID | Trigger | Primary Metrics |
|---|---|---|
| `S-LL-{200,500,1000}` | Long list render | `commitDurationP50/P95`、`firstPaintAfterMount`、`scrollFrameDropPct`（1000 档） |
| `S-CI-50` / `S-CI-100-IME` | Composer input | `keystrokeToCommitP95`、`inputEventLossCount`、`compositionToCommit` |
| `S-RS-FT` / `S-RS-PE` | Realtime stream | `firstTokenLatency`、`interTokenJitterP95`、`dedupHitRatio`、`assemblerLatency` |
| `S-CS-COLD` | Cold start | `bundleSizeMain/Vendor`、`firstPaintMs`、`firstInteractiveMs` |

## Buffer Capacity Lock-in

- `MAX_PERF_ENTRIES = 1000`（perf 独立 cap）
- `MAX_RENDERER_DIAGNOSTICS = 200`（现有，不动）
- `PERF_SAMPLE_RATE_PROFILER = 1.0`
- `WEB_VITALS_RATING_SCHEMA = "v3"`
- `web-vitals@^4.2.4`（5.x 升级另起 follow-up 核对 API / schema）

实现约束：`rendererDiagnostics` 必须双 bucket 裁剪，non-perf 保持 200，`perf.*` 独立 1000；React Profiler 只用于 fixture producer harness，不包裹 `Composer` / `MessagesRows` runtime 根节点。

## Report Archival Protocol

- **Latest**：`docs/perf/baseline.{md,json}`（每次覆盖）
- **Versioned archive**：`docs/perf/history/<version>-baseline.{md,json}`（永不覆盖）
- 本任务首次产出锚点：`docs/perf/history/v0.4.18-baseline.md`

## Hard Constraints

- `VITE_ENABLE_PERF_BASELINE` 默认关闭，开关关时与 main 行为 100% 等价
- 不修改 `useThreadMessaging` / `useAppServerEvents` / `Composer` / `MessagesRows` 等业务文件（git diff 必须为空）
- 不引入长列表虚拟化（`@tanstack/react-virtual` 在 messages/composer/threads 引用计数不变）
- 单脚本 / fixture < 400 行
- ubuntu / macos / windows 三平台必须可执行

## Phases（标准 6-phase pipeline）

| Phase | Action | 主要工件 |
|---|---|---|
| 1 | brainstorm | 已完成（OpenSpec proposal/design） |
| 2 | research | 已完成（capability matrix、infrastructure inventory） |
| 3 | implement | `src/services/perfBaseline/**`、`scripts/perf-*`、`docs/perf/**` |
| 4 | check | `npm run typecheck && test && perf:realtime:boundary-guard` |
| 5 | update-spec | `openspec validate --strict`、`openspec sync` |
| 6 | record-session | Trellis session record |

## Acceptance Criteria

- [ ] `npm run perf:baseline:all` 一键跑通 4 个场景
- [ ] `docs/perf/baseline.md` + `docs/perf/history/v0.4.18-baseline.md` 产出且 Section A 非空
- [ ] `docs/perf/baseline.json` 含 `schemaVersion: "1.0"`
- [ ] `openspec validate add-runtime-perf-baseline --strict --no-interactive` 通过
- [ ] `npm run check:large-files:gate` + `npm run check:heavy-test-noise` 通过
- [ ] 业务文件 git diff 为空（4 个守哨文件）
- [ ] Follow-up backlog 4 个 change id 占位记录

## Follow-Up Backlog（Out of Scope）

由本基线数据驱动，独立 OpenSpec change 承接：

1. `optimize-long-list-virtualization`（基于 `S-LL-*`）
2. `optimize-realtime-event-batching`（基于 `S-RS-*`）
3. `refactor-mega-hub-split`（基于 commit duration 热点）
4. `optimize-bundle-chunking`（基于 `S-CS-COLD`）

## Open Questions（实现前再决）

1. `S-CS-COLD` Tauri webview headless 在 CI 是否稳定？fallback：web mode 退化采集 + 报告标注
2. web-vitals INP 在 macOS/Linux WebKit 上的兼容性需实测
3. `S-LL-1000` fixture 是否使用真实历史 thread 脱敏，默认 synthetic
4. `docs/perf/history/` 是否纳入 git，默认纳入，触发 large-file 哨兵时改为保留 N 个最近版本

## Cross-References

- 现有 perf 基础设施：`scripts/realtime-perf-report.ts`、`realtimeReplayHarness.ts`
- 渲染端 diagnostics 通道：`src/services/rendererDiagnostics.ts`
- 大文件 / 测试噪声治理：`scripts/check-large-files.mjs`、`scripts/check-heavy-test-noise.mjs`
