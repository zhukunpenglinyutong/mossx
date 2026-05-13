## Why

Claude Code CLI 已支持通过 `--effort <level>` 指定当前会话的 reasoning effort，但 CodeMoss 目前没有把前端选择传递到 Claude engine 启动命令，导致用户即使在 UI 中表达“思考强度”意图，运行时也不会生效。

这个变更把 Claude 的 reasoning effort 作为显式、可验证的 send-time runtime option：前端在 Claude provider 下展示 Claude 可用的 reasoning selector，后端只把合法 effort 值追加到 Claude CLI 参数中。

## 目标与边界

- 目标：让 Claude engine 的 `build_command` 从 `params.effort` 读取合法 reasoning effort，并追加 `--effort <value>`。
- 目标：允许前端在 Claude provider / Claude Code engine 上展示 reasoning selector，并将选择随发送参数传递到 engine。
- 目标：非法、空值或非 Claude provider 的 effort 输入必须被忽略或阻断，不能污染其他 engine 的启动参数。
- 边界：本变更只定义 Claude Code CLI 的 reasoning effort 透传与 UI 显隐契约，不重构 model selector、engine selector 或 prompt 发送主链路。

## 非目标

- 不改变 Codex 既有 reasoning selector 行为；不为 Gemini、OpenCode 增加 Claude-specific reasoning selector 或 CLI 参数映射。
- 不改变 Claude model discovery、model catalog merge、custom model 或 refresh config 行为。
- 不引入新的 reasoning effort 默认值策略；未选择时保持 Claude CLI 默认行为。
- 不实现动态探测 Claude CLI 是否支持 `--effort`，本阶段按已知 CLI contract 做参数透传。

## What Changes

- Claude send params 增加可选 `effort` 字段，允许值限定为 `low`、`medium`、`high`、`xhigh`、`max`。
- Claude engine 构建启动命令时校验 `params.effort`；合法时追加 `--effort <value>`，非法或缺失时不追加。
- 前端 composer / Claude provider 配置允许展示 reasoning selector，并把用户选择随 Claude message send 参数传递到 backend。
- UI 显隐必须 provider-scoped：Claude Code 路径展示 Claude 可用的 reasoning selector；Gemini、OpenCode 不展示 Claude-specific selector，任何非 Claude engine 都不得追加 Claude CLI 参数。
- 验证覆盖前端显隐、参数传递、后端 CLI 参数构建和非法值防护。

## 技术方案取舍

### 方案 A：在 Claude send params 中增加显式 `effort` 字段

- 做法：扩展 Claude 发送参数类型，在 UI 选择后随 `engine_send_message` 传入；Claude engine 的 `build_command` 做 allowlist 校验后追加 `--effort`。
- 优点：契约清晰，参数只在 Claude runtime 边界生效；测试可以直接覆盖 params 到 CLI args 的映射。
- 缺点：需要同步更新前端类型、Tauri IPC mapping 与 Rust engine 参数结构。

### 方案 B：把 reasoning effort 编码进 model 或 provider 配置

- 做法：把 effort 当成模型配置或 provider-level setting，发送时从配置读取。
- 优点：短期 UI 改动可能更少。
- 缺点：会混淆 model selection 与 runtime execution options；同一 model 在不同会话不能自然使用不同 effort；也容易污染现有 Claude model discovery contract。

### 结论

选择方案 A。Reasoning effort 是 send-time runtime option，不是 model identity，也不是 provider catalog 配置。显式字段能把 UI 意图、IPC contract 和 CLI 参数拼接保持在同一条可审计链路上，避免对现有 model selector 语义做错误复用。

## Capabilities

### New Capabilities

- `claude-reasoning-effort-support`: 定义 Claude Code reasoning effort selector 的显隐、发送参数透传、CLI 参数构建和非法值防护契约。

### Modified Capabilities

- 无。

## Impact

- 前端：Claude composer / provider selector 相关组件需要按 provider 显示 reasoning selector，并把选中值写入发送参数。
- TypeScript contract：发送参数类型需要新增可选 `effort` 字段，并限制合法值集合。
- Tauri service / IPC mapping：需要确保 `effort` 从前端传到 backend 时不被丢弃。
- Rust backend：Claude engine 参数结构和 `build_command` 需要解析并校验 `effort`，只对合法值追加 `--effort`。
- Tests：需要增加 focused frontend tests、service mapping tests、Rust command building tests；完成前应运行 OpenSpec strict validation、TypeScript typecheck 和相关测试。
- Dependencies：不新增第三方依赖。

## 验收标准

- 当用户在 Claude provider 下选择 `high` 并发送消息时，Claude CLI 启动命令包含 `--effort high`。
- 当 `params.effort` 为 `low`、`medium`、`high`、`xhigh`、`max` 任一合法值时，Claude engine 均追加对应 `--effort <value>`。
- 当 `params.effort` 缺失、为空或不在 allowlist 中时，Claude engine 不追加 `--effort`，且不影响消息发送主流程。
- 当当前 provider 不是 Claude Code 时，不向对应 engine 传递 Claude-specific effort 参数，也不追加 Claude CLI `--effort`。
- 现有 Claude model selector、model refresh、custom model 和 runtime model resolution 行为保持不变。
