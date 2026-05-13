# Implementation Notes

Updated: 2026-05-12

## Ownership Gate

Conversation owns transcript fact truth only.

- Runtime retry / lifecycle recovery remains owned by `stabilize-runtime-session-lifecycle`.
- Composer readiness may consume conversation facts later, but does not decide request lifecycle state.
- Renderer must consume normalized facts and visibility; it must not classify raw provider payload.

Refers to:

- `openspec/docs/client-stability-conversation-implementation-readiness-2026-05-11.md`

## Fact Classification Inventory

| Source | Raw Input Examples | Fact Boundary |
|---|---|---|
| Claude | synthetic approval resume marker, `No response requested.`, `developer_instructions` pollution | `hidden-control-plane` / hidden |
| Codex | `request_user_input`, `modeBlocked`, runtime/recovery compact signals | `tool` with request lifecycle or `control-event` / compact |
| Gemini | unknown legacy payload from history parser | `legacy-safe` visible fallback, never silent drop |

## Realtime / History Difference Matrix

| Item | Fact Layer | Presentation Layer |
|---|---|---|
| user | normalized dialogue fact with comparable text/images | sticky/collapsible user bubble |
| assistant | normalized dialogue fact with semantic equivalence | Markdown / live row rendering |
| reasoning | reasoning fact with content/summary equivalence | reasoning block title/collapse |
| tool | structured tool fact | grouped tool card / presentation profile |
| request_user_input | structured tool fact with lifecycle state | primary message card; Composer pointer only |
| modeBlocked | compact `control-event` | compact status row or Composer disabled reason |

## Implemented Contract

Added `src/features/threads/contracts/conversationFactContract.ts`:

- `ConversationFactKind`
- `ConversationFactVisibility`
- `ConversationFactConfidence`
- `RequestUserInputState`
- `classifyConversationObservation`
- `isRequestUserInputSettled`

The implementation is intentionally feature-local. It introduces the shared contract/helper, routes high-confidence history/assembler facts through the classifier, and keeps Rust storage schema and provider runtime payloads unchanged.

Assembler integration:

- `hydrateHistory` / snapshot item upsert now runs `classifyConversationObservation`.
- Only high-confidence `hidden-control-plane` facts are filtered at this stage.
- Compact control events are formatted as stable diagnostic tool rows, reusing the existing `toolType=modeBlocked` renderer path instead of introducing a parallel item kind.
- `request_user_input` lifecycle states are explicit. `submitted` / `timeout` / `dismissed` / `cancelled` / `stale` are treated as settled and therefore non-blocking for downstream Composer readiness projection.

## Downstream Composer Integration - 2026-05-12

Composer now consumes the conversation fact contract instead of reclassifying request payloads locally.

Implemented integration:

- `ComposerSendReadiness` imports `RequestUserInputState` and `isRequestUserInputSettled`.
- Pending `request_user_input` projects to `awaiting-user-input` and exposes a Composer pointer action.
- Settled request states remain non-blocking for send readiness.
- The Composer pointer stays a jump/locator affordance; the actual request form and settlement UI remain in the message surface.
- Context-ledger expansion from the input header opens the existing ledger details panel without changing conversation fact classification.

Refers to:

- `src/features/composer/utils/composerSendReadiness.ts`
- `src/features/app/components/RequestUserInputMessage.tsx`
- `src/features/composer/components/Composer.tsx`
- `src/features/threads/contracts/conversationFactContract.ts`

## Completed Tests

- Synthetic approval resume marker is `hidden-control-plane`.
- `modeBlocked` is `control-event` with compact visibility.
- `request_user_input` pending/submitted states remain explicit, and settled states are detectable.
- Every settled `request_user_input` state is non-blocking.
- Compact `modeBlocked` events are preserved as diagnostic tool rows and do not become assistant prose.
- Unknown Gemini payload remains `legacy-safe` visible.
- History hydrate filters hidden synthetic approval markers while preserving visible assistant rows.
- Realtime/history parity suite remains green after the hidden-control-plane guard.
- Composer readiness tests cover pending request pointer and submitted non-blocking behavior.
- Composer UI tests cover header pointer wiring without moving the request form into Composer.

Latest downstream verification:

- `pnpm vitest run src/features/composer/components/ChatInputBox/ComposerReadinessBar.test.tsx src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx src/features/composer/components/Composer.context-ledger-governance.test.tsx src/features/composer/components/Composer.context-ledger-transition.test.tsx`
- `npm run typecheck`
- `git diff --check`

## Review Backfill - 2026-05-12

Code review focused on hidden control-plane false positives, request_user_input settlement, local history fallback behavior, path/newline compatibility, and CI sentry compatibility.

Findings:

- No runtime code changes were required in this pass.
- Current `classifyConversationObservation` keeps unknown provider payloads visible as `legacy-safe`, which is the correct conservative boundary for false-positive prevention.
- Natural-language mentions of `No response requested.`, `developer_instructions`, or interruption wording are covered by focused tests and remain visible.
- Codex invalid-thread local history fallback is covered by the broader history loader suite used in this review.

Latest review verification:

- `openspec validate converge-conversation-fact-contract --type change --strict`
- `npm run typecheck`
- `node --test scripts/check-large-files.test.mjs`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:large-files:gate`
- `pnpm vitest run src/features/composer/utils/composerSendReadiness.test.ts src/features/composer/components/ChatInputBox/MessageQueue.test.tsx src/features/threads/contracts/conversationFactContract.test.ts src/features/threads/assembly/conversationNormalization.test.ts src/features/threads/loaders/historyLoaders.test.ts`

## Post-Archive Follow-Up Recommendations

These are future hardening items, not blockers for the current `15/15` completed tasks:

- Route more realtime delta paths and provider loaders through `classifyConversationObservation` when those paths are next touched.
- Expand semantic equivalence helpers for additional completed replay and turn-aware assistant dedupe fixtures.
- Extend realtime/history parity fixtures with more provider samples after main-spec sync.
- Before archive, rerun the broader conversation fact suites together with Composer request pointer tests.

Final consistency:

- `tasks.md` is complete at `15/15`.
- Current implementation covers the feature-local fact contract, high-confidence hidden-control-plane filtering, compact control-event formatting, request_user_input settlement, and Composer send-readiness consumption.
