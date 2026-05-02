> Execution tracking: Trellis task `05-03-context-ledger-phase1`.

## 1. Projection Model

- [ ] 1.1 Add a frontend `ContextLedgerProjection` builder that derives recent-turn usage, compaction freshness, manual memories, note cards, file references, and explicit degraded/shared markers for provider-only attribution gaps from Composer state.
- [ ] 1.2 Reuse the same usage and compaction snapshot across Context Ledger and Codex dual-view without changing existing send behavior.

## 2. Surface

- [ ] 2.1 Add a composer-adjacent `Context Ledger` entrypoint with grouped blocks, total usage summary, and truthful compaction status.
- [ ] 2.2 Add localized source, freshness, participation-state, and degraded-marker copy for the ledger surface.

## 3. Verification

- [ ] 3.1 Add focused tests for projection building and ledger rendering.
- [ ] 3.2 Run `openspec validate --all --strict --no-interactive`, `npm run lint`, `npm run typecheck`, and focused Vitest suites for the touched ledger / composer paths.

## 4. Follow-up

- [ ] 4.1 Add next-send governance actions such as `pin for next send` and `exclude from next send` on top of the stabilized projection model.
- [ ] 4.2 Expand attribution beyond frontend-visible Phase 1 sources to backend-backed engine/system-injected segments.
