## 1. Backend Classification

- [x] 1.1 [P0][depends: specs/design][I: Claude JSONL entries in `src-tauri/src/engine/claude_history.rs`][O: reusable local-control classifier that returns hidden/displayable/normal classification][V: Rust unit tests for resume failure, model switch, interruption marker, synthetic no-response, and normal keyword text]
- [x] 1.2 [P0][depends: 1.1][I: session summary scanner][O: internal-only rows excluded from `message_count` and first-message derivation while real mixed transcripts remain visible][V: Rust test for local-control-only transcript not becoming normal chat and mixed transcript retaining real first message]
- [x] 1.3 [P0][depends: 1.1][I: Claude history load path][O: raw `<command-name>` / `<local-command-stdout>` wrappers no longer returned as ordinary user/assistant messages; displayable local events returned as non-dialogue event/tool/status payload][V: Rust load test asserting sanitized output]
- [x] 1.4 [P0][depends: 1.1/1.2/1.3][I: backend classifier test fixtures][O: platform-neutral classification that does not branch on OS path style or line ending][V: Rust tests include macOS cwd, Windows cwd, LF and CRLF JSONL rows with equivalent visible output]

## 2. Frontend Fallback And Presentation

- [x] 2.1 [P0][depends: 1.x][I: backend load result shape and `ConversationItem` types][O: selected representation for compact Claude control event rows using existing item type or minimal new item kind][V: TypeScript compile and renderer smoke/unit coverage if a new kind is introduced]
- [x] 2.2 [P0][depends: 2.1][I: `src/features/threads/loaders/claudeHistoryLoader.ts` legacy/cached payloads][O: frontend fallback classifier matching backend semantics for hidden internal records and displayable local events][V: Vitest cases for resume failure, model switch, synthetic no-response, internal metadata, and normal keyword text]
- [x] 2.3 [P1][depends: 2.1/2.2][I: message rendering surface][O: formatted event/status tag presentation that avoids raw XML-like wrappers and preserves readable detail][V: focused render or loader test proving event row appears without raw wrapper text]
- [x] 2.4 [P0][depends: 2.2][I: frontend fallback fixture payloads][O: no mac-only `/Users` or Windows-only `\` assumptions in parser tests or implementation][V: Vitest cases pass with both `/Users/fay/code/vinci` and `C:\Users\fay\code\vinci` style cwd payloads]

## 3. Regression Samples And Gates

- [x] 3.1 [P0][depends: 1.x/2.x][I: two imported user JSONL shapes from investigation][O: distilled fixtures or equivalent test cases covering `aba0a56b...` and `a4ee10e0...` control-event patterns][V: Rust/Vitest tests cover both short contaminated transcript and larger mixed transcript]
- [x] 3.2 [P0][depends: 3.1][I: backend and frontend focused suites][O: validation evidence for history classification][V: `cargo test --manifest-path src-tauri/Cargo.toml engine::claude_history` and `pnpm vitest run src/features/threads/loaders/claudeHistoryLoader.test.ts` pass]
- [x] 3.3 [P0][depends: 3.2][I: CI-compatible validation gates][O: implementation remains covered by existing CI or explicit gate updates][V: `npm run typecheck`, `npm run check:runtime-contracts`, and confirmation that Rust/Vitest focused cases are included by CI `cargo test` / `npm run test` / Windows batched tests]
- [x] 3.4 [P1][depends: 3.2/3.3][I: OpenSpec change artifacts][O: strict OpenSpec validation ready for implementation handoff][V: `openspec validate format-claude-history-control-events --strict --no-interactive` passes]
- [x] 3.5 [P1][depends: 3.1][I: `v0.4.10..HEAD` history restore and curtain changes][O: regression-window note captured without version-specific branching][V: implementation notes explain why the fix classifies current JSONL input instead of reverting to `0.4.10` behavior]

## 4. Handoff Notes

- [x] 4.1 [P1][depends: 3.x][I: implemented behavior and validation output][O: implementation notes explaining mac sample compatibility, Windows-oriented risk reduction, CI coverage, and any residual render-layer risks][V: final delivery includes changed files, tests run, and remaining risk statement]
- [x] 4.2 [P1][depends: 3.5][I: user report that `0.4.10` before may not show the issue][O: concise release-window explanation for product/support handoff][V: final delivery states whether evidence points to model output, control-plane input pollution, or downstream curtain amplification]
