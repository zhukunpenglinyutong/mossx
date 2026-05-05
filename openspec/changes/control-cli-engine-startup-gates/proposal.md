## Why

当前 `CLI 验证` 区域只有 `Codex / Claude Code` 两个入口，而 `Gemini CLI / OpenCode CLI` 仍然通过全局 engine detection、workspace menu、以及部分按需 UI 路径被隐式探测和拉起。结果是：

- 用户无法在统一入口中明确控制 `Gemini CLI / OpenCode CLI` 是否参与本地探测和运行。
- 即使用户当前不想使用 `Gemini CLI / OpenCode CLI`，客户端启动后仍可能执行对应 CLI 探测。
- `OpenCode` 在 Win/mac 上都暴露出“启动期探测面过宽”的问题：Windows 侧表现为 foreground risk，macOS 侧表现为短时间拉起多个 `.opencode` 进程。

因此需要把这件事从“某个平台的异常处理”上升为统一的产品能力：在 `CLI 验证` 区块中为 `Gemini CLI / OpenCode CLI` 提供显式硬开关，并收敛 OpenCode 的启动期探测行为。

## Target And Boundary

- 在 `运行环境 -> CLI 验证` 区域新增 `Gemini CLI` 与 `OpenCode CLI` tabs。
- 为 `Gemini CLI` 与 `OpenCode CLI` 都新增 `enabled / disabled` 硬开关。
- 当 `Gemini CLI / OpenCode CLI` 被禁用时：
  - 对应 engine 入口 MUST 直接关闭；
  - 前端 MUST 不再把它视为可选 engine；
  - backend MUST 不再对其执行 detect / model refresh / provider/session 类命令；
  - 已有相关 command 若被调用，必须返回稳定的 disabled 诊断，而不是继续执行。
- 对 `OpenCode CLI` 额外收敛启动期探测：
  - 启动默认使用 lightweight detection；
  - 避免把 `status detect`、`commands fallback`、`models refresh` 叠成多轮真实 CLI 进程风暴。

## Non-Goals

- 不改 `Codex / Claude Code` 现有 doctor 与 backendMode 契约。
- 不重写整个 engine manager 架构。
- 不修改 OpenCode `run --format json` 主消息链路。
- 不在本提案中加入新的 provider auth、MCP、session 管理功能。

## What Changes

- 修改 `CLI 验证` 面板结构：从 `Codex / Claude Code` 扩展为 `Codex / Claude Code / Gemini CLI / OpenCode CLI`。
- 在 `Gemini CLI` 与 `OpenCode CLI` tabs 中增加 `禁用该 CLI 引擎` 控件。
- 为 app settings 增加 engine-level enabled flags，用于前后端统一短路。
- `OpenCode` detect/models loading 从“启动重探测”调整为“启动轻探测 + 按需刷新”。
- 被禁用 engine 的 workspace / sidebar / selector / settings 入口统一关闭或隐藏。

## Option Comparison

### Option A: 仅优化 OpenCode 启动期探测，不提供显式禁用开关

- 优点：改动较小。
- 缺点：用户仍无法主动止血；Gemini 也无法被统一纳入治理。
- 结论：不采用。

### Option B: 为 Gemini/OpenCode 增加统一硬开关，并顺带收敛 OpenCode 启动期探测

- 优点：用户可直接控制；Win/mac 共用一套产品语义；backend/frontend 边界更清晰。
- 缺点：涉及 app settings、engine detection、settings UI、部分 OpenCode runtime surface。
- 结论：采用。

## Capabilities

### Modified Capabilities

- `cli-execution-backend-parity`
  - `CLI 验证` 面板除了 shared backend controls 外，必须包含 `Gemini CLI / OpenCode CLI` tabs 与显式 enable/disable control。
- `opencode-mode-ux`
  - OpenCode 必须支持被显式禁用；
  - 未禁用时，启动期探测必须避免不必要的重复 CLI 拉起。

### New Capabilities

- `cli-engine-startup-gates`
  - 统一定义 `Gemini CLI / OpenCode CLI` 的 enabled/disabled contract，以及 disabled 时前后端短路语义。

## Acceptance Criteria

- 用户能在 `CLI 验证` 区块中看到 `Gemini CLI` 与 `OpenCode CLI` tabs。
- `Gemini CLI / OpenCode CLI` 都具备显式禁用开关。
- 当某个 engine 被禁用时：
  - engine selector / workspace 新建入口 / 相关 panel MUST 不再暴露该入口；
  - backend detect 与 command path MUST 直接短路；
  - UI MUST 展示稳定的 disabled state，而不是继续探测。
- OpenCode 在未禁用时，客户端启动后不得再因为 detect fallback + model refresh 叠加而引发多轮不必要的 CLI 进程风暴。
- Windows foreground guard 继续保持有效，不得被本次统一收敛回退。

## CI Gates

- 本提案进入实现与合并前，CI MUST 至少覆盖：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `openspec validate --all --strict --no-interactive`
- 若本次改动触达 `src/services/tauri.ts`、settings payload、或 command 字段映射，CI SHOULD 额外覆盖：
  - `npm run check:runtime-contracts`
  - `npm run doctor:strict`
- 任一 gate 失败时，本提案对应实现 MUST NOT 合入。

## Compatibility Constraints

- `geminiEnabled` 与 `opencodeEnabled` 必须按 additive field 演进：
  - 旧 settings 缺失字段时 MUST sanitize 为 `true`；
  - 禁止把历史 settings 判为损坏或要求用户手动重置。
- 现有 `Codex / Claude Code` settings、doctor、backendMode 契约 MUST 保持不变。
- frontend `AppSettings`、`src/services/tauri.ts` mapping、Rust settings 结构体的字段命名与默认值 MUST 保持一致，禁止出现“前端已写入、后端未识别”或“后端新增字段、前端未 sanitize”的漂移。
- OpenCode startup detect 的收敛必须是行为减噪，不得改变显式进入 OpenCode 后的主能力语义；尤其不得回退既有 Windows safe-resolution guard。
- disabled diagnostic 必须保持稳定字符串契约，避免同一 disabled 状态在不同 command 上产生不可预测文案差异。

## Impact

- Affected frontend:
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/components/settings-view/sections/*`
  - `src/features/engine/hooks/useEngineController.ts`
  - `src/features/app/hooks/useSidebarMenus.ts`
  - `src/app-shell-parts/useOpenCodeSelection.ts`
- Affected backend:
  - `src-tauri/src/types.rs`
  - `src-tauri/src/shared/settings_core.rs`
  - `src-tauri/src/engine/manager.rs`
  - `src-tauri/src/engine/status.rs`
  - `src-tauri/src/engine/commands.rs`
  - `src-tauri/src/engine/commands_opencode.rs`
- Validation impact:
  - frontend settings / engine controller regression tests
  - Rust tests for disabled engine short-circuit
  - OpenSpec strict validation
