## Context

这次用户给出的真实 `Claude Code` 历史样本不是“协议变了”，而是典型的 transcript-heavy session：

- `assistant`: 56
- `thinking`: 26
- `tool_use`: 25
- `tool_result`: 24
- `assistant text`: 仅 5

也就是说，这类会话的可读历史主要由 `thinking + tool transcript` 组成，而不是传统聊天模式下的连续 assistant 正文。当前实现对 `Claude` history 的可见面仍然更偏向“正文消息为主”，并且会把部分 command/tool transcript 视为可隐藏 surface，最终导致 reopen 后的历史窗口近似空白。

本次修复必须满足两个边界：

1. **只针对 Claude Code 引擎**
2. **只针对 history restore / transcript visible surface**

不能把这次修复扩散到 `Codex` / `Gemini` 的通用幕布规则，也不能借机重做整个 timeline 体验。

## Goals / Non-Goals

**Goals**

- 修复 `Claude Code` 历史恢复在 transcript-heavy session 下的空白误判。
- 保证 history reopen 后至少存在可读 surface，而不是 empty-thread placeholder。
- 将 fallback 限定在 `Claude`、非 realtime、确有 transcript-heavy evidence 的场景。
- 用真实样本特征补回归测试，避免再次“修过但没修对”。

**Non-Goals**

- 不修改 `Codex` / `Gemini` / `OpenCode` 的历史渲染行为。
- 不全量开放 `Claude` 的所有 command transcript 为默认高噪声展示。
- 不修改 conversation storage schema、Rust session 持久化结构或通用 reducer contract。
- 不把本次修复扩展成新的全局 render-safe policy。

## Options

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 在 loader 侧强行把更多 tool/result 转成普通 assistant text | 看起来能快速“补正文” | 语义污染严重，把 transcript 伪装成自然语言；会影响历史/实时 parity | 不采用 |
| B | 在 `Claude` history render 层增加 transcript-heavy fallback，只在空白误判场景放开 tool transcript | 改动面最小，边界清晰，不污染其他引擎 | 需要精确识别触发条件，避免日常历史界面变吵 | **采用** |
| C | 全局调整 timeline，所有引擎都把 command/tool transcript 作为 history 一等可见项 | 长期统一 | 范围过大，违背“只修 Claude”边界 | 不采用 |

## Decision

采用 **B**：在 `Messages` 历史 presentation 层增加一个 **Claude history transcript fallback**。

### Trigger 条件

仅在以下条件同时满足时启用：

- `activeEngine === "claude"`
- `isThinking === false`
- 当前不是 history loading
- 当前窗口按现有规则得出的 `presentationRenderedItems` 极少或为空
- 原始 `timelinePresentationItems` / `groupedEntries` 中存在明显 transcript-heavy evidence：
  - 多个 `tool` 项，尤其 command/bash transcript
  - 或多个 `reasoning` 项
  - 且普通 assistant 正文极少

### Fallback 行为

- 默认历史规则继续生效
- 只有命中上述 trigger 时：
  - 不再把 `Claude` 的 command/bash transcript 全部视为可隐藏项
  - 允许 `tool` transcript 成为历史可见面的一部分
  - 避免 `MessagesTimeline` 落到 empty-thread placeholder

### 为什么不直接改 loader

当前真实问题不是 loader 完全读不到：

- 样本里 block type 没漂移
- parser 也能识别 `thinking/tool_use/tool_result`

真正问题发生在 **history visible-surface**：

- `Claude` transcript 本身正文稀少
- timeline 对 command/tool 展示又过于激进地隐藏

因此修复点应该放在 `Messages` presentation contract，而不是伪造新的 assistant text。

## Affected Code Paths

- `src/features/messages/components/Messages.tsx`
  - 新增 `Claude history transcript fallback` 判断
- `src/features/messages/components/MessagesTimeline.tsx`
  - 仅在 fallback 命中时允许 `Claude` bash/tool transcript 渲染
- `src/features/messages/components/messagesRenderUtils.ts`
  - 提供更明确的 `Claude history transcript` 判定 helper 或 render guard

## Acceptance Criteria

1. 使用 transcript-heavy `Claude Code` 历史样本 reopen 时，消息区不得显示 `messages.emptyThread`。
2. 命中 fallback 时，至少能看到 `tool` 或 `reasoning` 组成的可读历史 surface。
3. `Codex` / `Gemini` / `OpenCode` 的历史展示行为不得因此变化。
4. `Claude` realtime processing 路径不得被这次修复放大噪声。
5. 现有普通 `Claude` 历史（有正常 assistant text）不得退化成“到处显示 command transcript”。

## Verification Plan

- focused tests:
  - `src/features/messages/components/Messages.history-loading.test.tsx`
  - `src/features/threads/loaders/claudeHistoryLoader.test.ts`
  - `src/features/threads/hooks/useThreadActions.claude-history.test.tsx`
- quality gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npx vitest run src/features/messages/components/Messages.history-loading.test.tsx src/features/threads/loaders/claudeHistoryLoader.test.ts src/features/threads/hooks/useThreadActions.claude-history.test.tsx`
