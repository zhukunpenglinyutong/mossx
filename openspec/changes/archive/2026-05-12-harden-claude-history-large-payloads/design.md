## Context

Claude Code local history is stored as JSONL under the effective Claude home `projects` directory. The current listing path reads candidate files line-by-line but still parses each non-empty line into `serde_json::Value`; a single screenshot or inline image block can therefore allocate multi-megabyte strings even when the caller only needs session metadata. The restore path is more expensive: it can convert base64 image blocks into renderer-facing data URIs, causing WebKit memory pressure when a historical session contains large screenshots.

The fix must preserve three contracts at once:

- Sidebar session listing remains a metadata operation.
- Restored history remains readable and does not silently lose media context.
- Large image bytes only cross the Tauri IPC boundary after explicit user intent.

## Goals / Non-Goals

**Goals:**

- Make Claude session listing resilient to large JSONL/base64 lines.
- Keep Claude project attribution and sidebar state stable when one transcript is oversized or partially unparseable.
- Restore large-image history as a deferred placeholder with enough locator metadata for explicit single-image hydration.
- Add focused diagnostics and tests so future regressions are visible.

**Non-Goals:**

- Build a general Low Memory Mode UI.
- Virtualize every sidebar list.
- Redesign message storage, runtime log retention, or WebKit diagnostics.
- Remove Claude image history support.
- Change other engines unless shared UI or type contracts require an additive compatibility field.

## Decisions

### Decision 1: Split summary scanning from full history parsing

`list_claude_sessions` will use a summary-oriented scanner that extracts only the fields required for sidebar projection: session id, timestamps, role/message count, first text preview, cwd/attribution evidence, file size, and parent/subagent metadata. It must avoid cloning or serializing `message.content` wholesale.

Alternatives considered:

- Fully parse every JSONL line and rely on a 30s frontend timeout. Rejected because the Rust work continues after frontend timeout and can still pressure memory.
- Skip files above a fixed size. Rejected because large transcripts may contain valid recent sessions and should still appear in the sidebar.

Rationale: summary scan is the hot path and should not depend on optional media payloads.

### Decision 2: Add explicit payload budgets

The scanner and loader will use bounded behavior instead of best-effort unlimited parsing:

- Summary scan MAY skip preview extraction for a line whose byte length exceeds a configured internal threshold, but MUST still try to collect cheap metadata such as file path, file size, and timestamps when available.
- A single failed or oversized transcript MUST degrade that transcript, not clear the whole workspace session list.
- Concurrent scan count SHOULD stay bounded and MAY be reduced if tests show peak memory remains high.

Alternatives considered:

- Make thresholds user-configurable in this change. Rejected as premature; the immediate need is a safe default contract.
- Depend on frontend cancellation. Rejected because Tauri command work is not guaranteed to be cancelled.

Rationale: resource bounds must live close to the file parser, not only at the UI call site.

### Decision 3: Represent large images as deferred media, not omitted media

History restore will return small image payloads as existing images where safe, but large base64 blocks will become deferred image placeholders. A placeholder should carry stable locator metadata such as:

- `sessionId`
- source message id or UUID when present
- line ordinal or content block index as a fallback locator
- media type
- estimated byte size
- status metadata for UI copy

The frontend loader will map this into a conversation item media representation that the curtain can render as a clickable placeholder.

Alternatives considered:

- Drop images entirely. Rejected because it loses user context.
- Always return base64 data URIs. Rejected because it recreates the WebKit memory spike.
- Extract all images into temporary files during restore. Deferred because it adds lifecycle and cleanup complexity beyond the MVP.

Rationale: deferred media keeps the history faithful while making memory use proportional to user intent.

### Decision 4: Hydrate one image per explicit action

A new backend command or equivalent Tauri IPC path will resolve one deferred image locator and return one image payload. It must validate the locator against the session file, media type, and block identity before returning bytes. Invalid, missing, or changed history files return recoverable errors; they must not clear the conversation.

Alternatives considered:

- Reload the entire session and include images after click. Rejected because it sends all large payloads again.
- Store base64 in frontend state hidden behind a collapsed component. Rejected because it still consumes WebKit memory.

Rationale: one-click, one-image hydration is the narrowest capability-preserving fix.

### Decision 5: Keep diagnostics additive

Thread-list degradation should distinguish Claude history scan timeout/error from Codex runtime partial list states. The UI may reuse existing degraded summary styles, but debug payloads should include a Claude-specific source such as `claude-session-timeout`, `claude-session-error`, `claude-history-large-payload`, or equivalent.

Alternatives considered:

- Add a full diagnostics panel now. Rejected because the proposal is scoped to the data path.

Rationale: future Low Memory Mode work needs observability, but this change should not become a product-surface expansion.

## Risks / Trade-offs

- [Risk] JSONL line-level lightweight extraction may miss some unusual Claude timestamp/cwd shapes. → Mitigation: keep fallback parsing for small lines and add fixtures for known shapes.
- [Risk] Deferred image locators may become stale if the JSONL file changes. → Mitigation: return explicit recoverable errors and keep the placeholder visible.
- [Risk] New media shape may disturb existing message rendering. → Mitigation: make the TypeScript contract additive and keep existing `images: string[]` behavior for small/current payloads.
- [Risk] Thresholds can be too low and defer images users expected inline. → Mitigation: use conservative defaults and display size/media metadata so users understand why click-to-load appears.
- [Risk] Manual hydration could still load a very large image into WebKit. → Mitigation: require explicit click, load only one image, and keep follow-up Low Memory Mode/image size confirmation out of this MVP unless validation proves it necessary.

## Migration Plan

1. Introduce backend summary-scan helpers and tests without changing frontend payload shape.
2. Add deferred image metadata to Claude history restore as an additive field while preserving existing small image behavior.
3. Add the single-image hydration command and frontend bridge.
4. Render deferred image placeholders and wire click-to-load.
5. Add degraded diagnostics and focused regression coverage.

Rollback strategy:

- Summary scan hardening should remain safe to keep because it reduces work without changing user-visible content.
- If deferred media UI causes regressions, disable the frontend click surface while keeping backend large-payload omission from eager restore; placeholders can temporarily show a non-clickable recoverable message.

## Open Questions

- What exact threshold should separate inline small images from deferred images? Initial implementation should choose a conservative internal constant and cover it in tests.
- Should hydrated images be cached per session/message in memory after click, or reloaded each time? MVP can cache only in active conversation state and avoid persistent cache.
- Should remote mode support deferred image hydration immediately, or should it return a clear unsupported/degraded response until the remote bridge adds parity?
