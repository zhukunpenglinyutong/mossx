# Verification

## 2026-05-12 P1 Renderer Menu Cleanup

### Automated Evidence

- `rg -n "@tauri-apps/api/menu|Menu\\.new|MenuItem\\.new|Submenu\\.new|\\.popup\\(" src scripts`
  - Result: only `scripts/check-native-menu-usage.mjs` contains native-menu detection patterns; no `src/features/**` source file uses Tauri native menu APIs.
- `npm run check:native-menu-usage`
  - Result: passed. The feature allowlist is empty, so new `src/features/**` native menu usage fails the guard.
- `npm exec vitest run src/features/git/components/GitDiffPanel.test.tsx src/features/git-history/components/GitHistoryWorktreePanel.test.tsx src/features/files/components/FileTreePanel.run.test.tsx src/features/files/components/FileTreePanel.detached.test.tsx src/features/layout/hooks/useLayoutNodes.client-ui-visibility.test.tsx`
  - Result: passed, 5 files / 93 tests.
- `npm run typecheck`
  - Result: passed before test cleanup; rerun required after final artifact updates.

### Remaining Native Menu Exceptions

- None under `src/features/**`.
- App-level native menu usage remains outside this guard boundary and is owned by Rust app menu integration.

### Manual macOS Hang Matrix

2026-05-12 human desktop validation:

- Result: passed. No issue was found during manual verification.
- Coverage: exercised the native-menu deadlock regression matrix across renderer-owned menus, including repeated open/close interactions and menu action execution.
- Evidence owner: 陈湘宁.

Validated scenarios:

- Open commit checkpoint dialog and rapidly open/close generate menu 30 times.
- Select each engine/language path.
- Right-click a thread with more than 12 folder targets and rapidly open/close/click outside.
- Right-click file links inside markdown messages with image/file previews present.
- Repeat while the app is loading images through `asset://`.
- Confirm the app remains responsive for at least 5 minutes without force quit.

Release-note task `7.1` is now unblocked by this manual evidence.

### Release Note

- Fixed a macOS desktop hang risk caused by native popup menus in dynamic in-app menus. File, Git, prompt, composer, sidebar, file-link, layout tab, and commit-message selector menus now use renderer-owned menus, while app-level native menus remain available where they are actually needed.
