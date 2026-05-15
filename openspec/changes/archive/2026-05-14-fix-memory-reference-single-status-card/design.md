## Design

### Current Problem

`useThreadMessaging.sendMessageToThread` currently dispatches two different items:

- a querying summary item before `scoutProjectMemory(...)`;
- a final summary item after `injectMemoryScoutBriefContext(...)`.

Both ids include randomness, so the reducer treats them as separate timeline rows. This turns one retrieval lifecycle into two user-visible cards.

### Target Contract

For each send with `memoryReferenceEnabled === true`, the send path creates one stable `memoryScoutSummaryItemId` and uses it for both lifecycle states:

```text
memory-scout-context-${sendNonce}
```

Flow:

1. Before retrieval, upsert item with `Memory Reference: querying project memory...`.
2. Run `scoutProjectMemory(...)` and `injectMemoryScoutBriefContext(...)`.
3. If preview text exists, upsert the same item id with final preview text.
4. If preview text is unexpectedly absent, keep the querying card only if there is no safe final state; normal `empty/error/timeout/found` flows all already produce preview text.

### Why `upsertItem`

The reducer already supports replacing an existing item by id. Reusing the id is lower risk than adding a new lifecycle state type or new message kind.

### Display Normalization

Memory context cards must not have one visual contract for the immediate send path and another contract when the same injected payload is read from history.

For `project-memory-pack` payloads, the UI should treat `Source Records` as the display authority:

```text
#1 Project memory title
#2 Another memory title
```

The card body should render those records as a structured list. The left badge is a UI-only display index (`#1`, `#2`, ...), not the real model citation. This avoids duplicate visible `[M1]` badges when multiple packs are shown together, because each pack may have its own internal citation namespace.

The card should keep the real source citation (`[M1]`, `[M2]`, ...), source type, and memory id as metadata/details. It should not dump `Cleaned Context`, `Original user input`, or `Original assistant response` into the visible card because those fields can contain long Markdown, tables, and raw retrieval-pack implementation details.

The full retrieval pack remains injected for the main model. The user-facing resource card is only an index/title map, with an explicit "sent details" affordance that shows the exact `<project-memory-pack>` payload injected into the conversation turn for audit/debugging.

The sent-details view should not default to a giant raw `<pre>` block. It should parse each `project-memory-pack`, render the `Cleaned Context` section with the existing Markdown renderer, and keep the exact raw payload available in a collapsible raw section. This gives users a readable audit surface while preserving the lossless debugging payload.

The details view must escape the message row stacking/scrolling context. It should render through a document-level portal instead of as a child of the message row, otherwise transformed or overflow-clipped message containers can crop the dialog body.

The details view must not own an independent retrieval-pack parser. The parsing source of truth is `projectMemoryRetrievalPack.ts`; UI code consumes parsed pack summaries and focuses on rendering only. This prevents drift if the retrieval-pack schema adds attributes or sections later.

For legacy memory summary text without structured records, the card should preserve the raw Markdown preview and render it with the existing Markdown component. That keeps headings, lists, inline code, and tables formatted instead of flattening them into one plain paragraph.

### Semantic Retrieval Follow-up

The second issue is retrieval quality. Current retrieval starts with backend substring filtering over `title + summary + clean_text`, then frontend scoring can only operate on returned candidates. That architecture can miss broad recall prompts.

The preferred follow-up direction is a new change, tentatively `project-memory-local-semantic-retrieval`, with:

- deterministic embedding text construction from `title`, `tags`, `userInput`, `assistantResponse`, `assistantThinkingSummary`, `detail`, and `cleanText`;
- exact cosine scan as MVP before introducing ANN complexity;
- hybrid rerank by vector similarity, lexical overlap, tags, record kind, importance, and recency;
- explicit fallback to lexical retrieval if local embedding is unavailable.

This design note is intentionally non-executable for this change; it records the decision boundary only.

### Validation

- Vitest should assert there is exactly one Memory Reference summary card after a send.
- Vitest should assert the querying copy is replaced by the final result copy.
- Vitest should assert retrieval pack cards show stable memory indexes and titles outside the user bubble.
- Vitest should assert multiple packs do not show duplicate visible `[M1]` badges and can reveal the exact sent payload.
- The sent-payload dialog should render outside the message row container so it is not clipped by timeline overflow.
- The sent-payload dialog should render cleaned Markdown by default and keep raw payload available for inspection.
- Retrieval-pack details rendering should reuse the project-memory parser rather than duplicating parser regexes in the message component.
- Vitest should assert legacy Markdown memory summaries render as Markdown inside the normalized card.
- Existing injection assertions should remain unchanged.
