## Why

Claude Code 的 model 支持已经变成 CLI 侧快速演进的能力，GUI 继续维护一份写死的 Claude model catalog 会天然滞后，并且容易把展示 id 误当成真实 `claude --model` 参数透传，造成用户明明配置了新模型但发送时仍落回旧模型。

本变更要把 Claude model source of truth 从静态前端/后端列表迁移到 Claude Code CLI 可发现能力，同时保留现有“添加自定义模型、配置映射、发送透传”的用户链路，避免为修复官方模型漂移而破坏自定义模型使用场景。

## 目标与边界

### 目标

- Claude Code model selector MUST 以当前机器上的 Claude Code CLI 发现结果为主要来源，而不是依赖硬编码的内置 catalog。
- 系统 MUST 明确区分 UI option identity 与 runtime model value，禁止把展示用 id 隐式当作 `claude --model` 参数。
- 现有自定义模型添加、Claude model mapping、settings/env 覆盖与发送透传链路 MUST 继续可用。
- CLI 发现失败时 MUST fail-safe：保留已有可用 catalog、自定义模型和当前选择，不得把列表清空或阻断发送。
- 刷新配置 MUST 能重新读取 CLI 支持模型与用户自定义配置，并且刷新过程可诊断、可回退。

### 边界

- 本变更只覆盖 Claude Code provider 的 model discovery、model selection 与 send-time model resolution。
- 本变更不改变 Codex、Gemini、OpenCode 的 model catalog 语义。
- 本变更不改写用户 `~/.claude/settings.json`，只读取其中与 model 有关的配置。
- 本变更不要求 GUI 预测 Claude Code 服务端未来会支持哪些模型；GUI 只展示 CLI 当前可发现结果和用户显式添加项。
- 本变更允许保留最小静态 fallback，但 fallback 只能作为 CLI 不可用或解析失败时的保底，不得覆盖 CLI 发现结果或用户自定义模型。

## 非目标

- 不新增一套 Claude 专属 provider marketplace。
- 不移除现有“添加模型”入口。
- 不禁止用户输入非官方模型、代理模型或 provider-scoped model id。
- 不把 `opus/sonnet/haiku` 等 alias 强制展开成某个写死版本；alias 的最终解析权归 Claude Code CLI。
- 不在本轮重构 Claude auth、vendor provider 或 permission mode。

## What Changes

- Claude model catalog 的优先级调整为：
  - 当前 Claude Code CLI 动态发现的模型
  - `~/.claude/settings.json` / env 中的 model overrides
  - 用户显式添加的 Claude 自定义模型
  - 上一次成功刷新缓存或保底 fallback
- 合并语义必须保留用户意图：
  - CLI discovery 提供官方可见基础 catalog
  - settings/env overrides 覆盖对应 family/alias 的 runtime model
  - 用户自定义模型永远作为显式 entry 保留；若与其他 entry runtime model 相同，只能去重展示，不能删除其可选语义
- Model option contract 需要显式携带稳定 `id` 与 runtime `model`：
  - `id` 用于 UI 选择、持久化和 diff
  - `model` 用于发送给 Claude Code CLI
  - 两者可以相同，但系统不得假定必须相同
- Claude “刷新配置”需要触发动态 discovery，并合并自定义模型与配置覆盖；失败时保留旧 catalog 和当前 selection。
- 发送路径需要使用 resolved runtime model，并保留用户自定义模型原样透传能力。
- debug / diagnostic 信息需要记录 model resolution 来源，例如 `cli-discovered`、`custom`、`settings-override`、`cached-fallback`；无法判定时必须显式标记为 `unknown`，不得省略。
- 静态 fallback catalog 只能用于 CLI discovery 不可用时保持基础可用性，并且必须被明确标记为 fallback source。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续维护内置 Claude model 常量，定期手动更新版本 | 实现成本最低 | 必然滞后；仍会出现旧 id 透传；无法反映用户本机 CLI 支持差异 | 不采用 |
| B | 完全依赖 CLI discovery，移除自定义模型与 fallback | 官方模型最动态 | CLI 解析失败会让用户无模型可选；破坏现有自定义模型链路 | 不采用 |
| C | CLI discovery 为主，自定义模型/settings override 合并，缓存/fallback 保底 | 动态、兼容、可回退；不破坏用户现有用法 | 需要补 contract、merge precedence、测试矩阵 | **采用** |

## Capabilities

### New Capabilities

- `claude-dynamic-model-discovery`: 定义 Claude Code model catalog 的 CLI discovery、cache/fallback、custom model merge 与 send-time resolution 行为。

### Modified Capabilities

- `composer-model-selector-config-actions`: Claude Code 的 `刷新配置` 行为从“重读 settings 与 supported CLI discovery sources”收紧为“以 CLI discovery 为主，合并自定义模型与 settings overrides，失败时保留旧 catalog”。

## 验收标准

- 当 Claude Code CLI 能提供可解析的模型信息时，Claude model selector MUST 展示 CLI discovery 结果，而不是只展示内置静态列表。
- 当用户点击 Claude Code selector 的 `刷新配置` 时，系统 MUST 重新执行 Claude model discovery，并合并用户自定义模型与 settings/env overrides。
- 当 CLI discovery 失败、超时或返回不可解析结果时，系统 MUST 保留刷新前 catalog 与当前 selection，并展示可诊断错误。
- 当用户添加自定义 Claude model 后，该 model MUST 出现在 selector 中，并且发送时 MUST 原样作为 runtime `model` 传给 Claude Code CLI。
- 当某个 option 的 `id` 与 `model` 不同时，发送路径 MUST 使用 `model`，而不是用 `id` 回退覆盖用户配置。
- 当用户选择 CLI alias（例如 `opus`、`sonnet`、`haiku` 或 CLI 返回的等价 alias）时，系统 MUST 允许原样传递给 Claude Code CLI，不得强制展开成写死版本。
- 当旧持久化 selection 指向已废弃的内置 id 时，系统 SHOULD 尝试迁移到等价的 CLI-discovered option；无法迁移时 MUST 走现有 fallback selection 规则，不得发送无效旧 id。
- debug diagnostics MUST 能看出最终发送 model 的来源与 resolution 路径。

## Impact

- Frontend:
  - `src/features/engine/hooks/useEngineController.ts`
  - `src/features/models/constants.ts`
  - `src/features/models/hooks/useModels.ts`
  - `src/features/composer/components/ChatInputBox/**`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/services/tauri.ts`
  - `src/types.ts`
- Backend:
  - `src-tauri/src/engine/status.rs`
  - `src-tauri/src/engine/commands.rs`
  - `src-tauri/src/engine/claude.rs`
  - daemon-side Claude engine mirror if it owns separate model discovery / send sanitization code
- Specs:
  - new `claude-dynamic-model-discovery`
  - modified `composer-model-selector-config-actions`
- Validation:
  - focused frontend tests for selector merge, refresh failure, custom model preservation, and send-time `model` resolution
  - Rust tests for Claude CLI discovery parsing, fallback/cache behavior, and passthrough validation
  - `openspec validate --all --strict --no-interactive`
