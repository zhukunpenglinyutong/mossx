# Project Context

- Type: OpenSpec Workspace
- Updated At: 2026-05-02T00:00:00+08:00
- Sync Scope: backfill OpenSpec/Trellis documentation for git range `3adf51af0ceff9597930e4f85435ef99f4fa96a8..HEAD`

## Domain

OpenSpec workflow and governance for CodeMoss/ccgui, including change lifecycle management, validation, sync, and archive.

## Architecture

- Spec artifacts: `openspec/specs/*`
- Change workflow artifacts: `openspec/changes/<change-id>/{proposal,design,tasks,verification}.md`
- Archive: `openspec/changes/archive/*`
- Current change state: active changes = `6`, archive changes = `224`, main specs = `208`
- Command/skill layer: `.claude/commands/open-spec/*`, `.claude/skills/*`
- Consistency tooling: `.claude/skills/osp-openspec-sync/scripts/*`
- External spec root contract: custom spec root accepts both `<project-root>` and `<project-root>/openspec` forms.

## Capability Metrics (Fine)

| Domain | Count |
|---|---:|
| `spec-hub-*` | 13 |
| `spec-platform-*` (legacy) | 5 |
| `codex-chat-canvas-*` | 9 |
| `workspace-*` | 11 |
| `composer-*` | 11 |
| `file-view/file-tree/filetree-*` | 7 |
| `git-*` | 9 |
| `opencode-*` | 6 |
| `conversation-*` | 15 |
| `project-memory-*` | 5 |
| `session-activity-*` | 1 |
| `memory-list-*` | 4 |
| `kanban-*` | 4 |
| `panel-lock-*` | 2 |
| integration/connector (`feishu-*`,`third-party-*`,`external-message-*`) | 3 |
| large-file governance (`large-file-*`,`bridge-cleanup-*`) | 2 |
| runtime-log (`project-runtime-log-viewer`) | 1 |
| `settings-*` | 1 |
| terminal shell (`terminal-shell-*`) | 1 |
| quality sentry (`heavy-test-*`,`large-file-*`) | 2 |
| misc | 36 |

## Code Alignment Snapshot (v0.3.8-v0.3.12)

| Capability | Commit(s) | Evidence |
|---|---|---|
| `workspace-sidebar-visual-harmony` | `f58c612`,`f6dd3a6`,`c2cc1e8`,`b8e0084` | `src/features/app/components/ThreadList.tsx`; `src/features/app/components/PinnedThreadList.tsx`; `src/styles/sidebar.css` |
| `git-commit-message-generation` (new) | `1be1b40`,`1546b79` | `src/services/tauri.ts` (`generateCommitMessageWithEngine`); `src/utils/commitMessage.ts` (`sanitizeGeneratedCommitMessage`) |
| `composer-shortcut-actions-menu` (new) | `5a48bf1`,`f7a56de` | `src/features/composer/components/ChatInputBox/selectors/ShortcutActionsSelect.tsx`; `ShortcutActionsSelect.test.tsx` |
| `conversation-user-path-reference-cards` (new) | `7b29e5a`,`05dfb50`,`ff6887d` | `src/features/messages/components/CollapsibleUserTextBlock.tsx`; `Messages.user-input.test.tsx` |
| `conversation-stream-activity-presence` (new) | `e739fb4`,`ab9945f` | `src/features/threads/hooks/useStreamActivityPhase.ts`; `src/features/messages/components/Messages.tsx`; `src/features/composer/components/ChatInputBox/ButtonArea.tsx` |
| `codex-cross-source-history-unification` | `6de613c`,`bbee279` | `src-tauri/src/codex/mod.rs` (`partialSource`, cached ids reuse, `sizeBytes/sourceLabel`) |
| `conversation-lifecycle-contract` | `0186c6c` | `src/features/threads/hooks/useThreadActions.ts` (workspace reconnect before retry `thread/list`) |
| `conversation-template-maintenance` | `261be2a` | `src/features/messages/components/toolBlocks/GenericToolBlock.tsx` (multi-file independent collapse rows) |
| `client-global-ui-scaling` | `12e94a8` | `src-tauri/src/shared/settings_core.rs` (`sanitize_canvas_width_mode`) |
| `opencode-mode-ux` | `90f19c6`,`95a338f` | `src/features/settings/components/McpSection.tsx`; `src/i18n/locales/en.part1.ts` (`ruleRuntimeOpenCode`) |
| `settings-local-usage-analytics` | `ba90970` | `src-tauri/src/local_usage.rs`; `src/features/settings/components/UsageSection.tsx` |

## Code Alignment Snapshot (`3adf51a..HEAD`)

| Capability / Area | Representative Commit(s) | Evidence |
|---|---|---|
| `codex-context-auto-compaction` | `536062c` | `src/features/threads/hooks/useThreadsReducer.ts`; `src/features/threads/hooks/useThreadTurnEvents.ts`; `openspec/specs/codex-context-auto-compaction/spec.md` |
| `conversation-hard-delete` / `conversation-lifecycle-contract` | `5970d73`,`510e737`,`080d52d` | `src/features/threads/hooks/useThreads.ts`; `src/features/threads/hooks/useThreadActions.ts`; `src-tauri/src/session_management.rs` |
| `git-selective-commit` / `git-commit-message-generation` / `git-panel-diff-view` | `c2bbf53`,`df4709b`,`da9ea37`,`a6770de` | `src/features/git/components/GitDiffPanel.tsx`; `src/features/git-history/components/GitHistoryWorktreePanel.tsx`; `src-tauri/src/git/mod.rs` |
| `detached-spec-hub-window` / `spec-hub-workbench-ui` | `a6dd7b2`,`c2ca9e0`,`3b74b06` | `src/features/spec/components/DetachedSpecHubWindow.tsx`; `src/features/spec/components/spec-hub/reader/*`; `src/styles/spec-hub.reader-layout.css` |
| `workspace-note-card-pool` / `composer-note-card-reference` | `c277c8a`,`8257af6`,`178accb`,`c60e6d` | `src-tauri/src/note_cards.rs`; `src/features/note-cards/**`; `src/features/messages/components/messagesNoteCardContext.ts` |
| `codex-composer-startup-selection-stability` | `7fbf130`,`33082ce`,`2fc0489`,`28eaec3`,`76632c2`,`6125bba` | `src/app-shell.tsx`; `src/app-shell-parts/modelSelection.ts`; `src/features/models/hooks/useModels.ts` |
| `composer-context-project-resource-discovery` | `9b1b63c`,`f0c3ecc`,`851c105` | `src-tauri/src/skills.rs`; `src/features/settings/components/SkillsSection.tsx` |
| `terminal-shell-configuration` | `9bf3de6`,`5227e43` | `src-tauri/src/terminal.rs`; `src-tauri/src/shared/settings_core.rs`; `src/features/settings/components/SettingsView.tsx` |
| `composer-model-selector-config-actions` | `4a49638` | `src/features/composer/components/ChatInputBox/selectors/ModelSelect.tsx` |
| `codex-chat-canvas-user-input-elicitation` | `a6b50d1`,`851c105` | `src/features/threads/hooks/useThreadUserInput.ts` |
| `codex-app-server-wrapper-launch` | `13c193d` | `src-tauri/src/backend/app_server_cli.rs` |
| `conversation-completion-email-notification` | `c5d725e` | `src-tauri/src/engine/events.rs`; `src/features/app/hooks/useAppServerEvents.ts` |
| `workspace-sidebar-visual-harmony` | `3ee7523`,`1be5bc0`,`38f215c` | `src/features/app/components/Sidebar.tsx`; `src/features/app/utils/exitedSessionVisibility.ts`; `src/styles/sidebar.css` |
| `conversation-curtain-normalization-core` / `project-memory-ui` | `7177533` | `src/features/messages/components/messagesMemoryContext.ts`; `src/features/threads/assembly/conversationNormalization.ts` |
| `heavy-test-noise-cleanliness` / `large-file-modularization-governance` | `16c68c9`,`b6c0d66` | `scripts/check-heavy-test-noise.mjs`; `scripts/check-large-files.mjs`; `.github/workflows/large-file-governance.yml` |

## Namespace Policy

- Canonical prefix: `spec-hub-*`
- Compatibility prefix: `spec-platform-*` (legacy only, no new requirements)
- New proposals SHOULD use canonical prefix to avoid capability split.

## Active Changes

- `add-codex-structured-launch-profile` (proposal only; implementation not started)
- `adjust-codex-stalled-timeouts` (tasks complete, but `design` artifact remains `ready`; not archived)
- `allow-branch-update-without-checkout` (25/26 tasks complete)
- `claude-code-mode-progressive-rollout` (proposal backfilled to current runtime reality; rollout tail work pending)
- `fix-windows-codex-app-server-wrapper-launch` (partial; Windows wrapper launch + user-local CLI discovery backfill)
- `project-memory-refactor` (proposal only; V2 contract freeze not started)

## Workflow Governance (OpenSpec + Trellis)

- OpenSpec is the source of truth for behavioral requirements:
  - `openspec/changes/<change-id>/*` defines proposal/design/tasks/spec deltas.
  - Any behavior change MUST be tracked by an OpenSpec change before implementation.
- Trellis is the execution container for delivery:
  - Every Trellis task in `.trellis/tasks/*` MUST reference exactly one OpenSpec change ID.
  - Task implementation and verification should map back to OpenSpec tasks/scenarios.
- Required delivery loop for team collaboration:
  1. Select or create OpenSpec change.
  2. Create/start Trellis task linked to the change.
  3. Implement and test.
  4. Run OpenSpec verification and sync/archive as needed.
- Tooling fallback policy:
  - Team members without local OpenSpec/Trellis CLI may still develop code,
    but MUST follow repository workflow docs and keep change/task linkage in commits/PRs.

## Key Commands

- `find openspec/specs -mindepth 1 -maxdepth 1 -type d | wc -l`
- `find openspec/changes/archive -mindepth 1 -maxdepth 1 -type d | wc -l`
- `find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive | wc -l`
- `python3 .claude/skills/osp-openspec-sync/scripts/validate-consistency.py --project-path . --full`
- `bash .claude/skills/osp-openspec-sync/scripts/detect-conflicts.sh .`

## Constraints

- This repository stores specs and workflow artifacts, not product runtime code.
- Archive sync must ensure delta specs are represented in `openspec/specs/`.
- Avoid introducing new `spec-platform-*` capabilities unless migration compatibility requires it.

## Open Backlog

- `adjust-codex-stalled-timeouts` 需补齐 `design` artifact 状态后再归档；当前 tasks 虽为 10/10，但 artifact gate 未关闭。
- `allow-branch-update-without-checkout`、`fix-windows-codex-app-server-wrapper-launch`、`claude-code-mode-progressive-rollout` 仍需完成剩余任务后再进入 archive gate。
- `spec-platform-*` legacy 能力仍有 `5` 个，继续执行“冻结新增 Requirement”策略。
- 后续 PR 需要避免绕过本轮新增的 skill discovery、terminal shell、conversation lifecycle 与 quality sentry contracts。

## Owners

- CodeMoss Team

## Update History

- 2026-05-02: Archived 10 completed changes after strict validation; synced missing specs for `conversation-curtain-normalization-core`, `project-memory-ui`, and new `codex-composer-startup-selection-stability` before archive where needed (specs=208, archive=224, active=6; `openspec validate --all --strict` = 214 passed, 0 failed).
- 2026-05-02: Added active change `sync-post-3adf51a-doc-backfill` to backfill `3adf51af0ceff9597930e4f85435ef99f4fa96a8..HEAD`; synchronized 15 capability deltas into main specs and updated Trellis code-specs for skill discovery, Windows CLI fallback, stale delete/list guards, one-shot composer commands, terminal shell copy, and quality sentries (specs=207, archive=214, active=16).
- 2026-04-23: Recalibrated OpenSpec snapshot counts after archive drift (`fix-claude-doctor-settings-alignment` already archived in worktree state) and cleared the last strict validation warning on `conversation-user-path-reference-cards` (specs=168, archive=162, active=3; `openspec validate --all --strict` = 171 passed, 0 failed).
- 2026-04-23: Synced `codex-computer-use-plugin-bridge`, `computer-use-availability-surface`, and `computer-use-platform-adapter` into main specs; archived `add-codex-computer-use-plugin-bridge` after Windows `unsupported` and macOS `blocked` manual evidence closed `E.3` (specs=168, archive=161, active=4).
- 2026-04-22: Archived `fix-claude-chat-canvas-cross-platform-blanking` and synced `conversation-render-surface-stability` + `conversation-stream-activity-presence` into main specs (specs=143, archive=136, active=6 before second archive).
- 2026-04-22: Archived `fix-opencode-auto-probe-churn`, synced `opencode-mode-ux`, and refreshed active change inventory after proposal reality backfill (specs=143, archive=137, active=5).
- 2026-04-16: Added team governance for OpenSpec + Trellis collaboration, including mandatory change/task linkage and delivery loop definition.
- 2026-04-13: Synced `add-topbar-session-tabs-bulk-close-actions` with main spec + verification artifacts (boundary fix: unknown processing status preserved; keyboard context menu parity on desktop).
- 2026-04-12: Archived `2026-04-12-sync-v0.3.12-openspec` as `2026-04-12-2026-04-12-sync-v0.3.12-openspec` (`--skip-specs`, because main specs were pre-synced) (specs=111, archive=97, active=1).
- 2026-04-12: Archived `2026-04-12-sync-v0.3.8-v0.3.12-openspec` as `2026-04-11-2026-04-12-sync-v0.3.8-v0.3.12-openspec` (`--skip-specs`, because main specs were pre-synced) (specs=111, archive=96, active=2).
- 2026-04-12: Added active change `2026-04-12-sync-v0.3.8-v0.3.12-openspec`; added 4 capabilities + 1 modified capability for range alignment (specs=111, archive=95, active=3).
- 2026-04-12: Added active change `2026-04-12-sync-v0.3.12-openspec`; synced v0.3.12 change inventory and updated core specs/docs (specs=107, archive=95, active=2).
- 2026-04-08: Archived all active changes (`fix-codex-source-switch-runtime-apply-2026-03-31`, `2026-04-08-fix-claude-runtime-termination-hardening`) and synced delta specs (specs=106, archive=95, active=0).
- 2026-03-20: Full spec info sync after bulk archive (specs=93, archive=84, active=0; validation checks=297, warnings=12, errors=0).
- 2026-03-20: Re-synced with finer granularity (domain metrics, code evidence matrix, backlog visibility).
- 2026-02-27: Synced repository context with current capability landscape, namespace policy, and active change states.
- 2026-02-23: Initial OpenSpec workspace context import.
