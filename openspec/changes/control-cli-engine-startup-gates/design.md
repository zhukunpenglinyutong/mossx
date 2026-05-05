## Context

这次不是单独处理 mac，也不是只扩展之前的 Windows launcher guard。问题要拆成两层：

1. **engine availability governance**
   - 用户需要能在统一 CLI 验证入口中显式关闭某些本地 CLI engine。
2. **OpenCode startup probe governance**
   - 即使 engine 是启用状态，OpenCode 也不应在启动期被多轮重探测。

## Decisions

### Decision 1: Gemini / OpenCode 使用真正的 hard disable，而不是只在 UI 上隐藏

- 仅前端隐藏不够，因为 backend detect / models / provider health 仍会执行。
- disabled state 必须进入 app settings，并在 frontend + backend 同时生效。

### Decision 2: disabled contract 要覆盖 detect、model refresh、command path 三层

- detect 层：`detect_engines` 不再把 disabled engine 当成 installed candidate。
- models 层：`get_engine_models(engine)` 对 disabled engine 直接返回空或 disabled error。
- command 层：`opencode_*` 与未来 Gemini-specific runtime command 必须短路返回稳定诊断。

### Decision 3: OpenCode detect 拆分为 lightweight status 与 on-demand models

- 当前 `detect_opencode_status()` 既做安装探测，又执行 `models`，造成启动期过重。
- 调整为：
  - status detect 默认只做 `version/help` 级别轻探测；
  - models list 改为按需命令；
  - cached status/models 允许短时间复用。

### Decision 4: 设置 UI 落在现有 CLI 验证区块，不新开独立设置页

- 用户已经明确要求把开关做到 `运行环境 -> CLI 验证` 区块。
- `Codex / Claude Code / Gemini CLI / OpenCode CLI` tabs 共享同一认知区域，最符合信息架构。

## Cross-Layer Contract

### AppSettings

新增布尔字段：

- `geminiEnabled: boolean`
- `opencodeEnabled: boolean`

默认值：

- `true`

### Frontend Behavior

- `useEngineController` 在 detect result 上过滤 disabled engine。
- `useSidebarMenus` / engine selector / workspace home 入口不得再为 disabled engine 展示可点入口。
- `useOpenCodeSelection` / OpenCode control panel 在 `opencodeEnabled=false` 时不得预热 agents / snapshot。

### Backend Behavior

- `EngineManager::detect_engines()` 读取 app settings / engine config gating，跳过 disabled engine 的真实 detect。
- `get_engine_models(OpenCode)` 不再通过 `detect_opencode_status()` 触发整套重探测。
- `opencode_commands_list`、`opencode_agents_list`、`opencode_provider_health`、`opencode_status_snapshot` 等在 disabled 时返回稳定 disabled error。

### Compatibility Writing Rules

- settings 字段演进必须保持 additive compatibility：
  - frontend normalize 与 Rust sanitize 都把缺失字段视为 `true`
  - 不引入需要一次性迁移旧配置文件的 breaking write
- command / payload 兼容性必须保持双端同步：
  - 若调整 settings payload、engine status payload、或 disabled diagnostic 文案，必须同时检查 `src/services/tauri.ts` mapping 与 Rust command response
  - 禁止只在单侧新增 required 字段
- disabled contract 必须优先做短路，不允许先执行真实 CLI 再返回 disabled 结果。

### CI Gate Rules

- 这次实现的最小 CI 门禁固定为：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `openspec validate --all --strict --no-interactive`
- 若实现阶段修改 `src/services/tauri.ts`、settings schema 或 runtime contract，追加：
  - `npm run check:runtime-contracts`
  - `npm run doctor:strict`
- 合入判断以这些门禁为准，而不是只看本地手测或单侧测试通过。

## Risks / Trade-offs

- 风险：disabled engine 若恰好是 persisted active engine，UI 可能出现空选中。
  - 方案：在 detect 后自动回退到首个 enabled + installed engine。
- 风险：过度缓存 OpenCode models 导致模型列表不够新鲜。
  - 方案：仅在启动期轻探测使用缓存；显式刷新仍走真实刷新。
- 风险：Gemini 暂时没有像 OpenCode 一样重探测，但仍被纳入开关，造成“功能超前”。
  - 方案：这是有意的统一治理，不是副作用。

## Validation Plan

- frontend:
  - settings toggle 测试
  - engine controller disabled filtering 测试
  - disabled engine 入口关闭测试
- backend:
  - disabled OpenCode detect short-circuit
  - disabled Gemini detect short-circuit
  - OpenCode lightweight detect 不再默认触发 models
- artifacts:
  - `openspec validate --all --strict --no-interactive`
