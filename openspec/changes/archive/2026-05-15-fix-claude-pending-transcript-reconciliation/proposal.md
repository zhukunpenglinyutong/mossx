## Why

Claude pending thread continuation currently depends on the native `thread/started` session confirmation event being received and safely paired. Issue #529 shows a stricter failure mode: the native JSONL transcript is already complete and non-empty, but the GUI can remain on `claude-pending-*` or render a blank surface because the pending thread never converges to `claude:<sessionId>`.

This is now P0 because affected users can complete work through Claude while the GUI loses the visible conversation identity, making the app look unusable even though the transcript on disk is valid.

## 目标与边界

### 目标

- Reconcile `claude-pending-*` into `claude:<sessionId>` when native `thread/started` is missed but the candidate transcript exists and contains displayable assistant/tool/reasoning evidence.
- Keep the existing safety rule that `engine_send_message` response `sessionId` is not immediately provider-native resume truth.
- Make the second send recover by validating the candidate transcript before deciding whether to block on native session confirmation.
- Add regression coverage using the issue #529 shape: synthetic resume rows hidden, real user/tool/assistant rows preserved.

### 边界

- The fallback is scoped to Claude pending sessions created by this GUI.
- Transcript validation is read-only and MUST NOT rewrite Claude JSONL files.
- Existing native `thread/started` rebind remains the authoritative fast path.
- Existing fork, delete, archive, Copy ID, and TUI resume affordances remain finalized-session scoped.

## 非目标

- Do not change Claude CLI command syntax or upstream storage format.
- Do not make provisional response ids directly usable for `--resume`.
- Do not introduce a new global session store or rewrite the shared session architecture.
- Do not fix unrelated Windows/WebView2 repaint issues beyond preventing Claude session identity loss.

## What Changes

- Store Claude pending response `sessionId` as a candidate that can be validated later.
- Before blocking a follow-up on `claude-pending-*`, attempt candidate transcript reconciliation:
  - load the candidate with the existing `loadClaudeSession` backend command;
  - parse it through the Claude history loader;
  - if it yields displayable assistant/tool/reasoning evidence, rebind pending to `claude:<candidateSessionId>`.
- Preserve the existing native event rebind path and prefer it when available.
- Add focused tests for direct native rebind, candidate transcript fallback, and issue #529 synthetic control-plane filtering.

## 技术方案对比

### Option A: Continue blocking pending follow-up until `thread/started`

- 优点：保持当前安全边界，避免 provisional id 进入 `--resume`。
- 缺点：如果 event 丢失或无法配对，即使 transcript 已经完整，UI 仍永久 pending/空白。
- 结论：不够。它解释了前一次修复为什么仍未解决 #529。

### Option B: Treat response `sessionId` as resume truth immediately

- 优点：改动小，第二轮可以马上用该 id。
- 缺点：回退到已归档修复明确拒绝的设计；如果 response id 不是 native-confirmed，会再次触发无效 `--resume`。
- 结论：拒绝。

### Option C: Use response `sessionId` only as a transcript-validated candidate

- 优点：不破坏 native truth 边界；当磁盘 transcript 已存在且可解析时可以自愈；与 #529 证据一致。
- 缺点：第二轮发送前可能多一次 history load；需要小心避免重复 rebind 和 stale response。
- 结论：采用。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `claude-thread-session-continuity`: Add transcript-validated fallback reconciliation for pending Claude sessions when native confirmation event is missed or not safely paired.

## Impact

- Frontend:
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - focused Vitest suites for messaging, turn events, and history parsing.
- Backend:
  - `src-tauri/src/engine/claude_history.rs` tests may add an issue-shaped fixture; production behavior should remain read-only.
- Product behavior:
  - Users no longer get stuck on blank/pending Claude sessions when the transcript exists and can be loaded.
  - Follow-up sends still never use an unvalidated candidate id as `--resume`.
- Dependencies:
  - No new dependency.

## 验收标准

- A pending Claude thread with only a response-derived candidate session id MUST NOT resume directly with that candidate.
- If `loadClaudeSession(candidate)` returns displayable assistant/tool/reasoning evidence, the pending thread MUST rebind to `claude:<candidate>`.
- After fallback rebind, a second send MUST resume the finalized `claude:<candidate>` session.
- If candidate history is missing or empty, the UI MUST keep the recoverable waiting/blocking behavior.
- Synthetic `Continue from where you left off.` and `<synthetic>` `No response requested.` rows MUST remain hidden.
- Focused frontend tests and OpenSpec strict validation MUST pass.
