## Context

Claude Code 当前存在两条互不相认的链路：

- 生成控制：composer 中的“思考”滑动块读取或写入 Claude provider / `~/.claude/settings.json` 的 `alwaysThinkingEnabled`。
- 展示控制：Messages 渲染层用 `ccgui.claude.hideReasoningModule` 决定是否隐藏 Claude `reasoning` item，且默认不隐藏。

后端实时流和历史解析也不读取 `alwaysThinkingEnabled`：收到 `thinking_delta/reasoning_delta` 或历史 JSONL 中的 `thinking/reasoning` block 后，会继续产出 `reasoning` 数据。这个行为本身不是问题，因为 transcript 数据应该保留；问题在于前端 presentation 没有使用同一个用户意图去决定是否展示。

因此本变更的核心是两层一致性：用户关闭思考时，后端请求 Claude Code 尽量不生成 thinking；如果上游仍返回 reasoning，客户端也不展示 Claude reasoning 模块。用户开启思考时，客户端允许展示。

## Goals / Non-Goals

**Goals:**

- 建立一个 Claude thinking visibility 的 canonical runtime state，来源与 composer 滑动块一致，并在发送 Claude 请求时把关闭意图传给 backend/runtime。
- 将 canonical state 传递到 Messages 渲染层，替代默认依赖 `ccgui.claude.hideReasoningModule`。
- 对 realtime 与 history 使用同一 presentation gate，关闭时不展示 Claude reasoning row / docked reasoning module。
- 后端继续保留 reasoning 数据，不在解析或 event conversion 阶段丢弃 transcript。
- 让 tests 覆盖 composer toggle、history render、realtime render 和非 Claude 隔离。

**Non-Goals:**

- 不改变 Claude CLI 本身；只使用 Claude Code 已支持的请求级禁用入口。
- 不删除或重写历史 JSONL / 内存中的 `reasoning` item。
- 不改变 Codex / Gemini / OpenCode 的 reasoning 展示。
- 不扩展全局 appearance visibility schema。
- 不引入新依赖或新持久化数据模型。

## Decisions

### Decision 1: Visibility gate lives in frontend presentation, not backend parsing

后端 `claude_history.rs` 和 Claude realtime event conversion 继续输出 reasoning 数据；前端 Messages 根据 active engine 与 Claude thinking visibility 决定是否展示。

理由：

- 后端丢弃会破坏 transcript 完整性，重新开启后无法恢复历史 reasoning。
- 当前 bug 是“展示意图未生效”，不是“数据不应存在”。
- presentation gate 可以同时覆盖 realtime、history、reopen、rerender，而不需要修改每个 ingestion 分支。

替代方案是后端按 settings 过滤 reasoning event。这个方案表面简单，但会把展示偏好变成数据损失，并导致同一历史会话在不同设置下解析结果不同，不利于调试。

### Decision 2: Canonical state follows `alwaysThinkingEnabled`

Claude thinking visibility 的 canonical state 使用现有 `alwaysThinkingEnabled`，由当前 provider settings 或 local Claude settings 解析得到。composer 仍负责读写该状态；Messages 通过上层容器或 thread/canvas props 获取 resolved state。

建议语义：

- `alwaysThinkingEnabled === true`：允许展示 Claude reasoning。
- `alwaysThinkingEnabled === false`：隐藏 Claude reasoning presentation。
- `undefined / load failed`：安全回退到当前 settings 读取结果；若仍不可得，保持现有默认可见，避免误隐藏 transcript-heavy history。

替代方案是新增 `showClaudeReasoning` 独立 preference。这个方案会让“生成控制”和“展示控制”继续分裂，用户仍然无法从一个滑动块理解最终行为。

### Decision 2.1: Backend send contract carries request-level disable thinking

前端在 Claude thinking visibility 明确为 `false` 且目标 engine 为 Claude 时，必须向 `engineSendMessage` / `engineSendMessageSync` 传递 `disableThinking=true`。后端将该字段保留到本地、remote daemon 与 sync/async Claude send path，并在启动 Claude Code CLI 时设置 `CLAUDE_CODE_DISABLE_THINKING=1`。

理由：

- Claude Code CLI 没有 `--no-thinking` 这类专用 flag，但官方支持 `CLAUDE_CODE_DISABLE_THINKING=1` 作为 per-process override。
- env 注入是请求级的，不需要改写全局 `~/.claude/settings.json`，不会影响用户下一个手动 Claude Code 会话。
- 即使 CLI 或模型仍输出 reasoning，前端 presentation gate 仍是最终用户可见性的兜底。

非 Claude 引擎必须把该字段视为不适用，不改变 Codex/Gemini/OpenCode 的 reasoning 行为。

### Decision 3: Legacy `ccgui.claude.hideReasoningModule` becomes compatibility override only

现有 localStorage flag 可以保留用于迁移或 debug，但不能作为默认产品行为来源。推荐处理顺序：

1. 如果上层明确传入 `claudeThinkingVisible` / `showClaudeReasoning`，Messages 使用该值。
2. 如果没有传入，才读取 legacy `ccgui.claude.hideReasoningModule` 维持旧测试或调试路径。
3. 新代码不应继续把该 legacy flag 作为用户设置写入目标。

理由：完全删除 legacy flag 会放大回归面；继续默认依赖它则无法完成前后端语义打通。

### Decision 4: Hide at render surface, not reducer storage

关闭状态下，reducer 可以继续保存 `kind: "reasoning"` item；Messages render list 过滤或 docked reasoning list 不生成即可。这样能够保持：

- active turn 数据完整。
- 重新开启后可以立即展示已有 reasoning。
- 搜索、导出、审计等后续能力可以按自己的权限/可见性策略处理。

如果未来发现 memory capture / search provider 泄露 hidden reasoning，再用独立 change 给这些 surface 增加 visibility filter；本变更先只覆盖用户看到的消息幕布。

### Decision 5: Empty-thread fallback must count non-reasoning visible surfaces

Claude history transcript-heavy 场景已有“不要误判为空线程”的要求。引入 reasoning hide 后，空线程判断不能简单因为 reasoning 被隐藏就显示 `messages.emptyThread`。应优先保留以下可见 surface：

- assistant final message
- tool card / command transcript
- approval / file change card
- existing Claude transcript fallback surface

如果一个历史会话只有 reasoning 且用户关闭显示，UI 应避免展示 reasoning 文本，但也不应用“空白损坏”误导用户；可以显示非内容泄露的占位提示，例如“思考内容已按设置隐藏”。

## Risks / Trade-offs

- [Risk] 上层容器没有稳定持有 `alwaysThinkingEnabled`，导致 Messages 只能在部分入口拿到状态。  
  → Mitigation: 先沿现有 ChatInputBoxAdapter 的 resolved value 向上提升或放入 thread canvas 层状态，再传给 Messages；不可让 Messages 自己异步读取 provider settings。

- [Risk] legacy localStorage flag 与滑动块状态冲突。  
  → Mitigation: 明确 prop 优先于 legacy flag；实现中加入测试覆盖“滑动块关闭时即使 legacy flag 缺失也隐藏”和“滑动块开启时不被 legacy flag 默认反向覆盖”。

- [Risk] 隐藏 reasoning 后 transcript-heavy history 看起来信息减少。  
  → Mitigation: 保留 tool / assistant / fallback surface；必要时显示不泄露内容的 hidden placeholder，而不是展示 reasoning body。

- [Risk] realtime reducer 仍保存 hidden reasoning，其他 surface 可能读取到。  
  → Mitigation: 本变更验收范围限定消息幕布；后续如搜索/导出需要同等隐藏，再扩展对应 spec。

- [Risk] `alwaysThinkingEnabled=false` 被用户理解为“Claude 不会产生 thinking”。  
  → Mitigation: UI 文案和 spec 明确它同时代表“请求关闭生成 + 客户端隐藏展示”；上游仍返回时客户端按展示意图处理。

## Migration Plan

1. 保留后端 settings 命令行为，必要时补测试锁定 `alwaysThinkingEnabled` 读写。
2. 在 composer/canvas 层提升 resolved Claude thinking state，形成 Messages 与 send path 可消费的 prop 或上下文。
3. 在 Claude send path 中传递 `disableThinking`，后端对 Claude CLI 注入 `CLAUDE_CODE_DISABLE_THINKING=1`。
4. 修改 Messages 的 `hideClaudeReasoning` 派生逻辑：优先使用 canonical state，legacy flag 只作为 fallback。
5. 让 realtime 与 history 都走同一个 render filter；不要在 loader 或 reducer 里删除 reasoning。
6. 补齐 focused frontend tests：
   - Claude activeEngine + `alwaysThinkingEnabled=false` 隐藏 reasoning。
   - Claude activeEngine + `alwaysThinkingEnabled=true` 展示 reasoning。
   - 非 Claude activeEngine 不受该状态影响。
   - history restore 的 reasoning 被隐藏但 thread 不误判为空。
7. 跑 OpenSpec、TypeScript、focused Vitest 与必要 Rust tests。

Rollback 策略：撤回 Messages prop 传递和 render gate 修改即可恢复现状；因为不新增持久化 schema，也不迁移历史文件，回滚不需要数据修复。

## Open Questions

- 关闭状态下，对于“只有 reasoning、没有 tool / assistant”的 Claude 历史会话，是否显示一个不泄露内容的隐藏占位提示？建议显示，避免用户误以为历史损坏。
- `ccgui.claude.hideReasoningModule` 是否需要在实现后完全废弃？建议先保留一个版本周期作为 debug fallback，再清理。
- 搜索、复制全部、导出 transcript 是否也应遵守 Claude thinking visibility？这会扩大 surface，建议另起变更或在后续 spec 中明确。
