## 1. Spec

- [x] 1.1 Add refinement proposal/design/tasks and spec deltas for session-bound comparison boundaries and compact drawer surface.

## 2. Session Boundary

- [x] 2.1 Reset retained ledger state and comparison baselines when composer thread/workspace identity changes.
- [x] 2.2 Keep last-send and pre-compaction comparison scoped to the active session only.

## 3. Surface

- [x] 3.1 Refine the collapsed ledger header into a single-line compact summary row.
- [x] 3.2 Add a hide-drawer control and recoverable hidden peek surface for Context Ledger.

## 4. Verification

- [x] 4.1 Add focused tests for session-boundary reset and hidden drawer interactions.
- [x] 4.2 Run `openspec validate --all --strict --no-interactive`, `npm run lint`, `npm run typecheck`, `npm run check:large-files`, and focused ledger/composer Vitest suites.
  - `npx vitest run src/features/context-ledger/components/ContextLedgerPanel.test.tsx src/features/composer/components/Composer.context-ledger-transition.test.tsx`: passed.
  - `npm run lint`: passed.
  - `npm run typecheck`: passed.
  - `npm run check:large-files`: passed.
  - `openspec validate --all --strict --no-interactive`: passed.
