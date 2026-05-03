## 1. Spec

- [x] 1.1 Add stage-3 transition visibility proposal/design/tasks and spec deltas for ledger diff + compaction explainability.

## 2. Comparison Model

- [x] 2.1 Add frontend comparison helpers that diff current projection against a previous baseline and compute usage delta plus added/removed/retained/changed summaries.
- [x] 2.2 Capture `last send` and `pre-compaction` baselines inside Composer without changing existing send behavior.

## 3. Surface

- [x] 3.1 Render a comparison summary section in Context Ledger and keep the panel visible when a recent transition summary exists.
- [x] 3.2 Show compaction-facing comparison copy that explains the current state relative to the pre-compaction baseline.
- [x] 3.3 Keep cross-turn retained blocks distinguishable in the current preparation state instead of collapsing them back to plain selected state.

## 4. Verification

- [x] 4.1 Add focused tests for comparison helpers, Composer transition retention, retained-state visibility, and ledger comparison rendering.
- [x] 4.2 Run `openspec validate --all --strict --no-interactive`, `npm run lint`, `npm run typecheck`, `npm run check:large-files`, and focused ledger/composer Vitest suites.
  - `openspec validate --all --strict --no-interactive`: passed.
  - `npm run lint`: passed.
  - `npm run typecheck`: passed.
  - `npm run check:large-files`: passed.
  - Focused `vitest` for ledger/composer transition paths: passed.
