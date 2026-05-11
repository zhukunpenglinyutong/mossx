## Context

Claude Code CLI 的 reasoning effort 是一次会话启动时的 runtime option，语义上接近 send-time execution control，而不是 model identity、provider catalog 或全局配置。当前 CodeMoss 已有 Claude model discovery、composer provider selector、Tauri IPC 和 Rust engine command building 链路；本变更需要沿这条链路增加一个可选字段，并确保它只在 Claude Code 路径生效。

关键约束：

- `effort` 在本变更中必须作为 Claude-specific CLI 参数处理，不能泄漏到 Gemini、OpenCode，也不能改变 Codex 既有 reasoning selector / send contract。
- 未选择 effort 时必须保持 Claude CLI 默认行为，不能暗自注入默认值。
- 合法值必须在 engine boundary 再校验一次，不能只依赖前端 UI。
- 现有 Claude model discovery / custom model / refresh config 契约不能被复用或改写。

## Goals / Non-Goals

**Goals:**

- 在前端 Claude provider 下展示 reasoning selector，并把选择写入 Claude send params。
- 让 TypeScript service / Tauri IPC 保留 `effort` 字段，避免跨层 mapping 丢失。
- 让 Rust Claude engine 在 `build_command` 中校验合法 effort 后追加 `--effort <value>`。
- 用测试覆盖 UI 显隐、send params mapping、backend allowlist 和 CLI args 输出。

**Non-Goals:**

- 不为 Gemini、OpenCode 添加 Claude-specific reasoning effort 运行时参数，也不改变 Codex 既有 reasoning effort 语义。
- 不把 effort 合入 model selector、model catalog 或 provider refresh 行为。
- 不增加 CLI feature detection，不因当前机器 Claude CLI 版本差异改变参数契约。
- 不持久化新的全局默认 effort 设置。

## Decisions

### Decision 1: 使用显式 `effort` send param

`effort` 作为 Claude message send 参数中的可选字段传递，而不是编码到 model id、system prompt 或 provider setting。

理由：

- Reasoning effort 是当前 turn/session 的 execution option，生命周期短于 model catalog。
- 显式字段让前端、IPC、backend 和测试都能直接审计参数是否被保留。
- 避免污染 `claude-dynamic-model-discovery` 中已经定义好的 id/model/source 分层契约。

备选方案：

- 编码进 model id：会把 runtime option 伪装成 model identity，破坏 model selector 语义。
- 存进 provider config：会让 per-turn 控制退化成全局状态，用户切换会话时行为不透明。

### Decision 2: 前端负责 provider gating，后端负责最终 allowlist

前端在 Claude Code provider / engine 下展示 Claude 可用的 reasoning selector，并只让 Claude send payload 的 `effort` 进入 Claude CLI 参数拼接。Rust backend 仍必须对 `params.effort` 做 allowlist 校验，合法值为 `low`、`medium`、`high`、`xhigh`、`max`。

理由：

- UI gating 降低误用概率，避免其他 provider 暴露无效控件。
- Backend allowlist 是安全边界，防止 devtools、兼容路径或旧客户端传入任意 CLI 参数。
- allowlist 校验比字符串透传更稳，能防止 command argument injection 和未来值漂移。

备选方案：

- 只做前端校验：无法防住 IPC 或兼容客户端构造非法 payload。
- 后端遇到非法值直接报错：会让旧客户端或脏本地状态影响主发送链路；本变更采用忽略非法 effort 的 fail-soft 策略。

### Decision 3: 不注入默认 effort

当 `effort` 缺失、为空或非法时，Claude engine 不追加 `--effort`。

理由：

- Claude CLI 自身默认策略才是当前基线，CodeMoss 不应隐式改变用户已有体验。
- 不注入默认值可以降低回滚成本；移除 UI 或字段后运行时自然回到旧行为。
- 未来若需要 default effort，应另开 change 定义持久化、迁移和 UI 表达。

备选方案：

- 默认 `medium`：看似贴近 CLI 常见值，但会改变未选择用户的 runtime 行为。
- 读取全局默认配置：超出当前需求，会引入状态迁移和配置治理问题。

### Decision 4: UI 使用中文主标签并显式表达 Claude 默认

Reasoning selector 的中文主标签定为 `思考强度`，选项值保留 Claude CLI 原始值 `low`、`medium`、`high`、`xhigh`、`max`。未选择时 UI MUST 表达为 `Claude 默认` 或等价空值状态，发送 payload 不包含有效 `effort`。

理由：

- 中文主标签符合项目交互语言，CLI 原值保留能避免实现层再做一套含义映射。
- 显式展示 `Claude 默认` 能让用户知道当前没有覆盖 CLI 行为，而不是误以为系统选择了 `medium`。
- 空值状态与 Decision 3 对齐，避免 UI 显示和 backend 参数行为不一致。

备选方案：

- 全英文 `Reasoning Effort`：技术含义清晰，但和当前中文交互不一致。
- 默认选中 `medium`：UI 简单，但会隐式改变未选择用户的 CLI 行为。

## Risks / Trade-offs

- [Risk] Claude CLI 版本不支持 `--effort` 时，选择 effort 可能导致命令失败。→ Mitigation：本变更不做动态探测，但错误会按现有 Claude CLI failure path 暴露；如需兼容旧 CLI，后续单独定义 CLI capability detection。
- [Risk] 跨层类型更新不完整会导致 `effort` 在 service / IPC mapping 中丢失。→ Mitigation：增加 service mapping test 和 Rust command-building test，要求 `high` 等合法值最终出现在 CLI args。
- [Risk] Claude-specific selector 或 CLI 参数被错误泄漏给非 Claude provider。→ Mitigation：增加 provider gating 测试，断言 Gemini/OpenCode 不显示 Claude selector，并断言非 Claude engine 不追加 Claude-specific CLI 参数；Codex 既有 reasoning 行为保持原契约。
- [Risk] 将 effort 混入 model selector 可能回退 Claude model discovery 语义。→ Mitigation：实现任务明确禁止修改 model catalog merge 与 runtime model resolution contract。

## Migration Plan

1. 扩展前端 Claude send params 类型，新增可选 `effort` 字段。
2. 在 Claude provider UI 下接入 reasoning selector，并把值写入发送 payload。
3. 更新 Tauri service / IPC mapping，确保 `effort` 保留到 backend。
4. 更新 Rust Claude engine 参数结构和 `build_command`，添加 allowlist 与 `--effort` 拼接。
5. 增加 focused tests：前端显隐、payload mapping、Rust CLI args 构建、非法值忽略。
6. 运行 OpenSpec strict validation、TypeScript typecheck、相关 Vitest 和 Rust tests。

Rollback strategy:

- 前端移除 selector 或停止传递 `effort` 后，backend 因字段缺失不会追加 `--effort`。
- Backend 若需快速回滚，只需移除 `build_command` 中 `--effort` 拼接逻辑；保留可选字段不会破坏旧 payload。

## Open Questions

- 无。
