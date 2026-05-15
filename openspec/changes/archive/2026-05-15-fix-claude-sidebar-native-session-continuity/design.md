## Context

Claude sidebar listing currently blends several data sources:

- runtime thread summaries
- cached sidebar snapshots
- native Claude JSONL summaries from `listClaudeSessions`
- shared workspace session catalog projection
- title mappings from user rename state

Recent startup and projection changes split hydration into `first-page` and `full-catalog`. This improved time-to-interactive, but it also created a dangerous semantic gap: `first-page` intentionally skips native/catalog scans, while later full-catalog/native calls can be partial, timed out, or transiently empty. The sidebar merge path does not consistently distinguish "not scanned" from "authoritatively absent" for Claude sessions.

Codex received explicit sidebar continuity guards for degraded projection paths. Claude received reopen/history continuity hardening, but not equivalent listing continuity for native session summaries. That asymmetry explains why real Claude JSONL files can exist while sidebar rows disappear or names regress.

## Goals / Non-Goals

**Goals:**

- Treat Claude native JSONL summaries as the authority for Claude historical sidebar membership after successful full hydration.
- Treat degraded/partial/timeout/first-page results as non-authoritative for deletion.
- Preserve stable user-facing titles during merge.
- Preserve parent-child lineage metadata and relationship-preserving limits.
- Keep archive/hidden/control-plane filtering authoritative.

**Non-Goals:**

- No unbounded startup scan.
- No rewrite of session catalog scope resolver.
- No radar-to-sidebar authority inversion.
- No storage migration for existing Claude transcripts or title maps.

## Decisions

### Decision 1: Add Claude continuity beside Codex continuity

**Decision**

Introduce a Claude-specific continuity merge that applies when the current refresh is degraded or incomplete. It should preserve last-good Claude summaries for the same workspace unless the incoming data contains authoritative evidence that the row was deleted, archived, hidden, or out of scope.

Degraded/incomplete evidence includes:

- `startupHydrationMode === "first-page"`
- `claude-session-timeout`
- `claude-session-error`
- catalog partial/degraded markers for Claude or shared projection
- empty Claude subset from a source that cannot prove completeness

**Why**

The core bug is that "not loaded this pass" is being treated as "does not exist". Continuity must encode that distinction explicitly.

**Alternative considered**

Always force a full native scan before rendering. Rejected because it reverses the startup orchestrator performance work and will regress large workspaces.

### Decision 2: Stable title wins over weaker fallback

**Decision**

When merging summaries for the same Claude session identity, title confidence must be ordered:

1. mapped/custom user title
2. existing non-generic meaningful title
3. native/catalog first-message preview
4. engine generic fallback such as `Claude Session`
5. runtime ordinal fallback such as `Agent N`

Lower-confidence names must not overwrite higher-confidence names during refresh.

**Why**

The user's "name reset" symptom is a user-facing identity regression. A refresh can improve a name when it has stronger evidence, but it cannot degrade a stable name to a generic fallback.

**Alternative considered**

Use latest row timestamp/name unconditionally. Rejected because newer projection rows are not necessarily more authoritative about title identity.

### Decision 3: Continuity merge preserves relationship metadata

**Decision**

The merge must keep `parentThreadId`, `parentSessionId`, engine source, and native session id metadata when preserving rows. If a fresh row and last-good row disagree, prefer the fresh non-null relationship fields from authoritative native/catalog data; otherwise keep the existing relationship fields.

**Why**

Claude parent-child rows are not flat UI decoration. They affect grouping, subagent/fork display, and activation identity. A continuity fix that flattens the tree would trade one P0 for another.

**Alternative considered**

Preserve only id/name/timestamp for last-good rows. Rejected because it breaks parent-child display and relationship-preserving limits.

### Decision 4: Archive/hidden filters remain hard gates

**Decision**

Continuity preservation must not revive rows explicitly filtered by archive, hidden, or control-plane rules. If the current projection contains authoritative archive/hidden/delete evidence for a session id, last-good preservation must skip it.

**Why**

Last-good is a fallback for incomplete reads, not a second source of truth that can override user deletion or archival actions.

**Alternative considered**

Blindly append all previous Claude rows during degraded refresh. Rejected because it can resurrect removed sessions and inflate counts.

## Implementation Sketch

```text
listThreadsForWorkspace(workspace, mode)
  collect runtime/cache/native/catalog rows
  record partial/degraded sources

  build fresh summaries
  merge catalog/native summaries by canonical id
  apply stable-title merge for same-id rows

  if refresh cannot prove Claude completeness:
    merge last-good Claude summaries
      skip archived/hidden/authoritatively deleted ids
      keep parent/child metadata
      do not overwrite stronger fresh rows

  publish sidebar summaries
  only update last-good when result is usable and not a destructive degraded empty
```

## Risks / Trade-offs

- [Risk] Last-good rows can make a genuinely deleted Claude session linger if delete evidence is not propagated. Mitigation: keep authoritative delete/archive/hidden filters as hard gates and add tests.
- [Risk] Title confidence detection can be too conservative and keep an older name. Mitigation: mapped/custom titles still win, and native meaningful names may replace generic fallbacks.
- [Risk] Continuity can mask backend scan bugs. Mitigation: degraded state remains recorded; continuity only protects UI membership, not diagnostics.
- [Risk] Parent-child metadata conflicts can occur between old and fresh rows. Mitigation: fresh non-null authoritative relationship fields win; otherwise preserve old relationship fields.

## Migration Plan

1. Add helper tests for stable title merge and Claude parent metadata preservation.
2. Add hook tests for degraded Claude native refresh retaining last-good summaries.
3. Implement helper functions for Claude continuity and title confidence.
4. Wire helper into `listThreadsForWorkspace` after fresh summaries are built and partial sources are known.
5. Validate OpenSpec and focused frontend suites.

## Rollback

The rollback is confined to the projection layer:

- Remove the Claude continuity merge invocation.
- Remove the stable-title helper behavior if it regresses an unexpected title flow.
- Keep OpenSpec change available as an audit trail until a replacement design is approved.
