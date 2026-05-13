## Implementation Notes

- Claude backend launch path remains `claude -p` print mode with `--output-format stream-json` in `src-tauri/src/engine/claude.rs`; this change does not mutate Claude transcript metadata.
- Existing runtime identity remains finalized `claude:<session_id>` and pending `claude-pending-*` / `claude-pending-shared-*`; resume affordances only parse finalized `claude:` ids.
- Sidebar-to-terminal integration uses existing React callback plumbing: `Sidebar` -> `useSidebarMenus` -> `useLayoutNodes` -> `useAppShellWorkspaceFlowsSection` -> `useTerminalController` / `writeTerminalSession`.
- `Copy Claude resume command` builds platform-aware shell commands with workspace path and native session id.
- `Open in Claude TUI` reuses the built-in terminal and sends `claude --resume <session_id>` only for safe native session ids.
- Manual GUI/TUI verification still requires a real GUI-created Claude session and an installed Claude TUI environment.
