## 1. State Contract And Backend Baseline

- [x] 1.1 [P0][depends:none][I: `src-tauri/src/vendors/commands.rs`, Claude provider settings][O: confirmed canonical `alwaysThinkingEnabled` read/write behavior][V: Rust unit test or existing command test review] Verify `vendor_get/set_claude_always_thinking_enabled` and provider switching preserve `alwaysThinkingEnabled` as the canonical Claude thinking state.
- [x] 1.2 [P0][depends:1.1][I: `src-tauri/src/engine/claude_history.rs`, Claude realtime event conversion][O: documented decision that backend preserves reasoning transcript data][V: code review against design] Confirm backend history/realtime parsing keeps `reasoning` data and does not implement presentation hiding by dropping transcript.
- [x] 1.3 [P0][depends:1.1][I: `engineSendMessage`, Tauri engine commands, Claude CLI process spawn][O: closed Claude thinking toggle sends request-level disable intent to Claude runtime][V: focused frontend send test and Rust command/env test] Carry `disableThinking` through frontend, remote bridge, daemon, and local Claude send path, then set `CLAUDE_CODE_DISABLE_THINKING=1` for Claude CLI only.

## 2. Frontend Visibility State Propagation

- [x] 2.1 [P0][depends:1.1][I: `ChatInputBoxAdapter.tsx` resolved `alwaysThinkingEnabled`][O: conversation/canvas-level Claude thinking visibility state available to Messages][V: focused Vitest or prop-level component test] Lift or propagate the resolved Claude thinking state from composer/controller layer to the Messages render surface.
- [x] 2.2 [P0][depends:2.1][I: `Messages.tsx`, `messagesRenderUtils.ts`][O: `hideClaudeReasoning` derived from canonical Claude thinking visibility before legacy localStorage][V: Messages test covering explicit true/false state] Update Messages to prefer explicit Claude thinking visibility and use legacy `ccgui.claude.hideReasoningModule` only as fallback/debug compatibility.
- [x] 2.3 [P1][depends:2.2][I: existing i18n and message empty-state UX][O: non-leaking hidden-reasoning placeholder decision implemented if needed][V: render test for reasoning-only hidden Claude history] Ensure a reasoning-only Claude history does not leak body text and does not look like corrupted history.

## 3. Realtime And History Rendering Behavior

- [x] 3.1 [P0][depends:2.2][I: Claude realtime reasoning items in reducer state][O: hidden Claude realtime reasoning rows and docked module when toggle is off][V: `Messages.live-behavior.test.tsx` focused case] Prove realtime `reasoning` items remain in state but are not rendered when Claude thinking visibility is disabled.
- [x] 3.2 [P0][depends:2.2][I: Claude history items from `parseClaudeHistoryMessages`][O: hidden Claude history reasoning text when toggle is off][V: `Messages.history-loading` or `Messages.test.tsx` focused case] Prove restored Claude history reasoning is hidden by presentation gate without deleting parsed items.
- [x] 3.3 [P0][depends:3.1,3.2][I: non-Claude reasoning conversations][O: Codex/Gemini/OpenCode reasoning unaffected][V: Messages render tests for non-Claude active engine] Prove Claude thinking visibility does not change non-Claude reasoning presentation.
- [x] 3.4 [P1][depends:3.1,3.2][I: toggle updates while conversation remains mounted][O: reasoning presentation updates after toggle changes][V: rerender test with same items and changed visibility prop] Prove retained reasoning can become visible again after re-enabling Claude thinking.

## 4. Composer Toggle UX

- [x] 4.1 [P0][depends:2.1][I: `ConfigSelect.tsx`, `ChatInputBoxAdapter.tsx`][O: toggle writes canonical state and immediately updates render visibility][V: `ChatInputBoxAdapter.test.tsx` focused case] Ensure toggling Claude thinking updates settings/provider and updates the state passed to Messages without requiring app restart.
- [x] 4.2 [P1][depends:4.1][I: failure paths for provider/settings write][O: rollback or safe fallback behavior documented in UI state][V: existing adapter error-path test or new focused test] Ensure failed writes do not leave composer toggle and message visibility permanently inconsistent.

## 5. Validation

- [x] 5.1 [P0][depends:1-4][I: OpenSpec artifacts][O: valid OpenSpec change][V: `openspec validate align-claude-thinking-visibility-control --strict --no-interactive`] Validate this change after implementation task updates.
- [x] 5.2 [P0][depends:2-4][I: frontend TypeScript changes][O: type contracts pass][V: `npm run typecheck`] Run TypeScript typecheck.
- [x] 5.3 [P0][depends:2-4][I: frontend render and composer tests][O: focused Vitest suites pass][V: `npm run test -- Messages ChatInputBoxAdapter claudeHistoryLoader` or equivalent focused command] Run focused tests covering Messages, composer toggle, and Claude history behavior.
- [x] 5.4 [P1][depends:1][I: backend settings/engine command tests][O: Rust backend tests pass if backend touched][V: targeted Rust tests for Claude command env and remote bridge payload] Run backend targeted tests if implementation touches Rust settings, event conversion, or engine send contract.
- [x] 5.5 [P1][depends:2-4][I: desktop manual smoke][O: manual confirmation notes][V: Claude toggle off hides thinking; toggle on shows thinking; final answer remains visible] Manually verify Claude Code conversation with thinking disabled and enabled.
