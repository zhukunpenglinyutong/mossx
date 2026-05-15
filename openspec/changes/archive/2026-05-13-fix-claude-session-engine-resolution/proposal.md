# Fix Claude Session Engine Resolution

## Summary

修复已有 Claude Code 历史会话重新打开时，消息幕布错误使用全局 `selectedEngine` 作为恢复引擎的问题。

## Problem

用户点击 sidebar 中的 Claude Code session 时，当前全局 engine 可能仍是 `codex`。此时 `Messages` 与 `conversationState.meta.engine` 会收到 `codex`，导致 Claude history transcript 被 Codex 恢复/渲染路径解释。

该问题不会影响所有 Claude session：普通 text-heavy 历史可能仍可显示，但 tool/thinking/transcript-heavy 的特殊 Claude session 依赖 Claude scoped fallback，错误 engine 会触发闪屏、空白或加载文案错误。

## Proposed Change

- 恢复已有 thread 时，conversation render engine MUST 优先来自 active thread metadata。
- active thread metadata 包括 `selectedEngine`、`engineSource`，必要时使用 thread id 前缀兜底。
- 全局 `selectedEngine` 只作为没有 active thread engine 时的 fallback，用于新建会话或无历史上下文场景。

## Non-Goals

- 不修改 Claude JSONL parser。
- 不修改 runtime session restore command。
- 不改变 composer 新建会话默认 engine selection。

## Impact

- 影响 `useLayoutNodes` 到 `Messages` 的 engine contract。
- Claude history transcript fallback 将按 active thread 正确启用。
- Codex/Gemini/OpenCode 已有 session 仍按自身 thread metadata 渲染。
