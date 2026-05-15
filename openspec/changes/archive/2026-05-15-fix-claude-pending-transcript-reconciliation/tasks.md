## 1. Contract

- [x] 1.1 [P0][depends:none][I: issue #529 transcript evidence and archived continuation-race spec][O: OpenSpec proposal/design/spec delta][V: `openspec validate fix-claude-pending-transcript-reconciliation --strict --no-interactive`] Define transcript-validated pending reconciliation contract.

## 2. Frontend Reconciliation

- [x] 2.1 [P0][depends:1.1][I: `useThreadMessaging.ts` pending send flow][O: pending thread candidate session map][V: messaging test proves candidate is not used as direct resume truth] Store Claude response session id as candidate only.
- [x] 2.2 [P0][depends:2.1][I: `loadClaudeSession` and `parseClaudeHistoryMessages`][O: read-only candidate transcript validation helper][V: messaging test validates assistant/tool/reasoning evidence before rebind] Implement candidate transcript validation.
- [x] 2.3 [P0][depends:2.2][I: pending follow-up guard][O: fallback rebind before pending block][V: messaging test shows second send resumes finalized thread after fallback] Rebind pending to finalized id when candidate validates.
- [x] 2.4 [P1][depends:2.3][I: existing native `thread/started` rebind][O: idempotent native/fallback behavior][V: turn-event tests still pass] Keep native confirmation as preferred path.

## 3. History Regression Coverage

- [x] 3.1 [P0][depends:1.1][I: issue-shaped Claude transcript rows][O: frontend parser regression][V: Vitest keeps real rows and hides synthetic rows] Cover synthetic continuation filtering with real rows.
- [x] 3.2 [P0][depends:1.1][I: Rust Claude history loader][O: disk-backed issue-shaped fixture test][V: cargo focused test returns non-empty normalized messages] Cover Rust normalization of issue-shaped JSONL.

## 4. Validation

- [x] 4.1 [P0][depends:2.1,2.2,2.3,3.1][I: focused Vitest suites][O: passing frontend tests][V: `pnpm vitest run ...`] Run focused frontend validation.
- [x] 4.2 [P0][depends:3.2][I: Rust focused test][O: passing backend test][V: `cargo test --manifest-path src-tauri/Cargo.toml claude_history`] Run focused Rust validation.
- [x] 4.3 [P0][depends:1.1][I: OpenSpec artifacts][O: strict-valid change][V: `openspec validate fix-claude-pending-transcript-reconciliation --strict --no-interactive`] Validate OpenSpec change.
