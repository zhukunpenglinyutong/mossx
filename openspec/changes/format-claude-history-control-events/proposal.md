## Why

Windows 用户仍反馈 Claude Code 历史会话打开后出现空白或明显异常，而 macOS 本地导入同一批 JSONL 可以正常打开，说明问题不是单个 JSONL 文件损坏，而是 Claude history restore 对控制面记录的投影缺少稳定 contract。

当前实现会让部分 Claude CLI 本地命令记录直接以普通聊天文本出现，例如 `<local-command-stdout>Session ... was not found.</local-command-stdout>`、`<command-name>/resume</command-name>` 或 synthetic `No response requested.`。这类记录不应被当成普通 user / assistant message；但其中一部分又具备用户可理解的会话事件语义，直接全部丢弃会让历史上下文变得突兀。因此需要把“内部控制面过滤”和“用户可理解控制事件格式化展示”分开定义。

## 目标与边界

- 将 Claude history 中的本地命令 / session control / model switch 等非对话记录从普通聊天气泡中剥离。
- 对用户可理解且有历史解释价值的事件，渲染为格式化的 control event / status tag，而不是原样 XML-like 文本。
- 对纯内部控制面记录，继续在 backend / frontend restore 过程中过滤，不进入 conversation surface。
- 保持 Windows、macOS、Linux 规则一致；Windows 只是更容易暴露症状，不应引入 Windows-only 分支。
- 保留真实用户和 assistant 对话，避免因为 sanitizer 过宽造成历史内容丢失。

## 非目标

- 不删除或重写用户的 Claude JSONL 原文件。
- 不重构完整消息时间线或 Markdown 渲染架构。
- 不改变 Claude Code 正常 realtime 发送链路。
- 不把所有 control records 都展示出来；内部 bookkeeping 仍应被隐藏。
- 不新增用户开关让用户手动选择是否过滤污染，修复应默认生效。

## 技术方案对比

### 方案 A：全部过滤控制面记录

- 做法：`<command-name>`、`<local-command-stdout>`、synthetic assistant、attachment、queue-operation 等全部不进入 UI。
- 优点：实现最小，能快速消除脏文本和一部分空白风险。
- 缺点：`/resume` 失败、`/model` 切换、用户主动触发的本地命令结果会完全消失，历史看起来断层；也不符合“给个格式好看点”的产品取向。

### 方案 B：全部保留但换样式

- 做法：所有控制面记录都转成标签或卡片展示。
- 优点：最透明，便于 debug。
- 缺点：会把 `permission-mode`、`file-history-snapshot`、`mcp_instructions_delta`、`skill_listing`、`queue-operation` 等内部噪声暴露给普通用户，历史可读性变差，并可能继续制造空白/高噪声回归。

### 方案 C：分类处理（选中）

- 做法：把 Claude history 控制面记录分成两类：
  - 用户可理解事件：如 `/resume` 失败、`/model` 切换、interrupted marker、本地命令 stdout/stderr 中的短结果，投影成格式化标签或 status/control event。
  - 纯内部控制面：如 permission-mode、file-history-snapshot、MCP instructions delta、skill listing、queue bookkeeping、synthetic `No response requested.`，过滤隐藏。
- 优点：既避免 XML-like 脏文本，又保留有解释价值的会话事件；同时降低 Windows history restore 进入空态或异常渲染的概率。
- 缺点：需要补一层分类 contract，并在 backend / frontend fallback 里保持样本矩阵一致。

## What Changes

- Claude history backend loader MUST NOT return Claude CLI local-command XML-like text as normal chat messages.
- Claude history frontend fallback loader MUST apply the same classification when receiving legacy / cached / remote payloads.
- User-meaningful Claude local command events SHOULD render as formatted control events or compact status tags, including at least:
  - `/resume` command attempts and “session not found” results.
  - `/model` or model switch results.
  - user interruption markers.
- Internal-only records MUST be filtered from visible history, including permission-mode, file-history-snapshot, last-prompt, queue-operation bookkeeping, MCP instructions deltas, skill listings, stop hook summaries, turn duration metadata, and synthetic assistant `No response requested.`.
- Mixed transcripts MUST preserve real user / assistant conversation while hiding or formatting non-dialogue records.
- Control-event formatting MUST be engine-scoped to Claude history restore and MUST NOT alter Codex / Gemini / OpenCode history semantics.
- Filtering and formatting MUST be non-destructive: original JSONL files are read as-is and are not rewritten.
- Classification and rendering MUST be written in platform-neutral form: no macOS-only `/Users/...` assumptions, no Windows-only path separator assumptions, and no behavior split where Windows/macOS produce different visible transcript semantics for equivalent JSONL.
- The implementation MUST be covered by CI-compatible gates, including focused Rust and Vitest regression tests that are picked up by the existing backend/frontend CI suites or by an explicitly added gate if existing CI would miss them.

## 回归窗口侧查

用户反馈 `0.4.10` 之前似乎没有 Claude Code 幕布白屏现象。当前 git 侧查结论是：

- `v0.4.10` 已经存在 `is_filtered_message()`，但它只影响 session summary 的 first-message 派生；load path 和 frontend parser 仍可能把 `<local-command-stdout>` 等 local command wrapper 投影成可见消息。
- `v0.4.10..v0.4.14` 期间，`claude_history.rs`、`claudeHistoryLoader.ts`、`Messages.tsx`、`MessagesRows.tsx`、thread assembly/reducer/action 链路合计有大量历史恢复与幕布重构改动；这更像是后续 restore/curtain assembly 把潜伏控制面污染放大成空白，而不是大模型返回本身首次引入污染。
- 因此本 change 不按“回退到 0.4.10 行为”处理，而是补稳定 contract：不管哪个版本写入的 JSONL，只要进入当前 restore 链路，就必须先分类控制面记录再投影到 UI。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `claude-history-transcript-visibility`: Define formatted rendering for user-meaningful Claude local command events and filtering for internal-only Claude control records during history restore.
- `engine-control-plane-isolation`: Extend contaminated transcript containment to distinguish hidden internal control-plane rows from displayable Claude-local control events without exposing them as normal dialogue.

## Impact

- Backend:
  - `src-tauri/src/engine/claude_history.rs`
  - Claude history scan/load classification and Rust regression tests.
- Frontend:
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - Conversation item projection for formatted control events or existing compatible tool/status item types.
  - `src/features/threads/loaders/claudeHistoryLoader.test.ts`
- UI:
  - History restore should no longer display raw `<local-command-stdout>` / `<command-name>` text as chat bubbles.
  - User-visible event rows should appear as compact, styled status tags/cards.
- No external dependencies, storage migration, or JSONL rewrite required.

## 验收标准

- 导入包含 `/resume` 失败记录的 Claude JSONL 后，历史会话可以打开，且不得把 `<command-name>` / `<local-command-stdout>` 原样显示为普通 user message。
- `/resume` 失败、model switch、interrupted marker 等用户可理解事件以格式化标签或 compact event row 展示。
- `permission-mode`、`file-history-snapshot`、`last-prompt`、`queue-operation`、`mcp_instructions_delta`、`skill_listing`、`stop_hook_summary`、`turn_duration`、synthetic `No response requested.` 不进入可见聊天流。
- 真实用户消息和 assistant 正文必须保留；正常用户自然语言提到 `resume`、`stdout`、`app-server` 时不得被关键词误删。
- macOS 可打开的样本在加固后仍可打开；Windows 用户同类样本不得因为控制面污染进入空白历史。
- Windows/macOS 路径、CRLF/LF JSONL 行结尾、Claude project encoded directory 差异不得改变分类结果。
- focused Rust tests、focused Vitest tests、typecheck/runtime-contract gate、OpenSpec strict validation 通过；实现交付中必须记录实际命令结果，并说明现有 CI 是否已覆盖这些 focused regression cases。
