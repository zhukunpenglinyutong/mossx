## 1. P0 search and transition remediation

- [x] 1.1 Remove the search palette warning set in `useAppShellSearchAndComposerSection.ts` by completing close/open/toggle/filter/selection dependencies without changing search behavior.
- [x] 1.2 Remove the low-risk transition warning set in `useAppShellSections.ts` by completing kanban panel open and home/workspace transition dependencies without changing navigation behavior.

## 2. P1 scheduler validation

- [x] 2.1 Remove the recurring scheduler warning in `useAppShellSections.ts` by completing the `kanbanCreateTask` effect dependency without changing recurring execution behavior.
- [x] 2.2 Re-run `npm run lint`, `npm run typecheck`, and targeted `app-shell` / `kanban` tests to validate both batches.
