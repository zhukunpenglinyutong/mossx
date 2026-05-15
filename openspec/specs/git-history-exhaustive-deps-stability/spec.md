# git-history-exhaustive-deps-stability Specification

## Purpose

Defines the git-history-exhaustive-deps-stability behavior contract, covering Git history exhaustive-deps hotspot remediation must be batched by risk.

## Requirements
### Requirement: Git history exhaustive-deps hotspot remediation must be batched by risk

The repository SHALL NOT remediate the `react-hooks/exhaustive-deps` hotspot in `useGitHistoryPanelInteractions.tsx` as a single undifferentiated cleanup. The warning inventory for that hook MUST be split into explicit remediation batches, and each batch MUST document its risk level, targeted warning groups, and validation commands before implementation begins.

#### Scenario: Preparing the git-history hotspot task list

- **WHEN** the team prepares a remediation change for `useGitHistoryPanelInteractions.tsx`
- **THEN** the change artifacts SHALL identify a low-risk immediate batch
- **AND** the change artifacts SHALL identify any deferred preview, diff, menu, or resize batches separately
- **AND** every batch SHALL state how it will be validated before the work is executed

### Requirement: Immediate git-history remediation batches must avoid behavior-coupled preview and interaction chains

An immediate remediation batch for `useGitHistoryPanelInteractions.tsx` SHALL only include warning groups whose fixes are mechanically verifiable and limited to stable setter, stable ref, imported helper, or branch/create-pr bootstrap dependencies. The immediate batch MUST exclude warning groups that can change preview load timing, async token lifecycles, context-menu focus behavior, or resize interactions unless those chains have dedicated validation coverage.

#### Scenario: Selecting the first executable batch

- **WHEN** the first remediation batch is selected for implementation
- **THEN** the batch SHALL include warning groups such as fallback/workspace selection, branch CRUD bootstrap, and create-pr default wiring
- **AND** the batch SHALL exclude create-pr preview loaders, push/pull/sync preview loaders, branch diff loaders, and context-menu or resize handlers
- **AND** the exclusion reason for each deferred group SHALL be recorded in the task plan

### Requirement: Git-history warning remediation must preserve existing interaction behavior

Every implemented warning batch for `useGitHistoryPanelInteractions.tsx` SHALL preserve the existing `git-history` interaction contract. Lint cleanup MUST NOT silently change branch actions, create-pr bootstrap behavior, preview loading behavior, or dialog state resets without tests or targeted validation demonstrating equivalence.

#### Scenario: Validating an implemented remediation batch

- **WHEN** a remediation batch is completed
- **THEN** `npm run lint` and `npm run typecheck` SHALL pass
- **AND** targeted `git-history` tests that cover the touched interaction chain SHALL pass
- **AND** any deferred warning groups SHALL remain unmodified until their dedicated batch is scheduled

