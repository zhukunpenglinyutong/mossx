## 1. Spec

- [x] 1.1 Add source-navigation proposal/design/tasks and spec delta for Context Ledger source jump-back.

## 2. Surface

- [x] 2.1 Add source navigation actions in `ContextLedgerPanel` for manual memory, note card, and file reference blocks.
- [x] 2.2 Route ledger source actions through `Composer` into file open and AppShell panel-open handlers.

## 3. Panel Focus

- [x] 3.1 Add memory panel focus support so a requested memory can be selected from ledger navigation.
- [x] 3.2 Add notes panel focus support so a requested note can be selected from ledger navigation.

## 4. Verification

- [x] 4.1 Add focused tests for panel source actions, composer routing, memory focus, and notes focus.
- [x] 4.2 Run focused validation for ledger/composer/memory/note paths.
  - `openspec validate --all --strict --no-interactive`: passed.
  - `npm run lint`: passed.
  - `npm run check:large-files`: passed.
  - `npm run typecheck`: passed.
  - focused `vitest` for ledger/composer/memory/note source navigation: passed.
