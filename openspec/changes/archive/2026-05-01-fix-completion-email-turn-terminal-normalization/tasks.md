## 1. Runtime Event Contract

- [x] 1.1 Audit all `turn/completed` conversion and forwarding call sites for Codex, Claude Code, Gemini, and OpenCode. [P0][input: `EngineEvent::TurnCompleted`, `engine_event_to_app_server_event` call graph][output: complete affected call-site list][verify: `rg` confirms every app-server conversion path is classified]
- [x] 1.2 Normalize completed terminal payloads so known foreground turn context is emitted as `params.turnId`. [P0][depends: 1.1][input: Rust engine event conversion paths][output: `turn/completed` app-server events include stable `turnId`][verify: Rust unit tests assert completed payload turn id]
- [x] 1.3 Update engine-specific forwarders/tests for Claude Code, Gemini, OpenCode, and Codex where needed. [P0][depends: 1.2][input: engine forwarding tests][output: non-Codex paths preserve accepted turn identity through completion][verify: targeted `cargo test` passes]

## 2. Frontend Completion Email Settlement

- [x] 2.1 Confirm frontend event parsing preserves normalized completed `turnId` and does not regress existing completion handling. [P0][depends: 1.2][input: `useAppServerEvents.ts`][output: parser contract covered for top-level `params.turnId`][verify: frontend event tests pass]
- [x] 2.2 Add a recoverable skipped/missed diagnostic when a pending completion email intent observes a completed terminal event without usable `turnId`. [P1][depends: 2.1][input: `useThreads.ts` completion email settlement][output: missing identity is observable without sending false email][verify: targeted frontend test or stable debug assertion]
- [x] 2.3 Add regression coverage that an armed completion email sends for a normalized non-Codex completion. [P0][depends: 2.1][input: completion email hook/event tests][output: `sendConversationCompletionEmail` called once for matching turn][verify: targeted Vitest passes]

## 3. Validation And Spec Hygiene

- [x] 3.1 Run OpenSpec validation for this change. [P0][depends: 1.2, 2.1][input: OpenSpec artifacts][output: valid change artifacts][verify: `openspec validate fix-completion-email-turn-terminal-normalization --strict` passes or equivalent project command]
- [x] 3.2 Run targeted Rust and frontend tests, then update this task list with completed checkboxes. [P0][depends: 1.3, 2.3, 3.1][input: changed files][output: verified implementation][verify: command outputs recorded in final summary]
