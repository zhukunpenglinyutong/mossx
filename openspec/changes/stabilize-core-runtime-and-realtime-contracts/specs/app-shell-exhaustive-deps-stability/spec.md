## ADDED Requirements

### Requirement: AppShell Typing MUST Be Restored Through Behavior-Preserving Boundaries

`AppShell` typing remediation MUST reduce `ts-nocheck` exposure through explicit boundary objects or equivalent typed section contracts, while preserving visible behavior.

#### Scenario: workspace boundary typing preserves workspace behavior

- **WHEN** workspace selection, workspace actions, worktree actions, or workspace restore callbacks are extracted or typed
- **THEN** existing workspace selection, group management, worktree management, and restore behavior MUST remain unchanged
- **AND** type remediation MUST NOT force unrelated feature imports or callback rewiring

#### Scenario: composer and search boundary typing preserves interaction behavior

- **WHEN** composer/search callbacks are extracted or typed
- **THEN** composer submit, prompt expansion, search palette open/close, result opening, filter toggles, and selection reset MUST preserve existing behavior
- **AND** the boundary MUST make ownership of state and callbacks explicit

#### Scenario: runtime and thread boundary typing preserves lifecycle visibility

- **WHEN** runtime/thread state and callbacks are extracted or typed
- **THEN** thread selection, active thread binding, processing status, runtime notices, and recovery surfaces MUST preserve existing behavior
- **AND** the extraction MUST NOT hide runtime lifecycle regressions behind broader `any` types

#### Scenario: ts-nocheck removal is incremental and evidence-backed

- **WHEN** a batch reduces or removes `// @ts-nocheck` from `src/app-shell.tsx`
- **THEN** the batch MUST pass `npm run typecheck`
- **AND** any remaining `ts-nocheck` scope MUST be documented with concrete blocker and follow-up path
