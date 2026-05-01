## Context

`AskUserQuestionDialog` submits empty answers on cancel and auto-cancel timeout. `useThreadUserInput` sends those answers through `respondToUserInputRequest`, optimistically marks the thread as processing, then removes the request after a successful backend response.

For Claude Code timeout, backend and frontend timers can race. The backend may clear the pending request before the frontend auto-cancel or user cancel reaches `respond_to_server_request`. In that stale case the response is no longer deliverable, but keeping the request visible is worse: it leaves a dialog that cannot be closed or submitted.

## Decision

Add a narrow stale-settlement classifier inside `useThreadUserInput`:

- `unknown request_id for AskUserQuestion` means Claude already removed that request.
- `workspace not connected` with an empty response means the cancel/timeout response fell through after the Claude pending request was already cleared and no Codex workspace session can consume it.

When the classifier matches, the hook clears the optimistic processing marker and removes the pending request without inserting a submitted-answer history item.

## Alternatives

| 方案 | 结论 | 原因 |
|---|---|---|
| 让 dialog 本地隐藏 request | 不采用 | 会绕过 reducer queue，切换视图或重挂载后仍可能重现 stale request |
| 后端新增 timeout completion event | 暂不采用 | 需要扩展 Claude event contract；当前 PR 可以用前端 stale settlement 解除用户阻塞 |
| 所有 submit failure 都移除 request | 不采用 | 会吞掉真实可重试错误，破坏现有失败可见性 |

## Validation

- 新增 focused Vitest：backend stale timeout error + empty cancel response 会清理 request。
- 运行 `useThreadUserInput` 全量测试，确认普通失败仍保留 request。
- 运行 targeted ESLint、typecheck、diff check。
