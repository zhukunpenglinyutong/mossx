# Fix stale Claude model label after config refresh

## Background

GitHub issue #436 asks for a manual refresh path so changes in Claude Code `settings.json` can be read immediately. The main refresh UI already exists in the composer model selector, but `ModelSelect` can still show an old Claude mapping because it reads `CLAUDE_MODEL_MAPPING` from localStorage once and gives that value priority over refreshed labels from the parent model catalog.

## Goal

After the user clicks `Refresh Config`, the model selector should display the refreshed Claude settings label delivered by the parent catalog, not a stale selector-local mapping.

## Acceptance Criteria

- [x] `ModelSelect` treats the `models` prop label as the refreshed source of truth.
- [x] Stale `CLAUDE_MODEL_MAPPING` localStorage data cannot override a parent-provided refreshed label.
- [x] Default label fallback and i18n-backed known model labels continue working.
- [x] Focused regression test covers the stale mapping case.
- [ ] Verification commands pass before PR publication.

## Linked OpenSpec Change

- `openspec/changes/fix-claude-model-refresh-stale-mapping`
