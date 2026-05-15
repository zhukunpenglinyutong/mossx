## Why

Claude Code sessions can exist on disk while the left sidebar intermittently shows too few rows, resets names, or drops entries after startup and catalog refresh. The current projection path can treat `first-page`, partial catalog, timeout, or transient empty native scans as authoritative membership, which violates Claude native JSONL session truth.

This must be fixed as a P0 because the sidebar is the user's primary session identity surface: losing rows or names makes real Claude work look deleted even when radar/runtime evidence proves the sessions still exist.

## 目标与边界

### 目标

- Make Claude sidebar listing converge to native disk session truth after full hydration.
- Preserve last-good Claude sidebar summaries when a refresh is explicitly degraded, partial, timed out, or startup-only.
- Prevent generic fallback titles such as `Agent N` or `Claude Session` from overwriting stable mapped/custom/native titles.
- Preserve Claude parent/child session relationships while applying continuity merges.
- Keep shared workspace session catalog projection aligned with sidebar membership without letting degraded projection erase native Claude truth.

### 边界

- This change is scoped to sidebar/session-list projection, merge, continuity, and regression tests.
- Native Claude JSONL schema, storage layout, and Rust transcript parsing remain unchanged unless tests reveal a source-scoped diagnostic gap.
- Existing archive/hidden/control-plane filtering remains authoritative and must not be bypassed by last-good preservation.

## 非目标

- Do not migrate or rewrite `~/.claude/projects/**` transcripts.
- Do not replace the shared workspace session catalog architecture.
- Do not expand sidebar visible-window limits into unbounded scans.
- Do not change Claude activation/reopen history loading semantics except where listing truth requires stable identities.
- Do not modify radar aggregation as an authority source; radar remains a consumer/observer, not the disk truth.

## What Changes

- Add a Claude-specific sidebar continuity rule for degraded refreshes:
  - `first-page` startup hydration
  - `claude-session-timeout`
  - `claude-session-error`
  - catalog partial/degraded results that cannot prove completeness
  - transient empty native/session results without authoritative deletion evidence
- Update summary merge behavior so stable Claude names survive later lower-confidence fallback names.
- Keep `parentThreadId` / `parentSessionId` metadata intact when preserving or merging Claude rows.
- Add regression tests covering degraded refreshes, title preservation, and parent-child relationship preservation.
- Write explicit OpenSpec requirements so future startup/catalog optimizations cannot regress native Claude sidebar truth.

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | Force every startup sidebar load to synchronously scan full Claude native history | Simple truth model; reduces deferred-state bugs | Regresses startup performance; conflicts with existing first-page orchestration; large histories can block interactivity | 不采用 |
| B | Keep startup first-page, but treat degraded/partial/empty refreshes as non-authoritative and merge last-good Claude native rows | Preserves performance and fixes disappearance; minimal blast radius in projection layer | Requires precise guards so archived/hidden rows are not resurrected | 采用 |
| C | Move all sidebar membership to radar/runtime caches | Radar already has activity evidence | Radar is not disk truth and cannot prove native transcript membership or archived state | 不采用 |

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `claude-session-sidebar-state-parity`: Add native listing continuity and stable title requirements for degraded sidebar refreshes.
- `workspace-session-catalog-projection`: Clarify that shared active projection may be partial/degraded and must not erase Claude native sidebar truth without authoritative evidence.

## 验收标准

- `first-page` startup hydration may show a bounded initial window, but it must not erase existing Claude rows or mark unswept native sessions as absent.
- If `listClaudeSessions` times out or errors after a previous successful Claude listing, the sidebar must keep last-good Claude rows and expose degraded state.
- If a full-catalog refresh returns an empty Claude subset without authoritative delete/archive evidence, the sidebar must not clear last-good Claude native rows.
- A later generic title fallback must not overwrite a stable mapped title, custom title, or existing meaningful Claude title.
- Parent-child metadata for Claude sessions must survive continuity merge, including `parentThreadId` and `parentSessionId`.
- Archived, hidden, or control-plane sessions must remain filtered and must not be resurrected by last-good preservation.
- Focused Vitest coverage must exercise degraded refresh, title preservation, and parent-child preservation.
- `openspec validate fix-claude-sidebar-native-session-continuity --strict --no-interactive` must pass.

## Impact

- Frontend:
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadActions.helpers.ts`
  - focused thread action/helper tests
- Specs:
  - `openspec/specs/claude-session-sidebar-state-parity/spec.md`
  - `openspec/specs/workspace-session-catalog-projection/spec.md`
- Backend:
  - No planned backend behavior change. Rust Claude scan code is treated as the native truth provider; only source-scoped diagnostics may be touched if tests reveal missing evidence.
