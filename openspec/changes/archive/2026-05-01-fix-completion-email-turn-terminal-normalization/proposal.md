## Why

Completion email is currently only reliable on the Codex path. Claude Code and Gemini can finish a conversation without emitting the same terminal turn identity, so the frontend sees a completed lifecycle event that cannot match the one-shot email intent bound to the submitted turn.

## 目标与边界

- 目标
  - Normalize completed terminal events so Codex, Claude Code, Gemini, and OpenCode all expose a stable `turnId` to frontend lifecycle consumers.
  - Ensure the composer completion-email toggle sends exactly once for the opted-in target turn after that turn completes.
  - Keep email delivery as a recoverable side effect that never blocks lifecycle settlement.
- 边界
  - This change fixes completion terminal identity propagation and email trigger matching only.
  - SMTP settings, secret storage, recipient policy, and email body formatting remain under existing contracts.

## 非目标

- Do not redesign the email settings UI or backend SMTP sender.
- Do not make completion email automatic without explicit one-shot opt-in.
- Do not weaken stale-turn and duplicate-terminal protections just to force sending.

## What Changes

- Backend app-server completion events MUST include the active turn identity for every supported engine path that can emit `turn/completed`.
- Frontend lifecycle settlement MUST consume the normalized `turnId` and match it against the pending completion-email intent before sending.
- Missing terminal `turnId` MUST be observable as a skipped/missed email trigger, not silently mistaken for a successful completion email path.
- Regression coverage MUST include non-Codex engines, especially Claude Code and Gemini, because they use the generic engine event path where the breakage appears.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `conversation-completion-email-notification`: completion email trigger semantics now require normalized terminal turn identity across Codex, Claude Code, Gemini, and OpenCode.

## Impact

- Backend
  - `src-tauri/src/engine/events.rs`
  - Engine forwarders / event conversion paths for Claude Code, Gemini, OpenCode, and Codex where applicable
  - Rust tests for app-server event payload shape
- Frontend
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - Completion email utilities/tests and lifecycle integration tests
- Runtime contract
  - `turn/completed` payload gains a required normalized `params.turnId` when a known foreground turn exists.
