## Context

Current Claude session identity has three layers:

- `pendingThreadId`: frontend-created temporary thread, e.g. `claude-pending-*`.
- `candidateSessionId`: backend-generated id returned by `engine_send_message` and passed to Claude with `--session-id` for new conversations.
- `nativeSessionId`: provider-native id confirmed by Claude stream event and represented as `claude:<sessionId>`.

The archived continuation-race fix correctly stopped using `candidateSessionId` as immediate resume truth. Issue #529 shows the missing recovery path: when the native event is missed, late, or not paired, the transcript can still exist on disk with complete user/tool/assistant rows. The GUI needs a read-only reconciliation path that validates candidate transcript existence before converging pending identity.

## Design Goals

- Preserve native event confirmation as the primary authority.
- Treat response `sessionId` as a candidate only.
- Promote the candidate to canonical identity only after `loadClaudeSession(candidate)` yields displayable assistant/tool/reasoning evidence.
- Keep reconciliation idempotent and local to the pending thread.
- Avoid rendering raw Claude JSONL directly in frontend; all validation uses existing Rust normalization plus `parseClaudeHistoryMessages`.

## Data Flow

```text
First send on claude-pending-*
  -> engine_send_message returns candidate sessionId
  -> frontend stores pendingThreadId -> candidateSessionId
  -> existing path waits for native thread/started

Native event arrives
  -> useThreadTurnEvents renames pending to claude:<nativeSessionId>
  -> candidate marker is irrelevant

Native event is missed
  -> user sends follow-up while still on claude-pending-*
  -> messaging hook loads candidate transcript
  -> parser yields displayable assistant/tool/reasoning evidence
  -> hook dispatches pending rebind to claude:<candidateSessionId>
  -> follow-up is sent to finalized claude:<candidateSessionId>
```

## Decisions

### Decision 1: Candidate id is stored but never treated as resume truth without validation

`engine_send_message` response `sessionId` MAY be stored as a pending candidate. It MUST NOT set `continueSession=true` by itself. The only promotion paths are native event rebind or transcript validation.

### Decision 2: Transcript validation uses the existing history loader contract

Frontend reconciliation calls `loadClaudeSession(workspacePath, candidateSessionId)`, then passes `record.messages ?? result` to `parseClaudeHistoryMessages`. A candidate is valid only when parsed items include displayable assistant, tool, or reasoning evidence; user-only transcripts are not enough because the first turn may still be running.

This avoids a raw JSONL frontend parser bypass. The Rust command remains responsible for finding and normalizing Claude JSONL.

### Decision 3: Reconciliation runs before pending-block return

When a user sends on `claude-pending-*`, the hook first attempts candidate reconciliation. If it succeeds, the hook re-enters the send path with `claude:<candidateSessionId>` so `continueSession=true` uses a verified finalized id. If it fails, existing waiting/error behavior remains.

### Decision 4: Native event rebind remains preferred and idempotent

If native `thread/started` already renamed the thread, the candidate map is ignored/cleared. If fallback renamed first and a later native event references the same finalized id, existing no-op/skip guards should keep state stable.

## Edge Cases

| 场景 | 行为 |
|---|---|
| candidate id missing | keep current pending wait behavior |
| workspace path missing | skip fallback and keep current wait behavior |
| `loadClaudeSession` throws not found | keep current wait behavior |
| parsed items empty or user-only | keep current wait behavior |
| active thread already finalized | send uses finalized id normally |
| multiple pending threads | candidate map is keyed by pending thread id; no workspace-wide guessing |
| synthetic resume rows present | parser hides them; real assistant/tool/reasoning rows still validate candidate |

## Validation Strategy

- `useThreadMessaging` tests:
  - response `sessionId` is not used for direct pending resume;
  - candidate transcript validation dispatches rebind;
  - follow-up after rebind sends with finalized `sessionId`.
- `claudeHistoryLoader` tests:
  - issue-shaped JSONL-normalized rows hide synthetic continuation rows and keep real rows.
- Rust `claude_history` tests:
  - issue-shaped transcript loads into non-empty normalized messages from disk.
- OpenSpec:
  - `openspec validate fix-claude-pending-transcript-reconciliation --strict --no-interactive`.

## Rollback

Rollback is code-only:

- Remove the candidate map and reconciliation call.
- Keep the archived safety behavior that blocks pending follow-up until native confirmation.
- No transcript migration or persistent state cleanup is required.
