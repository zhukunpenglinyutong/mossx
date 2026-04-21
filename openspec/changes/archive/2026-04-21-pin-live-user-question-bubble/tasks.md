## 1. OpenSpec And Task Context

- [x] 1.1 Verify proposal/design/spec artifacts are complete and apply-ready. Input: `openspec/changes/pin-live-user-question-bubble/*`. Output: OpenSpec status shows `tasks` done. Validation: `openspec status --change pin-live-user-question-bubble`.
- [x] 1.2 Create and start a Trellis task linked to `pin-live-user-question-bubble`. Input: change id. Output: `.trellis/tasks/*` current task. Validation: `python3 ./.trellis/scripts/task.py list`.

## 2. Core Implementation

- [x] 2.1 Derive the latest ordinary user message id in `Messages.tsx`. Input: rendered/effective message timeline and active processing state. Output: stable boolean per message wrapper. Validation: component tests cover latest-vs-earlier user messages.
- [x] 2.2 Apply a scoped sticky class only during realtime processing and not for restored history. Input: `isThinking`, `conversationState.meta.historyRestoredAtMs`, user message metadata. Output: sticky class appears only for active realtime latest user question. Validation: `Messages.live-behavior.test.tsx`.
- [x] 2.3 Add scoped CSS in `messages.css` for sticky top behavior. Input: existing `.messages` scroll container and message wrapper DOM. Output: latest user bubble pins inside message viewport without data mutation. Validation: CSS rule present and targeted tests pass.

## 3. Verification

- [x] 3.1 Add regression tests for realtime sticky behavior, completion recovery, history recovery, and earlier-message exclusion. Input: `Messages.live-behavior.test.tsx`. Output: failing-before/passing-after coverage. Validation: targeted Vitest command.
- [x] 3.2 Run focused and required quality gates. Input: changed frontend files. Output: passing test/type/large-file checks or documented blocker. Validation: `npm run test -- src/features/messages/components/Messages.live-behavior.test.tsx`, `npm run check:large-files`, `npm run typecheck`.
- [x] 3.3 Mark OpenSpec tasks complete after implementation and validation. Input: task outcomes. Output: checked task list. Validation: `openspec status --change pin-live-user-question-bubble`.

## 4. Follow-up Regression

- [x] 4.1 Preserve the latest sticky user question when realtime history windowing trims older timeline items. Input: active realtime turn with more than 30 rendered entries after the user question. Output: latest ordinary user question remains rendered with sticky class. Validation: `Messages.live-behavior.test.tsx`.

## Validation Notes

- `openspec validate pin-live-user-question-bubble --type change --strict --no-interactive`: passed.
- `npm run test -- src/features/messages/components/Messages.live-behavior.test.tsx`: passed via batched runner; full batched test run completed 325 test files, including `Messages.live-behavior.test.tsx` with 22 tests.
- `npx vitest run src/features/messages/components/Messages.live-behavior.test.tsx`: follow-up targeted run passed, 23 tests after adding the window-trim regression case and the sticky top-offset fix.
- `npm run typecheck`: passed.
- `npm run lint`: passed with existing warnings, 0 errors.
- `git diff --check`: passed.
- `npm run check:large-files`: command completed; reports `src/features/messages/components/Messages.tsx` at 3073 lines. This includes parallel in-worktree `Explored` changes in the same file and this narrow follow-up, so the warning is documented instead of rewriting unrelated behavior.
