## 1. Backend Summary Scan Hardening

- [x] 1.1 [P0] Audit `src-tauri/src/engine/claude_history.rs` listing flow and identify all places where summary scan materializes full `message.content`; output is a short code note in the implementation PR or commit message.
- [x] 1.2 [P0] Implement bounded Claude summary extraction for `list_claude_sessions`, preserving session id, timestamps, first text preview, message count, file size, cwd, attribution reason, parent session id, and subagent metadata while avoiding large base64 materialization.
- [x] 1.3 [P0] Add per-file or per-line degraded handling so a malformed or oversized Claude transcript cannot clear unrelated workspace sessions; output must include a Claude-specific diagnostic/partial source.
- [x] 1.4 [P0] Add Rust tests with large base64 JSONL fixtures proving sidebar summaries exclude base64 payloads and valid sessions remain listed.

## 2. Deferred Claude Image Backend Contract

- [x] 2.1 [P0] Define an additive Rust payload model for deferred Claude history images, including session id, message or line locator, content block index, media type, and estimated byte size.
- [x] 2.2 [P0] Update Claude history restore so large inline base64 image blocks return deferred image descriptors while small image behavior remains backward compatible.
- [x] 2.3 [P0] Add a Tauri command or equivalent IPC route that hydrates exactly one deferred Claude image from a validated locator and returns a bounded image payload or recoverable error.
- [x] 2.4 [P1] Cover stale locator, unsupported media type, and missing file cases with Rust tests.

## 3. Frontend Bridge And Curtain Rendering

- [x] 3.1 [P0] Extend frontend TypeScript types and `src/services/tauri.ts` bridge for deferred Claude image descriptors and single-image hydration.
- [x] 3.2 [P0] Update `claudeHistoryLoader` so restored history maps deferred image descriptors into conversation items without storing base64 in default frontend state.
- [x] 3.3 [P0] Render deferred image placeholders in the conversation curtain with explicit click-to-load behavior and stable loading/error states.
- [x] 3.4 [P1] Ensure deferred image loading updates only the targeted placeholder and never blanks the conversation or resets thread history.

## 4. Sidebar Diagnostics And Regression Coverage

- [x] 4.1 [P1] Update thread-list degraded diagnostics so Claude history timeout/error/large-payload states are distinguishable from Codex runtime partial list states.
- [x] 4.2 [P1] Add focused Vitest coverage for deferred placeholder parsing/rendering and manual hydration success/failure.
- [x] 4.3 [P1] Add focused sidebar/thread-list tests proving Claude listing degradation does not remove unrelated workspace summaries.
- [x] 4.4 [P1] Document threshold constants and fallback behavior near the implementation site; no user-facing Low Memory Mode settings are required in this change.

## 5. Validation

- [x] 5.1 [P0] Run `openspec validate harden-claude-history-large-payloads --type change --strict --no-interactive`.
- [x] 5.2 [P0] Run focused Rust tests for Claude history scanning/loading with `cargo test --manifest-path src-tauri/Cargo.toml claude_history`.
- [x] 5.3 [P0] Run focused frontend tests for Claude history loader, message rendering, and sidebar degradation.
- [x] 5.4 [P1] Run broader project gates required by touched files, at minimum `npm run typecheck` and relevant Vitest suites.
