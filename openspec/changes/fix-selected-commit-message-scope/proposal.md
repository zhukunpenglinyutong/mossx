## Why

Git commit message generation currently ignores the commit selection state added to the diff panel. When users include only a subset of files for commit, the AI prompt is still built from the full staged/worktree diff, so the generated message can describe files that will not be committed.

## What Changes

- Pass selected commit paths from `GitDiffPanel` into the commit message generation controller.
- Thread selected paths through the Tauri service and commit message commands.
- Filter Rust diff collection by selected pathspecs when a selection is provided, while preserving the existing full-diff fallback when no selection is provided.
- Cover the UI propagation and Rust diff filtering behavior with focused tests.

## Impact

- Affects Git diff panel AI commit message generation for Codex, Claude, Gemini, and OpenCode engines.
- Does not change commit execution semantics, staging behavior, or history worktree generation when no selected path scope is supplied.
