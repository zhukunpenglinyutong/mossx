## Why

部分 `Claude Code` 历史会话在 reopen 后会显示成“几乎空白”或直接落到 empty-thread placeholder，但同一会话继续提问时又能继承既有上下文。最新问题样本表明，这类会话并不是 session 丢失，而是 transcript 以 `thinking` / `tool_use` / `tool_result` 为主、`assistant text` 极少，导致当前历史可见面把它误判成“没有可读内容”。

现在需要尽快修复，因为这已经是反复出现的老问题，而且真实用户样本已经证明它不是偶发解析错误，而是 `Claude Code` 专属 transcript profile 与当前 history visible-surface contract 不匹配。

## What Changes

- 为 `Claude Code` 历史恢复增加 transcript-heavy blanking protection：
  - 当历史会话以 `thinking` / `tool` transcript 为主、普通 assistant 正文极少时，系统不得把该会话渲染为空白或 empty-thread placeholder。
- 在 `Claude` 专属 history render path 中增加保守 fallback：
  - 仅在 `Claude`、非 realtime、历史恢复场景命中 transcript-heavy profile 时，保留必要的 tool transcript 可见面，避免把唯一可读历史全部隐藏。
- 为本次问题样本补回归测试，锁定：
  - loader 能保留 transcript-heavy history
  - history UI 不再把这类会话误判为空线程
  - 修复边界限定在 `Claude Code`，不扩散到其他引擎

## Capabilities

### New Capabilities

- `claude-history-transcript-visibility`: 约束 `Claude Code` 历史恢复在 transcript-heavy 会话下的最小可见面与空白保护

### Modified Capabilities

- `conversation-render-surface-stability`: 补充 `Claude` 历史恢复场景下的 readable surface 保底要求
- `thread-actions-session-runtime-compatibility`: 补充 `Claude` 历史 reload 与空白误判修复后的兼容性要求

## Impact

- `src/features/messages/components/Messages.tsx`
- `src/features/messages/components/MessagesTimeline.tsx`
- `src/features/messages/components/messagesRenderUtils.ts`
- `src/features/messages/components/Messages.history-loading.test.tsx`
- `src/features/threads/loaders/claudeHistoryLoader.test.ts`
- `src/features/threads/hooks/useThreadActions.claude-history.test.tsx`
- `openspec/specs/claude-history-transcript-visibility/spec.md`
- `openspec/specs/conversation-render-surface-stability/spec.md`
- `openspec/specs/thread-actions-session-runtime-compatibility/spec.md`
