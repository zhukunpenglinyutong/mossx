# Obsolete Note: Previous Batch A Contract Freeze

This note is intentionally retained as a drift marker, not as an implementation fact.

## Status

The previous Batch A contract-freeze note is obsolete.

It claimed several V2 concepts were frozen or already switched, including:

- `ProjectMemoryItemV2`
- `MemoryListProjection`
- `ProjectMemoryDetailPayload`
- `OperationTrailEntry`
- projection/detail read-model split
- removal of V1 `hardDelete`

Rewrite-time code inspection showed those concepts were not implemented in the active code path. At that point, the active implementation still used:

- `src/services/tauri/projectMemory.ts`
- `src/features/project-memory/services/projectMemoryFacade.ts`
- `src/features/threads/hooks/useThreadMessaging.ts`
- `src/features/threads/hooks/useThreads.ts`
- `src-tauri/src/project_memory.rs`

and still exposed V1-style fields and behavior such as:

- `summary/detail/rawText/cleanText`
- `deletedAt`
- `hardDelete?: boolean`
- digest-based assistant output fusion

## Replacement Direction

The rewritten proposal no longer treats operation trail and full V2 projection as the first milestone.

The new P0 contract is:

1. Preserve complete `userInput`.
2. Preserve complete `assistantResponse`.
3. Bind both to `workspaceId/threadId/turnId`.
4. Keep `summary/detail/cleanText` as compatibility projections only.

Any future implementation should follow `proposal.md`, `design.md`, and `tasks.md` in this change directory, not the old Batch A assumptions.
