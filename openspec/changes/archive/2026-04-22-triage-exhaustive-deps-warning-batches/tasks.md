## 1. Inventory and classification

- [x] 1.1 Capture the current `react-hooks/exhaustive-deps` snapshot and keep the `109 warnings / 25 files` inventory synchronized with the proposal tables.
- [x] 1.2 Freeze the `P0` immediate batch at `11` warnings across `9` files and confirm that no `git-history`, `threads`, `app-shell`, or sentinel-pattern warning is included.

## 2. Execute the P0 immediate batch

- [x] 2.1 Implement `P0-A` for the bounded derive/helper warnings in `OpenCodeControlPanel`, `FileViewPanel`, `GitDiffPanel`, `ReadToolBlock`, `SearchPalette`, and `useSpecHub`.
- [x] 2.2 Validate `P0-A` with `npm run lint`, `npm run typecheck`, and any relevant targeted `vitest` suites for the touched modules.
- [x] 2.3 Implement `P0-B` for the bounded callback/effect warnings in `WebServiceSettings`, `ProjectMemoryPanel`, and `useSystemResolvedTheme`.
- [x] 2.4 Validate `P0-B` with `npm run lint`, `npm run typecheck`, and any relevant targeted `vitest` suites for the touched modules.

## 3. Prepare follow-up batches

- [x] 3.1 Refresh the remaining warning inventory after `P0` and publish the residual count for deferred files.
- [x] 3.2 Create the next design-ready batch boundary for `app-shell`, `threads`, `git-history`, and sentinel-pattern warnings without mixing them into the `P0` implementation.
