## Why

Issue #557 points at a Claude GUI failure mode where the same custom Claude configuration can work in an interactive CLI, while the GUI sends `claude -p --output-format stream-json` and then stays in processing with no visible output. Current code already emits terminal errors when Claude exits non-zero or reports a parseable runtime error, but it does not bound the path where the process stays alive without any valid stream-json event.

This is a lifecycle bug, not just a provider bug. A third-party Claude-compatible endpoint that does not satisfy Claude Code print-mode `stream-json` can trigger it, but the GUI must still settle the turn instead of leaving pseudo-processing indefinitely.

## Goals

- Bound the Claude print-mode stream when no valid `stream-json` event arrives.
- Emit a deterministic `turn/error` for silent or malformed Claude streams.
- Terminate the child process when the liveness guard fires.
- Preserve normal Claude long-running turns after at least one valid stream event.
- Keep provider/model-specific compatibility decisions out of this fix.

## Non-Goals

- Do not change Claude CLI command syntax, model selection, provider settings, or `~/.claude/settings.json`.
- Do not add a user-facing timeout preference.
- Do not classify specific providers as broken.
- Do not alter Codex liveness behavior.
- Do not rewrite the conversation event forwarding architecture.

## What Changes

- Claude runtime MUST treat `claude -p --output-format stream-json` as requiring a first valid stream event within a bounded window.
- Non-JSON stdout, malformed SSE payloads, and stderr text MAY be captured as diagnostics, but they MUST NOT keep a turn in ordinary processing forever when no valid stream event has arrived.
- When the guard expires, backend MUST emit `EngineEvent::TurnError` with a stable error code and diagnosable message.
- Backend MUST terminate the associated Claude child process through the existing shared termination primitive or an equivalent managed child stop path.
- Frontend lifecycle MUST settle through existing `turn/error` handling and clear pseudo-processing for the matching turn.

## Capabilities

### Modified Capabilities

- `claude-runtime-termination-hardening`: Add timeout-driven child termination for silent Claude print-mode stream startup.
- `conversation-lifecycle-contract`: Add deterministic terminal settlement for Claude streams that never produce valid events.

## Acceptance Criteria

- A fake Claude process that stays alive and emits no stdout MUST produce `turn/error` within the configured no-event window.
- A fake Claude process that emits malformed stdout and then stays alive MUST produce `turn/error` with diagnostic context.
- A fake Claude process that emits a valid stream event before the window expires MUST continue through existing stream handling.
- `turn/error` MUST be emitted before or with child termination so the frontend can clear processing.
- Error output MUST be truncated/sanitized enough to avoid leaking large payloads or secrets.
- Focused Rust tests for silent and malformed stream paths MUST pass.
- OpenSpec strict validation for this change MUST pass.

## Impact

- Backend:
  - `src-tauri/src/engine/claude.rs`
  - Claude engine focused tests under `src-tauri/src/engine/claude/`
- Frontend:
  - Existing `turn/error` settlement path should be reused; focused frontend tests only if backend event shape requires lifecycle adaptation.
- Specs:
  - `claude-runtime-termination-hardening`
  - `conversation-lifecycle-contract`
