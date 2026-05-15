# Design: Claude Session Engine Resolution

## Context

Restoring an existing conversation can occur while the global composer engine selector points at another engine. The message surface must render from the active thread identity, not from the global selector, otherwise a Claude history thread can incorrectly show Codex loading or recovery copy.

## Decisions

### Decision 1: Active thread metadata wins for render engine

Conversation render state resolves the active engine from the active thread's persisted metadata before falling back to the global selected engine.

Rationale: restored conversations are already bound to an engine identity. The global selector is a composer default for new work, not an authority over existing thread rendering.

### Decision 2: Composer selection remains unchanged

The fix is scoped to conversation rendering and message-surface state. It does not change global engine selection, composer defaults, or new-session creation behavior.

Rationale: using thread metadata for render state should not surprise users by switching their next-send defaults.

## Verification

- Regression coverage proves a Claude active thread renders as Claude while the global selected engine is Codex.
- Focused layout hook coverage remains green.
- Full frontend gate passed before release hardening: `npm run lint && npm run typecheck && npm run test`.
