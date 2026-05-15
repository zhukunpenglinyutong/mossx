# exhaustive-deps-tail-warning-stability Specification

## Purpose

Defines the exhaustive-deps-tail-warning-stability behavior contract, covering Tail warning remediation remains behavior-compatible.

## Requirements
### Requirement: Tail warning remediation remains behavior-compatible
The system SHALL allow the remaining leaf-feature callbacks and effects to include all referenced dependencies without changing file tree, detached file explorer, task create modal, layout node, or worktree prompt behavior.

#### Scenario: Remaining dependency warnings are remediated
- **WHEN** the remaining leaf-feature dependency arrays are completed
- **THEN** the corresponding callbacks or effects MUST include the referenced dependencies
- **AND** the affected feature behavior MUST remain compatible with the pre-remediation behavior

### Requirement: Git-history cleanup timers remain safe after tail remediation
The system SHALL clear git-history cleanup timers through a cleanup-safe pattern that uses the latest timer ref value during unmount.

#### Scenario: Cleanup-safe timer clearing is applied
- **WHEN** `GitHistoryPanelImpl.tsx` remediates its remaining cleanup warning
- **THEN** the cleanup MUST clear the active create-PR progress timer without relying on a mount-time ref snapshot
- **AND** the existing notice/dialog cleanup behavior MUST remain intact

