## Context

当前 Claude model 链路存在三个耦合问题：

- GUI 同时维护 frontend 静态模型、backend fallback 模型和用户自定义模型，多个 source of truth 容易漂移。
- `ModelOption.id` 在部分链路里既是 UI selection key，又被当作 runtime `model` 传给 `claude --model`，导致 label/id 与真实发送参数混淆。
- Claude Code CLI 的官方 alias 与完整 model name 会随 CLI 版本演进，GUI 写死模型版本会天然落后于用户本机 CLI 能力。

本设计把 Claude model catalog 调整成“CLI discovery first, user customization preserved, fallback safe”的模型：只把 Claude Code CLI 当前可发现能力作为官方模型事实源；用户显式添加或配置的模型作为 override 合并；静态 fallback 只用于不可用场景保底。

## Goals / Non-Goals

**Goals:**

- 以 Claude Code CLI 动态发现结果驱动 Claude model selector。
- 建立明确的 `id` / `model` 分层：`id` 是 GUI identity，`model` 是 CLI runtime value。
- 保留现有自定义模型添加、Claude model mapping、settings/env overrides 和 passthrough send 行为。
- discovery 失败时保留旧 catalog、当前 selection 与自定义模型，避免用户被清空列表。
- 为刷新、发送和 debug 提供可诊断的 model source / resolution path。

**Non-Goals:**

- 不实现 Claude 官方模型数据库或远端模型市场。
- 不禁止非官方、代理或 provider-scoped custom model。
- 不把 alias 强制展开为某个 GUI 写死版本。
- 不改变 Codex / Gemini / OpenCode provider 的 model 规则。
- 不改写 `~/.claude/settings.json` 或其他用户外部配置。

## Decisions

### Decision 1: Claude Model Catalog Uses CLI Discovery As Primary Source

Claude model catalog 的 primary source SHALL be current Claude Code CLI discovery result。实现可以先复用现有 `get_engine_models("claude")` 路径，但其语义要从“fallback list plus help hints”收紧为“CLI-discovered catalog plus compatible fallback”。

第一版实现前必须先确认当前 Claude Code CLI 的可用 discovery source。优先使用稳定结构化输出；如果当前 CLI 没有结构化 model list，必须在实现任务中固定 help/config parsing 的命令、样例 fixture 与失败回退，而不是在代码里临时猜测输出格式。

候选 discovery source 按可靠性排序：

1. Claude Code CLI 暴露的结构化 model/list 入口，如果当前 CLI 版本支持。
2. Claude Code CLI help/config 输出中可稳定解析的 model alias/name 信息。
3. `~/.claude/settings.json` 与相关 env 中的显式 model override。
4. 上一次成功 discovery cache。
5. 最小内置 fallback。

不采用“只靠内置常量”的原因：它无法反映用户本机 CLI 版本，也会持续出现旧 model id 透传。

不采用“完全无 fallback”的原因：CLI 解析失败会让模型 selector 不可用，并破坏用户自定义模型发送能力。

### Decision 2: Model Entries Carry Source And Runtime Value

Claude model entry 需要在 frontend contract 中表达至少四类信息：

- `id`: GUI 稳定 identity，用于 selection、持久化、去重。
- `model`: 真实传给 Claude Code CLI 的 runtime value。
- `displayName`: 用户可读名称。
- `source`: discovery 来源，例如 `cli-discovered`、`custom`、`settings-override`、`cached-fallback`、`builtin-fallback`。

`model` 为空时可以临时兼容旧 contract，但 send-time resolution MUST 显式归一化为 runtime model；不得把任意 `id` 默默当成 `model`，除非 entry 被判定为 legacy-compatible 且已经通过迁移/校验。

### Decision 3: Merge Precedence Preserves User Intent

catalog 合并顺序采用“CLI truth + explicit user intent preserved”：

1. CLI-discovered entries 作为官方可发现基础。
2. settings/env overrides 插入或覆盖对应 family/alias entry，但必须保留 runtime `model`。
3. 用户自定义模型追加进入 catalog，且必须保留为用户显式 entry；若与 CLI/settings entry runtime model 相同，则可以去重展示，但必须保留 custom source 可诊断性和用户选择语义。
4. cache/fallback 只在 CLI discovery 失败或返回空时补位。

选择这一顺序的原因：CLI 负责官方能力，自定义模型负责用户意图；二者不应互相吞掉。

### Decision 4: Refresh Is Fail-Safe And Observable

Claude selector 的 `刷新配置` SHALL trigger discovery reload and merge。刷新失败时：

- 保留刷新前 catalog。
- 保留当前 selection。
- 保留用户自定义模型。
- 记录可诊断错误。

成功刷新时，如果当前 selection 还能解析到有效 runtime model，则继续保留；否则进入 legacy migration 或现有 default selection fallback。

### Decision 5: Legacy Selection Must Be Migrated Before Send

旧版本可能持久化了 `claude-opus-4-6`、`claude-opus-4-6[1m]` 这类既像 id 又像 model 的值。发送前必须经过 resolution：

- 先按 current catalog id 查找 entry。
- 未命中时按 runtime `model` 查找 entry。
- 再按 legacy family/suffix 迁移到 CLI-discovered alias 或 custom override。
- 仍无法解析时走 default selection fallback 或显式报错，不得继续发送已知废弃的 legacy id。

该迁移必须兼容自定义模型：自定义模型不应因为不在官方 CLI list 中而被误判为 legacy invalid。

### Decision 6: Backend Still Validates Shape, Not Officialness

backend Claude send path 只做基本 shape validation 和安全边界校验，不做“官方模型白名单”拦截。原因是用户自定义模型、代理模型、provider-scoped model 需要继续 passthrough。

官方支持性由 CLI discovery 和 runtime CLI 自身决定；GUI 不应把未知但用户显式添加的 model 阻断掉。

## Risks / Trade-offs

- [Risk] Claude Code CLI 没有稳定结构化 model list 输出 → Mitigation: 实现前先确认命令契约；若只能解析 help/config 输出，必须用 fixtures 固定解析样例，再回退 cache/fallback。
- [Risk] custom model 与 CLI-discovered model 重名或同 runtime value → Mitigation: 以 runtime `model` 去重，保留 source metadata 与更明确 displayName。
- [Risk] legacy selection migration 误伤用户自定义 model → Mitigation: 只有命中已知 legacy pattern 且没有 custom entry 时才迁移；custom source 永远优先保留。
- [Risk] discovery 慢或失败影响 composer 打开体验 → Mitigation: 启动/刷新异步加载，UI 使用上次成功 catalog；失败不清空。
- [Risk] frontend/backend/daemon 三处 Claude model 逻辑漂移 → Mitigation: 抽出共享解析规则或至少同步测试同一批 fixture，daemon mirror 必须纳入任务。

## Migration Plan

1. 扩展 model entry contract，增加 runtime `model` 与 source metadata，同时保持旧字段兼容。
2. 调整 backend Claude model discovery：CLI-first，cache/fallback safe。
3. 调整 frontend engine model merge：CLI entries、settings overrides、自定义模型按 precedence 合并。
4. 调整 send-time resolution：使用 runtime `model`，并处理 legacy selection migration。
5. 补充 focused tests 后再移除或降级旧静态 catalog 的主路径地位。

Rollback 策略：如果 discovery 解析在部分环境不稳定，可以临时关闭 CLI-first merge，让 selector 回到 cached/fallback catalog；自定义模型 passthrough 和 send-time runtime model contract 不应回滚。

## Open Questions

- discovery cache 应存放在现有 settings/storage 还是只保留 runtime memory；如果要跨启动保留，需要定义过期策略。
- 旧 selection 到 alias 的迁移矩阵是否只覆盖已知内置 legacy id，还是允许更多 family inference。
