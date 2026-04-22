## 1. Analysis and batching

- [x] 1.1 Capture the current `useGitHistoryPanelInteractions.tsx` warning inventory and classify it into low-risk and deferred groups.
- [x] 1.2 Define the first executable `P0` batch as fallback/workspace selection, branch CRUD bootstrap, and create-pr default wiring warnings.
- [x] 1.3 Record deferred groups for create-pr preview, push/pull/sync preview, branch diff loaders, and context-menu/resize handlers.

## 2. P0 immediate remediation

- [x] 2.1 Remove the low-risk fallback/workspace and branch CRUD warning set by completing missing stable setter/helper/service dependencies without changing interaction behavior.
- [x] 2.2 Remove the low-risk create-pr bootstrap warning set by completing defaults, head-repository parsing, and simple copy-handler dependencies without entering preview loader chains.

## 3. Validation

- [x] 3.1 Run `npm run lint` and confirm the warning count for `useGitHistoryPanelInteractions.tsx` decreases without introducing new errors.
- [x] 3.2 Run `npm run typecheck`.
- [x] 3.3 Run targeted `git-history` tests covering the touched interaction flows.

## 4. P1 preview remediation

- [x] 4.1 Remove the create-pr preview warning set by completing preview loader, preview details effect, dialog open/close, and create-pr workflow dependencies without changing preview behavior.
- [x] 4.2 Remove the push/pull/sync preview warning set by completing dialog bootstrap, preview loader, preview details effect, and confirm-handler dependencies without changing preview behavior.
- [x] 4.3 Re-run `npm run lint`, `npm run typecheck`, and targeted `git-history` preview tests to validate the `P1` batch.

## 5. Deferred follow-up batches

- [ ] 5.1 Schedule a dedicated `P2` batch for branch diff loaders, context-menu focus handlers, and resize interactions only after confirming targeted test coverage.
