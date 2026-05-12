## Context

当前 Claude 会话链路存在三类 identity：

- `pendingThreadId`: UI 创建的临时 thread，例如 `claude-pending-*` 或 fork bootstrap id，用于首轮渲染和事件归并。
- `provisionalSessionId`: backend 为新 Claude run 预生成并通过 `--session-id` 传入 CLI 的 id，当前也会出现在 `engine_send_message` 启动响应里。
- `nativeResumeSessionId`: Claude stream event 中确认的 `session_id`，或 finalized `claude:<session_id>` thread identity 中的裸 id。

问题发生在 `pendingThreadId` 还没被 native confirmation rebind 前，前端把启动响应中的 `sessionId` 缓存为下一轮 `--resume` id。若该 id 未被 Claude native history 接受，第二轮会触发 `No conversation found with session ID`。

## Goals / Non-Goals

**Goals:**

- 让 Claude continuation 只使用 provider-native confirmed session id。
- 让 pending follow-up 在 native truth 未确认时进入可解释状态，避免无效 `--resume`。
- 保持 fork parent/child session、delete/archive、Copy ID、TUI resume command 的 finalized-id 语义不变。
- 用 focused tests 固化竞态边界。

**Non-Goals:**

- 不改变 Claude CLI command syntax。
- 不修改 JSONL transcript。
- 不重构所有 engines 的 session abstraction。
- 不把 pending thread 暴露为 session-management target。

## Compatibility Matrix

| 功能 | 风险 | 设计约束 |
|---|---|---|
| 普通 Claude 首轮 | 低 | `continueSession=false` 仍允许启动；首轮渲染继续用 pending thread。 |
| 普通 Claude 第二轮 | 中 | 必须等 native id；不能用 start response id 伪装 native resume id。 |
| Claude fork child | 中 | fork first send 使用 `forkSessionId`，不依赖 pending cached response id；guard 只拦 pending continuation，不拦 fork bootstrap。 |
| 父 session 删除 | 低 | 删除入口只对 finalized `claude:<sessionId>` 生效；pending 不可删除 native transcript。 |
| 子 session 删除 | 低 | child finalized 后仍是 `claude:<childSessionId>`，按现有 delete path 工作。 |
| Copy ID | 低 | finalized thread 仍复制裸 native id；pending 不复制 native id。 |
| Copy Claude resume command / Open in Claude TUI | 低 | 继续只对 finalized native id 可用；pending/provisional id 禁止生成命令。 |
| RequestUserInput / approval resume | 中 | 使用 canonical thread resolution；若 native id 已确认则走 finalized thread，未确认时不得构造 provisional `--resume`。 |
| Gemini/OpenCode/Codex | 低 | 不改变这些 engines 的 session id extraction 和 continuation rules。 |

## Decisions

### Decision 1: Treat engine start response session id as non-authoritative for Claude pending continuation

For Claude pending threads, the frontend must not cache `engine_send_message` response `sessionId` as `nativeResumeSessionId` unless there is explicit metadata proving it came from provider-native confirmation.

Rationale: `engine_send_message` response is optimized for immediate turn start; stream events are the authoritative native session source.

### Decision 2: Native truth sources are finalized thread id and native session-start event

Allowed resume id sources:

- `threadId` starts with `claude:` and is not a virtual/fork bootstrap id.
- `thread/started` event with `sessionId !== "pending"` and safe pairing to pending turn via `turnId`, active pending lineage, or existing canonical alias.

Rejected sources:

- `claude-pending-*`.
- `engine_send_message` response `sessionId` from a pending send.
- fork bootstrap ids before child native session confirmation.

### Decision 3: Pending follow-up should be recoverable, not silently reinterpreted

If a user sends a follow-up while a Claude pending thread has no confirmed native id, the system should:

1. Avoid `continueSession=true`.
2. Prefer a visible waiting/retry state or disabled send with explanatory copy.
3. Optionally queue locally only if queueing semantics are already safe for Claude pending threads.

It must not silently start a separate new Claude conversation unless the user explicitly chooses that.

### Decision 4: Fork and session-management actions remain finalized-id scoped

Fork parent ids, delete ids, archive ids, Copy ID, and TUI resume commands remain based on finalized `claude:<sessionId>` only. The pending continuation guard must not broaden these actions to pending/provisional ids.

Rationale: session-management actions mutate or expose native transcript state; pending/provisional ids are not a safe target.

## Data Flow

```text
First send on claude-pending-*
  -> engine_send_message returns turn started + possible provisional sessionId
  -> frontend renders pending turn
  -> frontend does NOT store response sessionId as native resume id
  -> Claude stream emits thread/started with native sessionId
  -> app-server router calls onThreadSessionIdUpdated
  -> pending thread is renamed/aliased to claude:<nativeSessionId>
  -> later sends use nativeSessionId
```

```text
Fast second send before native confirmation
  -> current thread is still claude-pending-*
  -> nativeResumeSessionId is unavailable
  -> system blocks/waits/queues recoverably
  -> no --resume provisional-id is sent
```

```text
Fork from parent
  -> thread id is fork bootstrap
  -> first send passes forkSessionId=<parentSessionId>
  -> Claude CLI creates child native session
  -> child thread finalizes to claude:<childSessionId>
  -> later sends resume child native id
```

## Validation Strategy

- Unit test `useThreadMessaging`: pending Claude response-derived `sessionId` must not be reused for follow-up resume.
- Unit test `useThreadMessaging`: finalized `claude:<sessionId>` still resumes normally.
- Unit test `useThreadMessaging`: Claude fork first send still sends `forkSessionId` and `continueSession=false`.
- Unit test `useThreadTurnEvents`: native `thread/started` still renames pending to finalized id.
- Unit test menu/session actions if touched: pending thread does not expose delete/TUI resume command; finalized thread still does.
- Run OpenSpec strict validation.

## Rollback

- Restore the previous pending response-session cache behavior if the guard causes unacceptable UX regressions.
- Since no data migration is introduced and transcript files are not mutated, rollback is code-only.
- Finalized native sessions created while the fix was active remain valid Claude sessions.
