## Why

`add-runtime-perf-baseline` 已经记录冷启动 / bundle 体积基线：

- `S-CS-COLD`：`bundleSizeMain = 1858800 bytes`，artifact `App-CeJA-2sJ.js`
- `S-CS-COLD`：`bundleSizeVendor = 163595 bytes`，artifact `index-Gcp9yPgO.js`
- `S-CS-COLD`：`firstPaintMs = unsupported`
- `S-CS-COLD`：`firstInteractiveMs = unsupported`

当前可执行的优化入口是 bundle composition，而不是伪造 webview timing。下一步应先把 main bundle
拆分成可解释的 domain chunks，再决定是否引入更重的 Tauri/webview cold-start instrumentation。

## Scope

### In Scope

- 分析 Vite build output，定位 main bundle 的主要来源。
- 为低频 feature 或重依赖设计 lazy import / manual chunk 策略。
- 保持 Tauri desktop 首屏 critical path 不被异步拆分破坏。
- 用 `S-CS-COLD` bundle rows 作为优化前对照。

### Out of Scope

- 不在本 change 内引入 Playwright/Lighthouse 作为强依赖。
- 不改变运行时 feature 语义。
- 不处理 long-list / realtime / hub split。

## Acceptance Criteria

- `bundleSizeMain` 必须相对 `1858800 bytes` 有可解释的下降，或给出不能下降的证据。
- `bundleSizeVendor = 163595 bytes` 不得因错误 chunking 明显膨胀。
- `firstPaintMs/firstInteractiveMs` unsupported 状态必须继续显式记录，不得静默填假值。
- 必须运行 `npm run perf:cold-start:baseline` 与 `npm run perf:baseline:aggregate`。
