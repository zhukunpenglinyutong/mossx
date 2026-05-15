## 1. OpenSpec Contract

- [x] 1.1 [P0][depends:none][I: prior Claude streaming archives + current repeat-turn symptom][O: proposal/design/spec deltas][V: `openspec validate fix-claude-repeat-turn-first-token-latency --strict --no-interactive`] Define first-token latency boundaries separately from backend forwarding and frontend visible stall.

## 2. Backend Startup Timing

- [x] 2.1 [P0][depends:1.1][I: `src-tauri/src/engine/claude.rs`][O: redacted Claude startup timing fields for spawn/stdin/stdout/valid-event/text-delta][V: focused Rust tests] Capture phase timing for Claude `stream-json` turns without recording content.
- [x] 2.2 [P0][depends:2.1][I: `src-tauri/src/engine/claude_forwarder.rs`, `src-tauri/src/engine/commands_tests.rs`][O: first-token timing metadata attached to realtime app events][V: Rust forwarder tests assert redacted timing and emit-before-sync order] Forward timing metadata without delaying realtime deltas.
- [x] 2.3 [P1][depends:2.1][I: malformed/missing timing paths][O: safe defaults for missing startup timing][V: Rust tests cover absent stdout/valid-event/text-delta timing fields] Ensure partial timing is harmless.

## 3. Frontend Diagnostics

- [x] 3.1 [P0][depends:2.2][I: `src/features/threads/utils/streamLatencyDiagnostics.ts`][O: first-token/startup classification distinct from backend-forwarder and visible-output stalls][V: Vitest classification tests] Add Claude first-token diagnostic classification.
- [x] 3.2 [P0][depends:3.1][I: `useAppServerEvents.ts` and diagnostic guards][O: runtime-safe handling of unknown timing payloads][V: Vitest tests for negative, non-finite, and missing timing fields] Guard malformed timing and prevent negative gaps.
- [x] 3.3 [P1][depends:3.1][I: existing debug flag `ccgui.debug.streamLatencyTrace`][O: bounded debug output for first-token phases][V: Vitest tests assert no text payload capture] Keep diagnostics bounded and redacted.

## 4. Validation

- [x] 4.1 [P0][depends:2,3][I: implementation][O: targeted backend/frontend validation][V: `cargo test --manifest-path src-tauri/Cargo.toml claude_forwarder -- --nocapture`; `npx vitest run src/features/threads/utils/streamLatencyDiagnostics.test.ts`] Run focused regression tests.
- [x] 4.2 [P0][depends:4.1][I: implementation][O: standard quality gates][V: `npm run typecheck`; `npm run lint`; `git diff --check`; governance scripts] Run repository gates.
- [x] 4.3 [P1][depends:4.2][I: debug timing trace][O: manual diagnostic instructions][V: documented debug flag and phase interpretation] Document how to interpret first-token timing evidence.
