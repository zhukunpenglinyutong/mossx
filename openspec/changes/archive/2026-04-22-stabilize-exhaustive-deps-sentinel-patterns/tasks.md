## 1. Sentinel design alignment

- [x] 1.1 Document the sentinel-pattern scope for `ButtonArea` and `useSessionRadarFeed`, including why their old warning shapes could not be fixed mechanically.
- [x] 1.2 Freeze the implementation boundary to these two modules only, with no spillover into `git-history`, `threads`, or shared runtime abstractions.

## 2. ButtonArea storage snapshot refactor

- [x] 2.1 Replace `customModelsVersion` with an explicit storage snapshot that updates on `storage` and same-tab `localStorageChange` events.
- [x] 2.2 Add a focused test proving that custom model changes refresh the rendered model list without relying on a version-only dependency sentinel.

## 3. Session radar snapshot refactor

- [x] 3.1 Replace `durationRefreshTick` with an explicit clock value consumed by the incremental radar feed derivation.
- [x] 3.2 Replace `historyMutationVersion` with an explicit persisted-history snapshot consumed by recent feed merging.
- [x] 3.3 Extend radar tests to prove timer refresh and history-event refresh still work after the refactor.

## 4. Validation

- [x] 4.1 Run `npm run lint` and confirm the 3 sentinel warnings are gone.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run direct `npx vitest run ...` for the touched ButtonArea and session radar tests.
