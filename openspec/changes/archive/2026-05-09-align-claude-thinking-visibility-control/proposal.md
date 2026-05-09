## Why

Claude Code 的“思考”滑动块当前只写入后端 Claude settings / provider settings，用于影响 Claude 是否生成 thinking；但消息幕布在实时流和历史回放中只要收到 `reasoning` item 就继续展示思考内容。这个前后端语义断裂会让用户看到“滑动块关闭，但幕布仍输出思考”的错位体验。

本变更需要把 Claude thinking 的生成控制与幕布展示控制打通：同一个用户意图必须在 settings、实时流、历史回放、消息渲染中表现一致，同时保留底层 transcript 数据以支持审计、恢复和未来重新展示。

## 目标与边界

### 目标

- 明确 Claude “思考”滑动块的产品语义：关闭时，用户可见幕布不得展示 Claude reasoning / thinking 内容；开启时，允许展示 Claude reasoning / thinking 内容。
- 统一前后端状态来源，避免后端 `alwaysThinkingEnabled` 与前端独立 `ccgui.claude.hideReasoningModule` 出现互相打架的双开关。
- 让 realtime stream 与 history restore 使用同一展示策略：
  - 实时收到 `thinking_delta/reasoning_delta` 时，关闭状态下不渲染可见 reasoning 模块。
  - 历史 JSONL 存在 `thinking/reasoning` block 时，关闭状态下不在幕布中展示可见 reasoning 模块。
- 保留底层 reasoning transcript 数据，不把展示隐藏误实现为后端丢弃数据，避免破坏历史恢复、审计和诊断。
- 保持非 Claude 引擎现有 reasoning 展示契约不变。

### 边界

- 本变更只覆盖 Claude Code 的 thinking / reasoning 可见性一致性。
- 本变更不改变 Claude CLI 本身；当 Claude Code 支持请求级禁用 thinking 时，后端必须传递该意图。如果上游仍返回 reasoning，客户端仍必须按用户可见性意图隐藏。
- 本变更不改变 Codex / Gemini / OpenCode 的 reasoning 生成或展示策略。
- 本变更不删除既有 transcript 数据，只调整用户可见 presentation。
- 本变更不重做全局 appearance visibility 系统，只要求 Claude thinking 滑动块与幕布 reasoning 展示策略对齐。

## 非目标

- 不新增第二套 Claude 专属消息类型。
- 不把 hidden reasoning 从持久化历史中物理删除。
- 不把 reasoning 内容混入 assistant final message 以规避隐藏逻辑。
- 不用 localStorage debug flag 作为长期产品配置源。
- 不调整 Codex reasoning effort、Gemini thinking 或其他模型参数含义。

## What Changes

- Claude thinking 滑动块将成为 Claude reasoning 可见性的 canonical user intent：
  - 开启：后端/provider settings 继续写入 `alwaysThinkingEnabled=true`，前端允许展示 Claude reasoning。
  - 关闭：后端/provider settings 继续写入 `alwaysThinkingEnabled=false`，发送 Claude 请求时传递请求级禁用 thinking 意图，前端必须隐藏 Claude reasoning 可见模块作为兜底。
- Claude engine send contract 需要携带 `disableThinking`，并只在 Claude thinking visibility 显式为关闭时对 Claude 请求生效；非 Claude 引擎不得受该字段影响。
- 前端消息渲染需要从 canonical Claude thinking visibility state 派生 `hideClaudeReasoning`，不能继续依赖独立的 `ccgui.claude.hideReasoningModule` 作为默认产品行为。
- Claude realtime reasoning ingress 需要保持数据链路完整，但关闭状态下不得产生用户可见 reasoning row / docked reasoning module。
- Claude history restore 需要保留解析出的 reasoning 数据能力，但关闭状态下幕布不得展示历史 reasoning 文本；普通 assistant final message、tool card、approval card 仍按既有规则展示。
- 现有 `ccgui.claude.hideReasoningModule` 若仍保留，只能作为兼容/调试 override，不能覆盖滑动块的默认产品语义。
- 增加跨层测试覆盖：
  - 滑动块关闭后，Claude 实时 reasoning delta 不在幕布展示。
  - 滑动块关闭后，Claude history reasoning block 不在幕布展示。
  - 滑动块开启后，Claude realtime/history reasoning 可按既有样式展示。
  - 非 Claude reasoning 展示不受 Claude thinking 滑动块影响。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 后端解析时直接丢弃 Claude `thinking/reasoning` block | 前端改动少，展示上立刻消失 | 破坏 transcript 完整性；历史审计和后续重新开启无法恢复；容易误伤诊断 | 不采用 |
| B | 保持现状，只把 `ccgui.claude.hideReasoningModule` 暴露成另一个 UI 开关 | 改动小，复用已有隐藏逻辑 | 双开关语义继续分裂；用户仍不知道“思考”滑动块控制什么 | 不采用 |
| C | 以 Claude thinking 滑动块为 canonical user intent，后端负责写 settings，前端用同一状态控制 realtime/history reasoning 展示，数据不丢弃 | 行为与用户直觉一致；保护 transcript；跨层契约清晰 | 需要打通 composer state 到 messages render，并补齐测试 | **采用** |
| D | 引入全局 message visibility preference store，把所有引擎 reasoning 都纳入统一 visibility DSL | 长期扩展性强 | 本轮范围过大，会影响 Codex/Gemini 现有契约 | 暂不采用 |

## Capabilities

### New Capabilities

- 无。本变更不引入新领域能力，只收敛已有 Claude settings、history transcript visibility、realtime stream visibility 与 client UI visibility 的行为一致性。

### Modified Capabilities

- `client-ui-visibility-controls`: 明确 Claude thinking 滑动块关闭时，Claude reasoning 模块属于用户可见 presentation，应按滑动块意图隐藏。
- `claude-history-transcript-visibility`: 明确 Claude history reasoning transcript 必须保留可恢复数据，但在 thinking visibility 关闭时不得作为可见 reasoning 文本展示。
- `claude-code-realtime-stream-visibility`: 明确 Claude realtime reasoning delta 在 thinking visibility 关闭时不得渲染为用户可见 reasoning row，同时不影响 assistant final text progressive visibility。

## 验收标准

- 当用户关闭 Claude “思考”滑动块并发送新消息时：
  - 后端/provider settings MUST 持久化 `alwaysThinkingEnabled=false`。
  - Claude engine request MUST carry a request-level disable-thinking intent when the Claude Code runtime supports it.
  - 若 Claude runtime 仍产生 `thinking_delta/reasoning_delta`，前端 MUST NOT 在消息幕布显示 `思考` / `推理过程` reasoning 模块。
  - assistant final message、tool usage、approval UI MUST 继续正常显示。
- 当用户开启 Claude “思考”滑动块并发送新消息时：
  - 后端/provider settings MUST 持久化 `alwaysThinkingEnabled=true`。
  - Claude realtime/history reasoning MAY 按既有样式显示。
- 当用户在关闭状态下打开包含 Claude reasoning block 的历史会话时：
  - 幕布 MUST NOT 展示 reasoning body text。
  - 该会话 MUST NOT 因隐藏 reasoning 被误判为空线程；仍需保留可读 assistant/tool transcript surface。
- 当用户重新开启 Claude “思考”滑动块并重新打开同一历史会话时：
  - 系统 SHOULD 能基于保留的 transcript 数据恢复 reasoning 展示，而不是要求重新生成会话。
- 非 Claude 引擎：
  - Codex / Gemini / OpenCode reasoning 展示 MUST NOT 受 Claude “思考”滑动块影响。
- 兼容性：
  - 现有 `ccgui.claude.hideReasoningModule` 若存在，MUST 不再导致默认产品行为与滑动块状态相反。
  - 无效或读取失败的 visibility 状态 MUST 安全回退到当前 settings/provider 中的 `alwaysThinkingEnabled`，不得阻断消息发送。
- 验证：
  - 新增或更新 frontend tests 覆盖 Messages render、Claude history loader/render、composer toggle state propagation。
  - 新增或更新 backend tests 覆盖 `vendor_get/set_claude_always_thinking_enabled` 与 provider settings 同步路径。
  - `openspec validate --all --strict --no-interactive` MUST 通过。

## Impact

- Frontend:
  - `src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`
  - `src/features/composer/components/ChatInputBox/selectors/ConfigSelect.tsx`
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/messagesRenderUtils.ts`
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts` 或 realtime event render path 中与 reasoning 可见性相关的入口
- Backend:
  - `src-tauri/src/vendors/commands.rs`
  - `src-tauri/src/engine/claude_history.rs`
  - `src-tauri/src/engine/claude/event_conversion.rs`（仅在需要补充 metadata / visibility hint 时触及）
- Tests:
  - `src/features/messages/components/Messages*.test.tsx`
  - `src/features/threads/loaders/claudeHistoryLoader.test.ts`
  - `src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx`
  - `src-tauri/src/vendors/commands.rs` adjacent tests or existing Rust command tests
- Dependencies:
  - 不新增第三方依赖。
