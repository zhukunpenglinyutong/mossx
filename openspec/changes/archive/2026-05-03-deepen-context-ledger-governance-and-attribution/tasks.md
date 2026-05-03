## 1. Spec

- [x] 1.1 Add phase-4 proposal/design/tasks/spec deltas for carry-over explanation, batch governance, and attribution hardening.

## 2. Carry-Over Reason Visualization

- [x] 2.1 Extend the ledger block model with explicit carry-over reason metadata instead of relying on participation state alone.
- [x] 2.2 Render carry-over explanation copy and add a dedicated `clear carried-over` action for inherited blocks.
- [x] 2.3 Add focused tests for carried-over explanation and immediate clear behavior.

## 3. Batch Governance

- [x] 3.1 Add a batch-governance selection model for explicit governable ledger blocks.
- [x] 3.2 Support grouped keep / clear / exclude actions without changing current send behavior.
- [x] 3.3 Add focused tests for batch eligibility and batch actions.

## 4. Attribution Hardening

- [x] 4.1 Tighten degraded/coarse attribution presentation for helper / engine / system-managed sources.
- [x] 4.2 Add focused tests that prevent coarse attribution from masquerading as precise source truth.

## 5. Verification

- [x] 5.1 Run `openspec validate --changes deepen-context-ledger-governance-and-attribution --strict --no-interactive`.
- [x] 5.2 Run `npm run lint`, `npm run typecheck`, `npm run check:large-files`, and focused ledger/composer Vitest suites.
