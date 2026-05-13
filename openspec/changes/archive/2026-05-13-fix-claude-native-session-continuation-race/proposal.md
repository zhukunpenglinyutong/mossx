## Why

Claude Code 会话首轮发送后，前端可能在 native `thread/started` session confirmation 尚未到达前，把 backend 启动响应里的 provisional `sessionId` 当成可 `--resume` 的 Claude 原生会话 id。用户快速发起第二轮时，Claude CLI 会收到不存在的 resume id，并返回 `No conversation found with session ID`。

这个问题现在需要修复，因为当前代码已经同时承载 Claude pending thread、finalized native session、fork child session、TUI resume command、sidebar 删除/归档等能力；继续把 provisional id 混入 resume path，会让“第二次对话失败”以竞态形式复现，并扩大到父子 session 与会话管理操作的可信边界。

## 目标与边界

- 修复 Claude pending 会话在 native session truth 未确认前的第二轮 continuation race。
- 明确区分 `provisionalSessionId`、`pendingThreadId`、`nativeResumeSessionId`。
- 只有 Claude native confirmation event 或已 finalized 的 `claude:<session_id>` thread identity 可以作为 `--resume` truth。
- 保持父子 session fork contract：fork 仍通过 `--resume <parent-session-id> --fork-session` 创建 child，不被 pending follow-up guard 误拦截。
- 保持会话删除、归档、Copy ID、Copy Claude resume command、Open in Claude TUI 等 session 管理能力只面向 finalized native ids。
- 保持 Codex、Gemini、OpenCode continuation 语义不变。

## 非目标

- 不修改 Claude JSONL transcript metadata。
- 不改变 Claude CLI print mode、`stream-json` 输出模式或上游 session 存储位置。
- 不把 `claude-pending-*` 暴露为可删除、可 TUI resume、可 fork parent 的 native session。
- 不重构整个 conversation state model 或 sidebar session catalog。
- 不修复 Claude TUI 无参数 `/resume` picker 的上游可见性策略。

## What Changes

- Claude pending thread MUST NOT use `engine_send_message` start response `sessionId` as a native resume id unless it is explicitly confirmed as native session truth.
- Claude continuation MUST derive `nativeResumeSessionId` only from:
  - finalized `claude:<session_id>` thread id;
  - or native `thread/started`/session confirmation event that has been safely paired to the pending turn.
- If a user attempts a follow-up on `claude-pending-*` before native session truth is known, the system MUST avoid sending `--resume <provisional-id>`.
- The UI SHOULD surface a recoverable waiting/retry state instead of silently creating an invalid resume request.
- Existing fork, delete, archive, Copy ID, and Claude TUI resume affordances MUST continue to operate only on finalized native ids.
- Focused tests MUST cover the race path and compatibility with fork/session-management behavior.

## 技术方案对比

### Option A: 继续复用启动响应 `sessionId`

- 优点：改动最小，当前测试已覆盖这种行为。
- 缺点：启动响应 id 可能是本地 provisional id，不一定存在于 Claude native history；用户第二轮会直接触发 `No conversation found`。
- 结论：拒绝。它把“用于渲染启动状态的 id”和“可 resume 的 provider-native id”混为一谈。

### Option B: 等待 native confirmation 后才允许 Claude pending continuation

- 优点：语义正确；不会把 provisional id 传给 `--resume`；与 finalized thread、TUI resume、delete/archive 的 native id 边界一致。
- 缺点：极短窗口内用户快速发送第二条消息时，需要进入 waiting/retry/queued 状态，而不是立即发送。
- 结论：采用。该方案保护 session identity contract，是最小且正确的修复。

### Option C: backend 阻塞 `engine_send_message`，直到拿到真实 Claude session id 再返回

- 优点：前端拿到的响应 id 就是 native id，概念简单。
- 缺点：破坏当前“立即返回 turn id、后续 stream event 推进 UI”的架构；可能增加首 token latency；异常路径复杂。
- 结论：拒绝作为本次方案。可以作为未来架构评估，但不适合当前 hotfix。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-thread-session-continuity`: 补充 Claude pending continuation 必须等待 native session truth 的要求。
- `claude-fork-session-support`: 明确 pending continuation guard 不得破坏 parent/child fork contract。
- `claude-tui-resume-affordance`: 明确 TUI resume command 只能使用 finalized native session id，不能使用 provisional/pending id。

## Impact

- Frontend:
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - `src/features/app/hooks/useAppServerEvents.ts`
  - 相关 Vitest：`useThreadMessaging.test.tsx`、`useThreadTurnEvents.test.tsx`、`useAppServerEvents.test.tsx`
- Backend:
  - 不要求改变 Claude CLI command builder；如需要增强 observability，可补充日志标记 provisional/native id 来源。
- Product behavior:
  - 用户在 pending session 尚未 finalized 时快速发第二条 Claude 消息，将不再发出错误 `--resume`。
  - finalized Claude session 的父子分支、删除、归档、Copy ID、TUI resume command 继续按 native session id 工作。
- Dependencies:
  - No new dependency.

## 验收标准

- 在 `claude-pending-*` 首轮返回 provisional `sessionId` 但尚未收到 native `thread/started` 时，第二轮发送 MUST NOT 调用 `engineSendMessage` with `continueSession=true` and that provisional id。
- 收到 native `thread/started` 后，pending thread MUST 收敛为 `claude:<nativeSessionId>`，后续发送 MUST 使用 `<nativeSessionId>` resume。
- Claude fork first send MUST continue passing `forkSessionId=<parentSessionId>` and MUST NOT be blocked by pending continuation guard。
- Delete/archive/Copy ID/TUI resume action MUST remain unavailable for `claude-pending-*` and available for finalized `claude:<sessionId>`。
- Focused Vitest and `openspec validate fix-claude-native-session-continuation-race --type change --strict --no-interactive` pass.
