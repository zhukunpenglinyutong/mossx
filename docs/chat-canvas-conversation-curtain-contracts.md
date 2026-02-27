# Chat Canvas Conversation Curtain Contracts

## Scope

This document defines the shared contracts used by the conversation curtain refactor:

- `NormalizedThreadEvent`
- `NormalizedHistorySnapshot`
- `ConversationState`
- `RealtimeAdapter`
- `HistoryLoader`
- `ConversationAssembler`

Implementation source: `src/features/threads/contracts/conversationCurtainContracts.ts`.

## Canonical Item Kinds

Only these `ConversationItem.kind` values are valid in the normalized pipeline:

- `message`
- `reasoning`
- `diff`
- `review`
- `explore`
- `tool`

Renderer code should not introduce engine-specific kinds.

## Realtime Contract

Each realtime adapter maps engine-specific payloads into:

- `engine`: `codex | claude | opencode`
- `workspaceId`
- `threadId`
- `eventId`
- `itemKind`
- `timestampMs`
- `item` (`ConversationItem`)
- `operation` (`itemStarted/itemUpdated/itemCompleted` 或各类 `append*`/`complete*` 增量操作)
- optional `turnId`

Positive example:

```ts
const event = {
  engine: "codex",
  workspaceId: "ws-1",
  threadId: "thread-1",
  eventId: "evt-1",
  itemKind: "tool",
  timestampMs: Date.now(),
  item: {
    id: "tool-1",
    kind: "tool",
    toolType: "commandExecution",
    title: "Run command",
    detail: "npm run typecheck",
    status: "started",
  },
};
```

Negative example:

- Missing `threadId` or `eventId`.
- Emitting an engine-private kind like `heartbeat` as `item.kind`.

## History Contract and Fallback Strategy

`NormalizedHistorySnapshot` MUST include:

- `items` array
- `plan` (`TurnPlan | null`)
- `userInputQueue` array
- `meta`
- `fallbackWarnings`

Fallback behavior is explicit and visible:

- If `items` is missing: fallback to `[]` and append warning `missing_items`.
- If `plan` is missing: fallback to `null` and append warning `missing_plan`.
- If `userInputQueue` is missing: fallback to `[]` and append warning `missing_user_input_queue`.
- If `meta` is missing: generate default meta and append warning `missing_meta`.

No silent fallback is allowed.

## Assembler Contract

`ConversationAssembler` remains the single merge boundary:

- `appendEvent(state, event)` for realtime deltas.
- `hydrateHistory(snapshot)` for restore.

The rendering kernel should consume only `ConversationState` (`items`, `plan`, `userInputQueue`, `meta`).
