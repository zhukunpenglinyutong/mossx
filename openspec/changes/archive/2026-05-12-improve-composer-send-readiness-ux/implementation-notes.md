# Implementation Notes

Updated: 2026-05-12

## Ownership Gate

Composer owns send-intent projection only.

- Runtime lifecycle truth is consumed through structured lifecycle state.
- Conversation request truth is consumed through `RequestUserInputState`.
- Queue/fuse mechanics remain owned by queue hooks.
- Composer does not parse raw provider payload or raw runtime error text.

Refers to:

- `openspec/docs/client-stability-conversation-implementation-readiness-2026-05-11.md`

## Send Readiness Inputs

| Input | Owner | Composer Use |
|---|---|---|
| engine / provider / model / mode / accessMode | Composer selection / app settings | target summary |
| draft text / attachments | Composer local state | send intent |
| context selections | Composer context ledger / attachments | context summary |
| runtime lifecycle state | Runtime | disabled reason / activity |
| modeBlocked | Conversation control event / app state | disabled reason |
| request_user_input state | Conversation fact contract | pointer / disabled reason |
| queued / fusing state | queue hooks | activity projection |

## Disabled Reason Priority

1. `config-loading`
2. `awaiting-user-input`
3. `mode-blocked`
4. `runtime-recovering`
5. `runtime-quarantined`
6. `runtime-ended`
7. `empty-draft`

This priority prevents runtime/config/request states from overwriting each other in the button layer.

## Implemented Helper And UI

Added `src/features/composer/utils/composerSendReadiness.ts`:

- `ComposerSendReadiness`
- `buildComposerSendReadiness`
- `buildComposerContextSummary`
- `resolveComposerDisabledReason`
- `projectComposerActivity`

Added `src/features/composer/components/ChatInputBox/ComposerReadinessBar.tsx`:

- Renders target: engine / model / mode.
- Renders context summary from the pure helper, with visible linked-memory / file / image / agent / ledger summary when context exists.
- Keeps empty context placeholders hidden; it must not display `no-extra-context`, `可发送`, or `输入为空` as decorative header copy.
- Uses the real engine icon without a status-dot fallback or button-like background.
- Exposes the context-ledger expand action as plain text in the input header, wired to the existing `ContextLedgerPanel`.
- Uses responsive CSS inside the existing ChatInputBox header area.

The UI is wired through a narrow prop chain:

`Composer.tsx -> ChatInputBoxAdapter -> ChatInputBox -> ChatInputBoxHeader -> ComposerReadinessBar`

It intentionally does not change send / stop / queue mechanics.

## UI Calibration Backfill - 2026-05-12

The implementation received an additional visual alignment pass after screenshot review.

Completed refinements:

- Restored linked-context summary copy on the right side of the header while preserving the compact one-line readiness surface.
- Removed button/card styling from the engine icon in the readiness header.
- Kept the bottom status-panel toggle in its original toolbar location; only the header ledger expand text opens the ledger details.
- Hid the model and reasoning selector leading icons in the footer primary row, while keeping dropdown option icons intact.
- Normalized header/footer rhythm: readiness header and footer primary row now align around the same 34px control row; home composer footer padding is symmetrical instead of bottom-heavy.
- Compressed the footer visual height without changing send / stop / queue behavior.

Refers to:

- `src/features/composer/components/ChatInputBox/ComposerReadinessBar.tsx`
- `src/features/composer/components/ChatInputBox/styles/banners.css`
- `src/features/composer/components/ChatInputBox/styles/toolbar.css`
- `src/features/composer/components/ChatInputBox/styles/selectors.css`
- `src/features/composer/components/ChatInputBox/styles/buttons.css`
- `src/styles/home-chat.css`
- `src/i18n/locales/zh.part1.ts`
- `src/i18n/locales/en.part1.ts`

## Completed Tests

- Codex target summary and context chips.
- Claude Plan target summary.
- Disabled reason priority.
- Runtime lifecycle projection mapping.
- Queue/fuse activity projection.
- request_user_input pending pointer and submitted non-blocking state.
- Empty context summary.
- Readiness bar render test for engine / model / mode / linked-context summary and plain text expand action.
- Adapter forwarding test for the `sendReadiness` projection.
- Composer context-ledger governance and transition tests for expanding the ledger details from the header.
- ButtonArea / ModelSelect / ReasoningSelect tests after footer icon and alignment calibration.

Latest verification evidence:

- `pnpm vitest run src/features/composer/components/ChatInputBox/ComposerReadinessBar.test.tsx src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx src/features/composer/components/Composer.context-ledger-governance.test.tsx src/features/composer/components/Composer.context-ledger-transition.test.tsx`
- `pnpm vitest run src/features/composer/components/ChatInputBox/ButtonArea.test.tsx src/features/composer/components/ChatInputBox/selectors/ModelSelect.test.tsx src/features/composer/components/ChatInputBox/selectors/ReasoningSelect.test.tsx`
- `pnpm vitest run src/features/composer/components/ChatInputBox/ButtonArea.test.tsx src/features/composer/components/ChatInputBox/ComposerReadinessBar.test.tsx`
- `npm run typecheck`
- `git diff --check`

## Review Backfill - 2026-05-12

Code review focused on empty drafts, invalid context counts, queued slash commands, fuse eligibility, pending versus settled `request_user_input`, runtime lifecycle projection, and heavy-test-noise / large-file CI compatibility.

Findings:

- No runtime code changes were required in this pass.
- `MessageQueue` disables fuse for empty content and slash commands, and the focused tests cover both edge cases.
- `ComposerSendReadiness` sanitizes invalid/fractional context counts and treats only pending `request_user_input` as blocking.
- Runtime `recovering / stopping / replacing / quarantined / ended` states are conservatively projected to disabled reasons.

Latest review verification:

- `openspec validate improve-composer-send-readiness-ux --type change --strict`
- `npm run typecheck`
- `node --test scripts/check-large-files.test.mjs`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:large-files:gate`
- `pnpm vitest run src/features/composer/utils/composerSendReadiness.test.ts src/features/composer/components/ChatInputBox/MessageQueue.test.tsx src/features/threads/contracts/conversationFactContract.test.ts src/features/threads/assembly/conversationNormalization.test.ts src/features/threads/loaders/historyLoaders.test.ts`

## Post-Archive Manual QA Recommendations

These are release/manual-QA recommendations, not blockers for the current `23/23` completed tasks:

- Product manual pass: verify the home composer, workspace composer, dark/light themes, and narrow layout with real selected memory / note / file / image / ledger contexts.
- If the header/footer still feels visually heavy after manual review, only adjust CSS sizing tokens; do not change component ownership or move controls again.
- Before archive, run the broader composer regression set covering IME, slash command, file reference, prompt history, queued send, request_user_input, and context ledger.

Final consistency:

- `tasks.md` is complete at `23/23`.
- Current implementation covers the send-readiness view model, readiness header, request pointer projection, queue/fuse activity expression, large-component guardrail, CSS calibration, and focused verification listed above.
