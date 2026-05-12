## 1. Code Audit

- [x] 1.1 Confirm current Claude CLI launch path still uses print mode + stream-json and document the finding in implementation notes.
- [x] 1.2 Confirm finalized Claude thread ids use `claude:<session_id>` and pending ids use `claude-pending-*`.
- [x] 1.3 Confirm existing terminal controller callback path from AppShell to sidebar before adding `Open in Claude TUI`.

## 2. Resume Command Contract

- [x] 2.1 Add a small helper to extract a native Claude session id from finalized Claude thread ids.
- [x] 2.2 Add a platform-aware helper to build `cd <workspace> && claude --resume <session_id>` commands.
- [x] 2.3 Unit-test command construction for POSIX paths with spaces/apostrophes, Windows drive paths, empty workspace path, and empty session id.

## 3. Sidebar Menu UX

- [x] 3.1 Add `Copy Claude resume command` to finalized Claude thread context menus.
- [x] 3.2 Keep existing `Copy ID` behavior unchanged for Claude sessions.
- [x] 3.3 Suppress or disable Claude TUI resume actions for non-Claude threads, `claude-pending-*`, and unsupported virtual/subagent ids.
- [x] 3.4 Add i18n copy for English and Chinese labels/tooltips.

## 4. Optional Terminal Open Path

- [x] 4.1 If terminal callbacks are available without architectural shortcuts, add `Open in Claude TUI`.
- [x] 4.2 Reuse existing app terminal infrastructure instead of adding a new external OS terminal launcher.
- [x] 4.3 Add focused tests proving the open action receives workspace id/path and native session id.

## 5. Verification

- [x] 5.1 Run `openspec validate add-claude-tui-resume-actions --type change --strict --no-interactive`.
- [x] 5.2 Run focused Vitest for `useSidebarMenus` and any new command helper.
- [x] 5.3 If terminal open is implemented, run focused tests for the AppShell/sidebar callback boundary.
- [x] 5.4 Verify tooltip/toast/help copy explicitly mentions `/resume <session_id>` or `claude --resume <session_id>` for TUI picker fallback.
- [x] 5.5 Manually verify a GUI-created Claude session can be resumed with the copied command in the same workspace.
