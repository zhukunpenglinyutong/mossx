## Context

`Messages.tsx` renders the scrollable conversation canvas inside `.messages`, with `.messages-full` as the inner content column. User messages are already wrapped by a message anchor node and then rendered by `MessageRow`.

The current realtime flow auto-follows appended content through `bottomRef.scrollIntoView(...)`. As reasoning/tool/assistant content grows, the latest user question can scroll out of sight even though it is the semantic anchor for the active turn.

This change is frontend-only. It should not touch runtime commands, history loaders, message normalization, storage, or copy payloads.

## Goals / Non-Goals

**Goals:**

- Pin only the latest ordinary user question bubble during active realtime processing.
- Remove the pin automatically when processing ends.
- Keep restored/history conversations as ordinary scroll content.
- Preserve existing message payloads, copy behavior, anchor rail, auto-follow, and live middle-step collapse behavior.

**Non-Goals:**

- No manual pin/unpin UI.
- No sticky assistant/tool/reasoning cards.
- No backend, storage, or Tauri contract changes.
- No virtualization or large-scale message layout rewrite.

## Decisions

### Decision 1: Use conditional class plus CSS `position: sticky`

`Messages.tsx` will identify the latest ordinary user message from the rendered timeline and apply a dedicated wrapper class while realtime processing is active. `messages.css` will use `position: sticky` against the existing `.messages` scroll container.

Alternatives considered:

- Floating duplicate overlay: gives more control but creates duplicate DOM, copy/selection ambiguity, and accessibility drift.
- Rewriting auto-scroll target math: couples the feature to scroll scheduling and risks breaking user-controlled scroll and auto-follow.

### Decision 2: Treat history restore as an explicit opt-out

When `conversationState?.meta.historyRestoredAtMs` is present, the view represents a restored history snapshot and the sticky class will not be applied even if other props temporarily look processing-like.

Legacy prop rendering without `conversationState` can still rely on `isThinking`; history mode has `isThinking=false`, so it naturally remains non-sticky.

### Decision 3: Exclude agent-task notification messages

Agent task notification rows reuse `role: "user"` for a different visual card. The sticky contract targets user question bubbles, so agent-task notification user rows stay in normal flow.

## Risks / Trade-offs

- Sticky stacking could cover nearby content. Mitigation: use a small top inset, explicit z-index, and background separation only on the wrapper area.
- Very tall user questions can occupy too much viewport. Mitigation: existing `CollapsibleUserTextBlock` already constrains long user text.
- CSS `content-visibility` can interact poorly with sticky in some browsers. Mitigation: disable `content-visibility` on the sticky wrapper only.

## Migration Plan

1. Add OpenSpec delta and tasks.
2. Add conditional wrapper class in `Messages.tsx`.
3. Add scoped sticky styles in `messages.css`.
4. Add `Messages.live-behavior.test.tsx` coverage.
5. Validate with targeted tests, large-file guard, and typecheck.

Rollback is a simple frontend revert: remove the conditional class, CSS rule, and tests. No data migration is needed.

## Open Questions

None for the MVP. The behavior is intentionally display-only and scoped to active realtime processing.
