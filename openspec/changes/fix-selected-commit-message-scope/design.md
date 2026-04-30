## Design

The existing selective commit flow already computes `selectedCommitPaths` from staged files, unstaged files, and user selection overrides. The fix reuses that source of truth instead of introducing a second selection model.

Frontend flow:

- `GitDiffPanel` passes `selectedCommitPaths` as the third argument to `onGenerateCommitMessage` when the selection is non-empty.
- `useGitCommitController` forwards those paths to `generateCommitMessageWithEngine`.
- The Tauri service passes `selectedPaths` to both the direct Codex command and the prompt-building path used by non-Codex engines.

Backend flow:

- `generate_commit_message` and `get_commit_message_prompt` accept optional `selected_paths`.
- `get_workspace_diff_with_selected_paths` resolves the repository once, then delegates to full diff collection or path-filtered diff collection.
- `collect_workspace_diff_for_paths` applies git2 `DiffOptions::pathspec` to both staged and worktree fallback diffs, keeping the existing staged-first behavior.

## Boundaries

- Empty or absent `selectedPaths` keeps the previous full-diff behavior.
- This change does not alter the commit button, temporary staging, or file selection UI.
- The history worktree panel continues to generate from its whole worktree scope.
