## Why

Claude Code history can contain very large JSONL lines, especially screenshot or image payloads stored as base64 blocks. Current session listing and history loading paths can parse or return these payloads too eagerly, causing sidebar session disappearance, `partial-thread-list` degradation, and high WebKit memory pressure when large histories are opened.

This needs to be fixed now because the reported failures are data-dependent and user-visible: moving a few large JSONL files out of `~/.claude/projects` restores the sidebar, which means the app is treating optional media payloads as a blocking dependency for core session navigation.

## 目标与边界

- Protect Claude history indexing from large inline image payloads while preserving session discovery, attribution, sorting, and title preview.
- Preserve user access to omitted images through a deferred, explicit "click to load" surface in the conversation curtain.
- Bound memory and timeout behavior for both sidebar listing and historical session restoration.
- Keep the fix scoped to Claude Code local JSONL history and the existing conversation/sidebar surfaces.

## What Changes

- Change Claude session summary scanning so it does not fully materialize large base64 JSONL content when the sidebar only needs metadata.
- Add large-payload safeguards for Claude history restore: large base64 image data MUST NOT be returned to the renderer by default.
- Introduce deferred Claude image placeholders that retain enough locator metadata for the user to manually load a specific omitted image from the curtain.
- Add a backend command or equivalent IPC path for loading one deferred Claude image by session/message/block locator.
- Improve partial/degraded diagnostics so Claude history timeout/error states do not silently collapse the whole workspace thread list.
- Add regression coverage with large JSONL/base64 fixtures for session listing, history restore, deferred image placeholders, and manual image load.

## 非目标

- Do not build the full Low Memory Mode product surface in this change.
- Do not virtualize the entire sidebar or rewrite workspace session folders.
- Do not redesign the runtime log database, diagnostics dashboard, or WebKit memory inspector.
- Do not remove support for Claude image history; large inline images must remain recoverable on demand.
- Do not alter Codex, Gemini, OpenCode history contracts unless shared types need a compatibility extension.

## 技术方案对比

### Option A: Minimal skip

Skip base64 image blocks during summary scan and history load.

- Pros: smallest patch and fastest mitigation for sidebar timeouts.
- Cons: loses image access in restored history; violates user expectation that previous screenshot context is still viewable.
- Decision: rejected because it fixes memory by deleting capability.

### Option B: Professional MVP with deferred images

Use lightweight summary scanning for sidebar metadata, return deferred image placeholders during history restore, and load a single image only after explicit user action.

- Pros: fixes the main resource bug while preserving historical image access; limits new surface area to one payload locator and one focused load path.
- Cons: requires a small cross-layer contract between Rust history loader, TypeScript loader, and message rendering.
- Decision: selected. This gives the best risk/reward balance.

### Option C: Full resource-management program

Build Low Memory Mode, memory diagnostics, sidebar virtualization, log retention controls, cache clearing, and deferred media loading together.

- Pros: addresses every symptom from the memory issue report.
- Cons: too broad for one bugfix; high regression risk across unrelated UI/runtime surfaces.
- Decision: defer. This change should leave diagnostics hooks that make the larger program easier later.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-history-transcript-visibility`: Claude history restore must preserve transcript readability while deferring large image payloads instead of eagerly returning base64 data.
- `claude-session-sidebar-state-parity`: Claude sidebar entries must remain discoverable and reconcilable even when some history files contain large media payloads.
- `session-history-project-attribution`: Claude project attribution must degrade per transcript/file and must not require parsing large base64 content to determine workspace membership.
- `conversation-render-surface-stability`: The conversation curtain must render deferred media placeholders safely and allow explicit single-image hydration without blanking or memory spikes.

## Impact

- Backend:
  - `src-tauri/src/engine/claude_history.rs`
  - `src-tauri/src/engine/session_history_commands.rs`
  - `src-tauri/src/command_registry.rs`
- Frontend bridge and types:
  - `src/services/tauri.ts`
  - `src/types.ts`
- Frontend history/rendering:
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - `src/features/messages/**`
  - targeted sidebar/thread-list diagnostics in `src/features/threads/hooks/**`
- Tests:
  - Rust Claude history tests with large base64 JSONL fixtures.
  - Focused Vitest coverage for deferred image placeholder parsing/rendering and manual load behavior.
- Dependencies:
  - No new dependency is expected. Existing Rust/TypeScript JSON handling should be sufficient.

## 验收标准

- A Claude JSONL file containing multi-megabyte base64 image lines must not make `list_claude_sessions` time out or remove unrelated Claude sessions from the sidebar.
- Sidebar summary scan must not return base64 image payloads to the frontend.
- Restoring a Claude history session with large image blocks must show a stable placeholder in the curtain, not a blank conversation and not an eager data URI.
- Clicking a deferred image placeholder must load only that image and replace or expand the placeholder without reloading the whole session payload.
- Invalid or missing deferred image locators must produce an explicit recoverable error state, not clear the conversation.
- Focused backend and frontend tests must cover large payload listing, restore placeholder behavior, and manual image hydration.
