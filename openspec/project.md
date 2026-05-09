# Project Context

- Type: OpenSpec Workspace
- Updated At: 2026-05-08T00:00:00+08:00
- Scope: governance snapshot for the current `mossx` repository workspace

## Domain

OpenSpec workflow and governance for `mossx`, covering change lifecycle, main spec maintenance, validation, sync, and archive discipline.

## Architecture

- Spec artifacts: `openspec/specs/*`
- Change workflow artifacts: `openspec/changes/<change-id>/{proposal,design,tasks,verification}.md`
- Archive: `openspec/changes/archive/*`
- Current workspace state: active changes = `4`, archive changes = `259`, main specs = `235`

## Entry Surfaces

- `openspec/README.md`
  - concise navigation and common commands
- `openspec/project.md`
  - detailed governance overview and current workspace snapshot
- `openspec/changes/<change-id>/*`
  - change-local truth for proposal, design, tasks, and verification
- `openspec/specs/*`
  - mainline capability truth after sync/archive

## Governance Model

- `AGENTS.md`
  - repo entry, rule priority, global gates, minimal reading path
- `.trellis/spec/**`
  - implementation rules and executable contracts
- `openspec/**`
  - behavior specs, change workflow, archive, and workspace governance
- `.claude/**` / `.codex/**`
  - host hooks, commands, and adapter glue
- `.omx/**` and other local runtime state
  - runtime artifacts, not repository truth

## Active Changes

- `add-codex-structured-launch-profile`
- `claude-code-mode-progressive-rollout`
- `fix-windows-codex-app-server-wrapper-launch`
- `project-memory-refactor`

> Current status should be read from each change directory itself. `project.md` tracks workspace inventory and governance boundaries, not task-by-task execution detail.

## Namespace Policy

- Canonical prefix: `spec-hub-*`
- Compatibility prefix: `spec-platform-*` (legacy only; no new requirements)
- New proposals SHOULD use canonical prefixes unless compatibility migration requires otherwise

## Workflow Governance

- OpenSpec is the source of truth for behavior changes:
  - `openspec/changes/<change-id>/*` defines proposal/design/tasks/spec deltas.
  - behavior changes SHOULD be tracked by an OpenSpec change before implementation.
- Trellis is the execution container for delivery:
  - `.trellis/tasks/*` should map back to one OpenSpec change.
  - implementation and verification should be traceable to the linked change artifacts.
- Recommended delivery loop:
  1. Select or create an OpenSpec change.
  2. Create or activate the linked Trellis task.
  3. Implement and verify.
  4. Sync main specs and archive when the change passes gate checks.

## Key Commands

- `openspec validate --all --strict --no-interactive`
- `openspec status --change <change-id>`
- `find openspec/specs -mindepth 1 -maxdepth 1 -type d | wc -l`
- `find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive | wc -l`
- `find openspec/changes/archive -mindepth 1 -maxdepth 1 -type d | wc -l`
- `python3 .claude/skills/osp-openspec-sync/scripts/validate-consistency.py --project-path . --full`

## Maintenance Boundaries

- `openspec/README.md` stays concise and navigation-oriented.
- `openspec/project.md` keeps durable governance context and current inventory only.
- High-drift implementation evidence, commit matrices, and temporary backfill snapshots should live in the relevant change artifacts or archive notes, not here.
- Host-specific session-start logic belongs in `.claude/**` or `.codex/**`, not in OpenSpec workspace docs.

## Owners

- CodeMoss Team

## Update History

- 2026-05-08: Archived `dynamic-claude-model-discovery` after syncing the Claude dynamic discovery spec and selector refresh requirements into the main specs (specs=235, archive=259, active=4).
- 2026-05-06: Archived `fix-conversation-curtain-visible-copy-tail` after syncing the remaining curtain visible-copy requirements into the main specs (specs=226, archive=247, active=8).
- 2026-05-06: Archived `fix-conversation-curtain-i18n-gaps` after syncing curtain i18n requirements into the main specs (specs=226, archive=246, active=7).
- 2026-05-06: Removed stale package-template references from manual Trellis entry docs and pruned `project.md` to a low-drift governance snapshot (specs=226, archive=245, active=7).
- 2026-05-02: Archived 10 completed changes after strict validation; synced missing specs for `conversation-curtain-normalization-core`, `project-memory-ui`, and `codex-composer-startup-selection-stability` before archive where needed.
- 2026-04-23: Recalibrated OpenSpec snapshot counts after archive drift and cleared the last strict validation warning on `conversation-user-path-reference-cards`.
- 2026-04-16: Added team governance for OpenSpec + Trellis collaboration, including mandatory change/task linkage and delivery loop definition.
- 2026-02-23: Initial OpenSpec workspace context import.
