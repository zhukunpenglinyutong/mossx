## 1. Codex Launch Identity Gate

- [x] 1.1 [P0, depends: specs/design] Remove Codex-to-Claude binary fallback from Codex app-server launch resolution; output is Codex-specific missing/capability errors, validation via Rust unit tests.
- [x] 1.2 [P0, depends: 1.1] Add or tighten Codex app-server capability gate for default and custom Codex binaries; output is `app-server --help` style probe before session spawn, validation via focused Rust tests.
- [x] 1.3 [P1, depends: 1.2] Preserve Windows `.cmd/.bat` wrapper compatibility only for Codex-capable executables; output is no retry for non-Codex wrapper, validation via wrapper/planning tests.
- [x] 1.4 [P1, depends: 1.2] Update Codex launch/doctor error text to distinguish missing Codex, not app-server capable, and custom bin mismatch; validation via tests or snapshot assertions where available.

## 2. Claude History Contamination Filtering

- [x] 2.1 [P0, depends: specs/design] Add backend high-confidence predicate for Codex / GUI control-plane payloads in Claude history; output is reusable scanner/load filter, validation via Rust tests.
- [x] 2.2 [P0, depends: 2.1] Apply backend filter to Claude session summary scanning so control-plane-only JSONL does not produce visible sessions; validation via focused Rust tests.
- [x] 2.3 [P0, depends: 2.1] Apply backend filter to Claude session loading so mixed transcripts drop contamination but preserve real messages; validation via focused Rust tests.
- [x] 2.4 [P1, depends: 2.1] Add frontend Claude history loader fallback filter with matching sample matrix; validation via focused Vitest tests.

## 3. Boundary Matrix And CI Gate

- [x] 3.1 [P1, depends: 1.x/2.x] Add Win/mac boundary tests for direct binaries, Windows wrapper eligibility, custom bin mismatch, and proxy/capability behavior where helpers allow deterministic coverage.
- [x] 3.2 [P1, depends: 2.x] Add contamination sample tests covering control-plane-only, mixed transcript, and normal message with `app-server` keyword not over-filtered.
- [x] 3.3 [P1, depends: 3.1/3.2] Run focused validation commands: Rust tests for touched backend modules, Vitest for `claudeHistoryLoader`, and `openspec validate --change fix-claude-control-plane-session-contamination --strict`.
- [x] 3.4 [P2, depends: 3.3] Record executed validation evidence and any skipped gate reason in final implementation notes.

## 4. Spec And Task Closure

- [x] 4.1 [P1, depends: 3.3] Re-run OpenSpec status and ensure all tasks match implemented code paths.
- [x] 4.2 [P2, depends: 4.1] Prepare follow-up notes for optional UI doctor improvements without including them in this change.

## Validation Evidence

- `cargo test --manifest-path src-tauri/Cargo.toml backend::app_server_cli` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml engine::claude_history` passed.
- `pnpm vitest run src/features/threads/loaders/claudeHistoryLoader.test.ts` passed.
- `openspec validate fix-claude-control-plane-session-contamination --strict` passed. The proposal's original `--change` spelling is not supported by the local CLI; `openspec validate --help` shows positional change names.

## Follow-up Notes

- Optional UI doctor improvement remains out of scope: settings can later surface immediate feedback when a custom Codex binary points to Claude or lacks `app-server` capability.
