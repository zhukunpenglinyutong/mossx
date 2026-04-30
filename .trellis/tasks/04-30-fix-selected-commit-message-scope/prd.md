# Fix Selected Commit Message Generation Scope

## Problem

GitHub issue #467 reports that AI-generated commit messages ignore the files selected for commit and instead describe all changed files. This makes the generated message unreliable for selective commits.

## Goals

- Use the same selected commit path list for commit message generation and commit execution.
- Keep existing behavior when no selected path scope is supplied.
- Support all commit message engines through the same selected-path prompt scope.

## Non-Goals

- Do not redesign commit selection UI.
- Do not change staging or commit execution semantics.
- Do not change Git history worktree panel whole-worktree generation.

## Acceptance Criteria

- [x] The diff panel forwards selected commit paths when generating AI commit messages.
- [x] The Tauri service accepts optional selected paths for Codex and non-Codex engines.
- [x] Backend diff collection filters staged and worktree fallback diffs by selected pathspecs.
- [x] Empty or absent selected paths preserve existing full-diff behavior.
- [x] Focused frontend and Rust tests cover the regression.
