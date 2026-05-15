## Why

Memory Reference is a one-shot project memory retrieval action, but the current UI renders the retrieval lifecycle as two separate "记忆上下文摘要" cards:

1. `Memory Reference: querying project memory...`
2. final result such as `Memory Reference: no related project memory found`

These are not two different pieces of context. They are two states of the same retrieval task. Showing both creates visual noise, makes the user think two memory contexts were injected, and weakens trust in the one-shot injection model.

## Scope

This change fixes only the first step we agreed on:

- Memory Reference status SHALL render as a single stable summary card per send.
- The card SHALL transition in place from querying to final result.
- Queried memory context display SHALL be normalized across live and historical messages.
- Markdown-heavy legacy memory summaries SHALL render through the Markdown renderer instead of a collapsed plain-text paragraph.
- Multiple injected memory packs SHALL use UI-only display indexes in the resource card, while preserving real `[Mx]` citations in details.
- Users SHALL be able to inspect the exact memory payload injected into the main conversation turn.
- Manual `@@` selected memory cards are not changed.
- The retrieval pack injection contract from `project-memory-retrieval-pack-cleaner` is not changed.

## Follow-up Research Captured But Not Implemented

We also agreed that current Memory Reference retrieval is still essentially text search, and natural-language recall prompts such as "我在这个项目里主要做了哪些对话" can miss project memories.

The likely next direction is local semantic retrieval, but it requires a separate design discussion before implementation:

- local embedding generation for Project Memory records;
- workspace-local vector sidecar index;
- hybrid retrieval: vector recall + lexical/tag/time/importance rerank + cleaner;
- index lifecycle for memory create/update/delete;
- runtime fallback when local embedding is unavailable.

This change SHALL NOT implement embeddings, vector search, ANN indexes, SQLite vector extensions, or new model/runtime dependencies.

## What Changes

- Generate a stable Memory Reference summary item id for each send attempt.
- Insert the querying card with that stable id.
- Update the same item id with the final preview text.
- Ensure timeout/error/empty/found states all reuse the same card.
- Prefer retrieval pack source records for the visible memory context card, showing stable memory indexes and titles instead of dumping cleaned/source payload text.
- Preserve raw Markdown for legacy memory summary cards so lists, headings, and inline code stay formatted when expanded.
- Add a sent-details dialog for retrieval-pack cards to show the exact `<project-memory-pack>` payload.
- Render sent-details `Cleaned Context` through Markdown by default, with raw payload retained in a collapsible audit section.
- Reuse `projectMemoryRetrievalPack` parsing output for sent-details rendering instead of duplicating retrieval-pack parsing inside the message component.
- Add tests proving one Memory Reference send produces one summary card, not separate querying and result cards.

## Non-Goals

- No retrieval scoring changes.
- No backend project memory search changes.
- No semantic/vector search implementation.
- No changes to capture/storage schema.
- No changes to `@@` manual memory selection semantics.

## Impact

- Primary implementation: `src/features/threads/hooks/useThreadMessaging.ts`.
- Display implementation: `src/features/messages/components/messagesMemoryContext.ts`, `src/features/messages/components/MessagesRows.tsx`, `src/styles/messages.part1.css`.
- Retrieval-pack parser support: `src/features/project-memory/utils/projectMemoryRetrievalPack.ts`.
- Primary tests: `src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`, `src/features/messages/components/Messages.test.tsx`, `src/features/project-memory/utils/projectMemoryRetrievalPack.test.ts`.
- OpenSpec delta: `project-memory-consumption`.

## Acceptance Criteria

- When Memory Reference is enabled, the UI first shows one "querying project memory" card.
- When retrieval completes, the same card is updated to the final status.
- The timeline SHALL NOT contain both querying and final Memory Reference cards for the same send.
- Retrieval pack cards SHALL use the same normalized record-list display in live and history views.
- Retrieval pack cards SHALL avoid duplicate visible `[M1]` badges when multiple packs are present.
- Retrieval pack cards SHALL expose the exact sent payload through an explicit details action.
- Sent payload details SHALL render readable Markdown by default and preserve raw payload for audit/debugging.
- Legacy Markdown summary cards SHALL preserve Markdown formatting when expanded.
- Sending continues to use the same injected retrieval pack payload as before.
- Tests cover empty/no-related and found-memory paths.

## Review Notes

- Review found no blocking issue in the Memory Reference single-card or normalized memory-card display path.
- One review issue was fixed before finalizing: the sent-details dialog initially duplicated retrieval-pack parsing logic in `MessagesRows.tsx`; parsing is now sourced from `projectMemoryRetrievalPack.ts` to avoid format drift.
- Full project gates passed after review: lint, typecheck, target vitest, `git diff --check`, large-file sentry, and OpenSpec strict validation.
- Residual product risk: the current retrieval quality remains lexical/text-search based; local semantic retrieval remains a separate follow-up and is intentionally not implemented in this change.
