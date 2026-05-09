## Context

当前 Claude model 链路的核心问题不是“缺少更多内置模型”，而是 GUI 把多个非权威来源混在一起：frontend 静态模型、backend fallback、`claude --help` 示例、settings/env 覆盖和用户自定义模型。结果是 selector 会展示用户没有配置的模型，例如 `Sonnet` / `Opus` / `Claude Sonnet 4 6`，并可能在发送时把 UI id 当作 runtime `model`。

本设计将 Claude Code model catalog 收敛为“user-controlled sources only”：settings/env overrides + 用户自定义模型。没有显式配置时，Claude selector 可以为空；这比展示伪模型更安全。

## Goals / Non-Goals

**Goals:**

- Claude selector 只展示 settings/env overrides 和用户自定义 Claude models。
- 建立明确的 `id` / `model` 分层：`id` 是 GUI identity，`model` 是 CLI runtime value。
- 保留自定义模型添加、settings/env overrides 和 passthrough send 行为。
- refresh 成功时替换旧 catalog，防止供应商切换后旧模型残留。
- refresh 失败时保留旧 catalog、当前 selection 与自定义模型。
- 为刷新、发送和 debug 提供可诊断的 model source / resolution path。

**Non-Goals:**

- 不实现 Claude 官方模型数据库或远端模型市场。
- 不解析 `claude --help` / interactive `/model` UI。
- 不维护 `sonnet` / `opus` / `haiku` builtin fallback catalog。
- 不禁止非官方、代理或 provider-scoped custom model。
- 不改变 Codex / Gemini / OpenCode provider 的 model 规则。
- 不改写 `~/.claude/settings.json` 或其他用户外部配置。

## Decisions

### Decision 1: Claude Catalog Uses Settings/Env And Custom Models Only

Claude Code 当前没有稳定、可脚本化、结构化的 model list contract。`claude --help` 是帮助文案，`claude model --help` 在本机 Claude Code `2.1.126` 会进入交互路径，不能作为 backend model catalog。

因此第一版实现只使用两类来源：

1. `~/.claude/settings.json` 与相关 env 中的显式 model overrides。
2. 用户在 GUI 中显式添加的 Claude custom models。

明确不采用：

- `claude --help` 中出现的 `sonnet`、`opus`、`haiku` 或 `claude-sonnet-4-6` 示例。
- backend builtin fallback。
- frontend static Claude model list。
- 空列表时把当前 selected value 合成为 Claude option。

这会让“没有任何配置/自定义模型”的 Claude selector 为空。该行为是有意的：空状态比展示未配置、未确认、本机不一定支持的模型更符合用户预期。

### Decision 2: Model Entries Carry Source And Runtime Value

Claude model entry 需要在 frontend contract 中表达至少四类信息：

- `id`: GUI 稳定 identity，用于 selection、持久化、去重。
- `model`: 真实传给 Claude Code CLI 的 runtime value。
- `displayName`: 用户可读名称。
- `source`: 来源，例如 `settings-override`、`custom`、`unknown`。

兼容性写法：

- Rust DTO 增加字段时保持 serde backward compatibility；旧字段缺失时不能导致 command 反序列化失败。
- Frontend boundary normalization 把缺失或空 `source` 显式归一为 `unknown`。
- 旧 payload 缺少 `model` 时，只能在 normalization 层生成 compatibility candidate；发送前仍必须走 resolution / legacy migration。
- 自定义模型（例如 `Cxn[1m]`）必须作为 `source=custom` 的独立 entry 进入 selector，且 `id` 与 runtime `model` 默认同值。

### Decision 3: Merge Precedence Preserves User Intent

catalog 合并顺序采用“configured source + explicit user intent”：

1. Backend settings/env override entries。
2. 用户自定义模型。

前端展示时用户自定义模型排在前面；如果自定义模型与 settings/env entry runtime `model` 相同，可以去重，但不得删除用户可选语义。

如果被去重的 runtime `model` 同时是 backend 标记的默认项，则 merged entry 仍必须保留 `isDefault=true`。否则 selector 会在“custom 覆盖 configured default”的情况下丢失默认语义，导致 UI 默认态与 send-time fallback 漂移。

### Decision 4: Refresh Success Replaces Catalog; Failure Preserves Catalog

Claude selector 的 `刷新配置` 重新读取 settings/env overrides，并重新合并自定义模型。

成功刷新时：

- 使用新 catalog 替换旧 backend catalog。
- 如果新 settings/env 为空，旧 provider models 必须被清掉。
- 自定义模型仍保留。

失败时：

- 保留刷新前 catalog。
- 保留当前 selection。
- 保留用户自定义模型。
- 记录可诊断错误。

### Decision 5: Legacy Selection Must Be Migrated Before Send

旧版本可能持久化了 `claude-opus-4-6`、`claude-opus-4-6[1m]` 这类既像 id 又像 model 的值。发送前必须经过 resolution：

- 先按 current catalog id 查找 entry。
- 未命中时按 runtime `model` 查找 entry。
- 如果命中用户 custom 或 settings override，直接使用其 runtime `model`。
- 仍无法解析时走 default selection fallback 或显式报错，不得继续发送已知废弃的 legacy id。

该迁移必须兼容自定义模型：自定义模型不应因为不在官方 list 中而被误判为 legacy invalid。

### Decision 6: Backend Still Validates Shape, Not Officialness

backend Claude send path 只做基本 shape validation 和安全边界校验，不做“官方模型白名单”拦截。原因是用户自定义模型、代理模型、provider-scoped model 需要继续 passthrough。

官方支持性由 Claude Code CLI runtime 自身决定；GUI 不应把未知但用户显式添加的 model 阻断掉。

### Decision 7: CI Gates Are Part Of The Contract

最低 gate：

1. `openspec validate dynamic-claude-model-discovery --strict --no-interactive`
2. `src/services/tauri.test.ts` 覆盖 `get_engine_models` 不丢 `model` / `source`，以及 `engine_send_message` 使用 resolved runtime `model`
3. focused `useEngineController` / selector merge tests 覆盖 custom preservation、no fallback、id/model divergence
4. focused `useThreadMessaging` tests 覆盖 legacy migration、custom passthrough、unmigratable fallback
5. `npm run typecheck`
6. focused Rust tests 覆盖 settings/env-only catalog 与 shape-only passthrough validation

如果实现同时触及 daemon/remote path，还必须补 service/remote compatibility test 或在 verification 中记录 no-op 证明。任何必需 gate 失败时，tasks 中对应 verification 项不得勾选。

### Decision 8: Parent Catalog Beats Local Cache And Child Re-Merge

刷新后的 provider catalog 必须以 parent 传入结果为准。具体包括：

- Claude refreshed catalog 的 label / source / runtime `model` 不得被 stale `claude-model-mapping` localStorage cache 重写。
- Codex/Gemini/OpenCode 等非 Claude provider 如果 parent 已经传入 hydrated catalog，presentational child 组件不得再执行一轮本地 fallback merge，否则会重复插入 builtin/custom entry。

local cache 只允许作为 legacy display fallback，不能反过来覆盖 refresh 结果或 parent contract。

## Risks / Trade-offs

- [Risk] 未配置时 Claude selector 为空 → Mitigation: 保留“添加模型”和 provider settings 配置路径；这是比伪 fallback 更清晰的空状态。
- [Risk] custom model 与 settings override 同 runtime value → Mitigation: 以 runtime `model` 去重，保留 source metadata 与更明确 displayName。
- [Risk] legacy selection migration 误伤用户自定义 model → Mitigation: custom source 永远优先保留；只有命中已知 legacy pattern 且没有 custom/settings entry 时才迁移或报错。
- [Risk] refresh 失败影响 composer 使用 → Mitigation: 失败不清空旧 catalog；成功空结果才清空旧 backend catalog。
- [Risk] frontend/backend/daemon 三处 Claude model 逻辑漂移 → Mitigation: 共享 DTO contract，daemon mirror 纳入任务和 focused Rust tests。
- [Risk] 新字段破坏旧 remote/backend payload → Mitigation: frontend/service boundary 做 optional-field normalization，`source` 缺失标记 `unknown`，`model` 缺失进入 explicit compatibility path。
- [Risk] child selector 再次合并 parent 已注水 catalog → Mitigation: parent hydrated catalog 视为 source of truth；只在 parent 未提供模型时才启用本地 fallback merge。

## Migration Plan

1. 扩展 model entry contract，增加 runtime `model` 与 source metadata，同时保持旧字段兼容。
2. 调整 backend Claude model catalog：只读取 settings/env model overrides，不再解析 `claude --help`，不再返回 builtin fallback。
3. 调整 frontend selector merge：settings/env entries + 用户自定义模型；Claude 空 catalog 不合成 fallback option。
4. 调整 send-time resolution：使用 runtime `model`，并处理 legacy selection migration。
5. 补充 focused tests 后移除旧静态 catalog 主路径。
6. 在 CI / local gate 中固定跨层验证矩阵，确保 contract 字段与 no-fallback 语义不会回退。

Rollback 策略：如果 settings/env 读取在部分环境不稳定，可以临时保留刷新失败时的旧 catalog；但不应恢复 `claude --help` parser 或 builtin fallback。自定义模型 passthrough 和 send-time runtime model contract 不应回滚。
