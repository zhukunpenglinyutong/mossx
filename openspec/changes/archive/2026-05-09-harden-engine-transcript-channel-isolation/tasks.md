## 1. Classifier Contract And Fixtures

- [x] 1.1 [P0][depends: proposal/design/specs][I: existing Claude/Codex contamination samples][O: shared contamination fixture matrix covering continuation summary, Codex app-server initialize, developer instructions, Claude local command wrapper, synthetic no-response, and normal lookalike text][V: fixture names and expected channel classifications documented in tests or test helper comments]
- [x] 1.2 [P0][depends: 1.1][I: existing backend history parsers][O: Rust-side transcript channel classifier shape with dialogue/control-plane/synthetic-runtime/diagnostic/quarantine outcomes][V: focused Rust unit tests for every fixture family]
- [x] 1.3 [P0][depends: 1.1][I: existing frontend loader fallback][O: TypeScript-side fallback classifier aligned with backend semantics][V: focused Vitest cases for every fixture family]

## 2. Backend Isolation Enforcement

- [x] 2.1 [P0][depends: 1.2][I: Claude history session scanner][O: session title, first message, and message count derived only after channel classification][V: Rust test where synthetic continuation first row does not become first message]
- [x] 2.2 [P0][depends: 1.2][I: Claude history load path][O: continuation summaries and cross-engine control-plane payloads excluded from normal user/assistant messages][V: Rust load test proves mixed transcript keeps real messages and drops synthetic runtime leakage]
- [x] 2.3 [P1][depends: 2.1/2.2][I: control-only transcripts][O: control-only and continuation-only transcript omitted from normal session list][V: Rust list test returns no visible session for control-only fixture]
- [x] 2.4 [P1][depends: 1.2][I: Codex/shared engine launch and history projection path][O: audit notes or guard code proving app-server initialize payloads cannot become app-owned dialogue history][V: focused Rust test or documented no-op if no app-owned Codex history path exists]

## 3. Frontend Projection Enforcement

- [x] 3.1 [P0][depends: 1.3][I: `claudeHistoryLoader.ts` legacy/cached payload handling][O: synthetic continuation summaries skipped or quarantined before conversation assembly][V: Vitest proves no user/assistant item contains continuation summary text]
- [x] 3.2 [P0][depends: 1.3][I: backend-formatted non-dialogue events][O: frontend preserves non-dialogue identity for control/diagnostic/quarantine items][V: Vitest proves backend event is not downgraded to user/assistant]
- [x] 3.3 [P0][depends: 3.1][I: normal lookalike messages][O: user-authored discussion about app-server, previous conversation, summary, developer, or resume remains visible][V: Vitest proves classifier is not keyword-only]
- [x] 3.4 [P1][depends: 3.1/3.2][I: conversation assembler/render projection][O: no non-dialogue control event contributes to assistant final answer or empty-thread dialogue count][V: existing assembler tests updated or new focused test added]

## 4. Verification And Handoff

- [x] 4.1 [P0][depends: 2.x/3.x][I: backend focused suite][O: backend contamination matrix validated][V: `cargo test --manifest-path src-tauri/Cargo.toml engine::claude_history` passes or blocker recorded]
- [x] 4.2 [P0][depends: 3.x][I: frontend focused suite][O: frontend fallback and projection matrix validated][V: `pnpm vitest run src/features/threads/loaders/claudeHistoryLoader.test.ts` passes or blocker recorded]
- [x] 4.3 [P0][depends: 4.1/4.2][I: repository quality gates][O: type/runtime contract compatibility confirmed][V: `npm run typecheck` and `npm run check:runtime-contracts` pass or blockers recorded]
- [x] 4.4 [P0][depends: specs/tasks][I: OpenSpec artifacts][O: strict OpenSpec validation clean][V: `openspec validate harden-engine-transcript-channel-isolation --strict --no-interactive` passes]
- [x] 4.5 [P1][depends: 4.1-4.4][I: implementation evidence][O: handoff note explaining root cause class, remaining render-layer risks, and CI coverage][V: final delivery includes changed files, tests run, and residual risk statement]
