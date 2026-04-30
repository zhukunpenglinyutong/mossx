# git-commit-message-generation Delta

## Modified Requirements

### Requirement: AI Commit Message Generation MUST Respect Selected Commit Scope

When a commit selection is provided, the generated commit message prompt MUST be built only from the selected paths.

#### Scenario: selected staged file excludes other staged files

- **WHEN** the diff panel has multiple staged files
- **AND** the user generates a commit message for a subset selection
- **THEN** the backend diff used for prompt construction MUST include selected paths
- **AND** MUST exclude unselected staged paths

#### Scenario: selected worktree file excludes other worktree files

- **WHEN** the commit message generation request includes selected worktree paths
- **THEN** the backend worktree fallback diff MUST apply the same selected path filter
- **AND** MUST not describe unselected worktree files

#### Scenario: no selected paths preserves existing behavior

- **WHEN** no selected path list is supplied
- **THEN** commit message generation MUST keep the existing full staged-first diff behavior
