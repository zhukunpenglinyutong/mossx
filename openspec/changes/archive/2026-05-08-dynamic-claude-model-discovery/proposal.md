## Why

Claude Code 的模型选择链路曾同时依赖 frontend 静态列表、backend fallback、`claude --help` 示例解析、settings/env 覆盖和用户自定义模型。这个多 source of truth 会把“示例/展示 id”误当成真实 `claude --model` 参数，导致用户选择或配置的新模型被旧模型、alias 或 fallback 覆盖。

本变更把 Claude Code model selector 收敛为只展示用户可控来源：Claude settings/env model overrides 与用户自定义模型。GUI 不再维护 Claude 内置模型 catalog，也不再从 `claude --help` 文案中推断模型。

## 目标与边界

### 目标

- Claude Code model selector MUST 只由 `~/.claude/settings.json` / supported env model overrides 和用户自定义 Claude models 构成。
- 系统 MUST 明确区分 UI option identity 与 runtime model value，禁止把展示用 id 隐式当作 `claude --model` 参数。
- 用户自定义模型添加、settings/env 覆盖与发送透传链路 MUST 继续可用。
- Claude refresh 成功时 MUST 用最新配置/自定义模型替换旧 catalog，防止切换供应商后旧模型残留。
- Claude refresh 失败时 MUST fail-safe：保留已有可用 catalog、自定义模型和当前选择，并暴露可诊断错误。

### 边界

- 本变更只覆盖 Claude Code provider 的 model catalog、model selection 与 send-time model resolution。
- 本变更不改变 Codex、Gemini、OpenCode 的 model catalog 语义。
- 本变更不改写用户 `~/.claude/settings.json`，只读取其中与 model 有关的配置。
- 本变更不要求 GUI 预测 Claude Code 服务端未来会支持哪些模型；未知模型只要用户显式配置/添加并通过 shape validation，就允许透传给 Claude Code CLI。
- 本变更不使用 `claude --help` / `claude model --help` 作为模型列表来源，因为这些输出是帮助文案或交互入口，不是稳定 catalog contract。
- 本变更不保留 `sonnet` / `opus` / `haiku` builtin fallback catalog；如果用户需要这些 alias，必须通过 settings/env 或自定义模型显式添加。
- 新增 contract 字段必须采用 backward-compatible 写法：旧 payload 缺少 `model` / `source` 时不得导致 UI 崩溃或发送链路中断。

## 非目标

- 不新增一套 Claude 专属 provider marketplace。
- 不移除现有“添加模型”入口。
- 不禁止用户输入非官方模型、代理模型或 provider-scoped model id。
- 不把 `opus/sonnet/haiku` alias 强制展开成某个写死版本。
- 不在本轮重构 Claude auth、vendor provider 或 permission mode。

## What Changes

- Claude model catalog 的来源收敛为：
  - `~/.claude/settings.json` / env 中的 `ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_*_MODEL`、`ANTHROPIC_REASONING_MODEL`
  - 用户显式添加的 Claude 自定义模型
- 不再展示以下非用户配置来源：
  - frontend 静态 Claude model list
  - backend builtin fallback list
  - 从 `claude --help` 示例中解析出的 `sonnet`、`opus`、`haiku` 或 `claude-sonnet-4-6`
  - 空 catalog 时由当前 selected value 合成的临时 Claude option
- Model option contract 显式携带稳定 `id` 与 runtime `model`：
  - `id` 用于 UI 选择、持久化和 diff
  - `model` 用于发送给 Claude Code CLI
  - 两者可以相同，但系统不得假定必须相同
- Claude “刷新配置”重新读取 settings/env overrides，并合并用户自定义模型；成功时替换旧 catalog，失败时保留旧 catalog。
- 当用户自定义模型与 settings/env 默认项指向同一个 runtime `model` 时，合并后的可选项仍须保留 `isDefault` 语义，避免默认模型在 runtime-value 去重后丢失。
- 发送路径使用 resolved runtime model，并保留用户自定义模型原样透传能力。
- debug / diagnostic 信息记录 model resolution 来源，例如 `custom`、`settings-override`、`unknown`。
- 已刷新/已注水的 provider catalog 视为 parent source of truth：Claude 刷新结果不得被 stale local mapping cache 覆盖，Codex 等非 Claude provider 也不得在子组件中再次做本地二次合并而产生重复选项。
- CI / local gate 覆盖跨层 contract：`get_engine_models` response mapping 不得丢弃 `model` / `source`，`engine_send_message` request 必须使用 resolved runtime `model`。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续维护内置 Claude model 常量 | 实现成本低 | 必然滞后；仍会出现旧 id 透传；无法反映用户配置 | 不采用 |
| B | 解析 `claude --help` / help examples 生成 selector | 看似动态 | help 是文案，不是 catalog；会把 `claude-sonnet-4-6` 这类示例误展示 | 不采用 |
| C | 只依赖 settings/env overrides + 用户自定义模型 | 用户可控、无伪模型、切源可清理旧 catalog | 未显式配置时 Claude 列表为空，需要用户添加/配置模型 | **采用** |

## Capabilities

### New Capabilities

- `claude-dynamic-model-discovery`: 定义 Claude Code model catalog 的 settings/env discovery、custom model merge 与 send-time resolution 行为。

### Modified Capabilities

- `composer-model-selector-config-actions`: Claude Code 的 `刷新配置` 行为收紧为“重读 settings/env overrides，合并自定义模型；成功替换旧 catalog，失败保留旧 catalog”。

## 验收标准

- 当 `~/.claude/settings.json` 或 supported env 定义 Claude model override 时，Claude model selector MUST 展示对应 runtime model。
- 当用户添加自定义 Claude model 后，该 model MUST 出现在 selector 中，并且发送时 MUST 原样作为 runtime `model` 传给 Claude Code CLI。
- 当 Claude settings/env 与自定义模型都为空时，Claude selector MUST NOT 自动展示 `sonnet`、`opus`、`haiku`、`claude-sonnet-4-6` 或当前 selected value 合成项。
- 当用户点击 Claude Code selector 的 `刷新配置` 且读取成功时，系统 MUST 用最新 settings/env + custom catalog 替换旧 Claude catalog。
- 当 refresh 失败时，系统 MUST 保留刷新前 catalog 与当前 selection，并展示可诊断错误。
- 当某个 option 的 `id` 与 `model` 不同时，发送路径 MUST 使用 `model`，而不是用 `id` 回退覆盖用户配置。
- 当用户自定义 Claude model 与 settings/env 默认 model 指向同一个 runtime `model` 时，合并后的 selector 项 MUST 继续保留默认标记。
- debug diagnostics MUST 能看出最终发送 model 的来源与 resolution 路径。
- 旧版本 backend / remote payload 缺少 `source` 或 `model` 时，frontend MUST 通过 compatibility normalization 继续展示可用列表，并将未知来源显式标记为 `unknown`。
- 当 Codex 等非 Claude provider 的 parent 已传入完整 hydrated catalog 时，presentational selector MUST 直接使用该 catalog，不得再次拼接本地 fallback 而制造重复选项。
- CI gate MUST 至少覆盖 OpenSpec strict validation、frontend focused tests、frontend typecheck、Rust focused tests，以及 `src/services/tauri.test.ts` 的 contract mapping 断言；任一必需 gate 未通过时不得视为实现完成。

## Impact

- Frontend:
  - `src/features/engine/hooks/useEngineController.ts`
  - `src/features/composer/components/ChatInputBox/**`
  - `src/features/models/constants.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/services/tauri.ts`
  - `src/types.ts`
- Backend:
  - `src-tauri/src/engine/status.rs`
  - `src-tauri/src/engine/commands.rs`
  - daemon-side Claude engine mirror if it owns separate model DTO / send sanitization code
- Specs:
  - new `claude-dynamic-model-discovery`
  - modified `composer-model-selector-config-actions`
- Validation:
  - focused frontend tests for selector merge, no fallback, custom model preservation, and send-time `model` resolution
  - Rust tests for settings/env-only catalog and passthrough validation
  - `openspec validate --all --strict --no-interactive`
