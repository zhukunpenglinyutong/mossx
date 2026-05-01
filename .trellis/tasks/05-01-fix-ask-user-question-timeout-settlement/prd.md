# Fix AskUserQuestion timeout settlement

## Background

Issue #411 reports that Claude Code auto mode can leave an `AskUserQuestion` dialog visible after timeout. The backend timeout clears the pending request, but the frontend queue can still keep the dialog. Later cancel/submit attempts fail as stale responses and the queue remains stuck.

## Goal

When the backend has already timed out an AskUserQuestion request, a later empty cancel/timeout response should settle the frontend queue and close the dialog instead of preserving an impossible-to-submit request.

## Acceptance Criteria

- [x] Empty cancel/timeout response that reaches an already-settled Claude AskUserQuestion clears the pending request.
- [x] The optimistic processing marker is cleared when stale settlement is detected.
- [x] No synthetic submitted-answer history item is inserted for stale timeout responses.
- [x] Ordinary submit failures still keep the request visible for retry.
- [ ] Verification commands pass before PR publication.

## Linked OpenSpec Change

- `openspec/changes/fix-ask-user-question-timeout-settlement`
