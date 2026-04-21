## 1. OpenSpec And Task Setup

- [x] 1.1 Create proposal, delta spec, design, and implementation checklist for `fix-explored-card-auto-collapse-after-stage` (input: user requirement; output: OpenSpec artifacts; validation: `openspec validate --strict`)
- [x] 1.2 Create and start the linked Trellis task (input: OpenSpec change id; output: `.trellis/tasks/04-21-fix-explored-card-auto-collapse`; validation: `python3 ./.trellis/scripts/task.py list`)

## 2. Frontend Behavior

- [x] 2.1 Derive the current live Explore auto-expanded id from the latest rendered grouped timeline entry (input: `renderedItems` / `groupedEntries`; output: stage-scoped Explore expansion state; validation: target unit test)
- [x] 2.2 Use the derived live Explore id when rendering `ExploreRow`, while preserving manual `expandedItems` behavior (dependency: 2.1; output: updated `Messages.tsx`; validation: existing Explore tests)
- [x] 2.3 Collapse completed Explore details when processing ends or when the current live stage is no longer Explore, without touching non-Explore expanded items (dependency: 2.1; output: updated state cleanup effect; validation: regression test)

## 3. Verification

- [x] 3.1 Add regression coverage for `isThinking=true` followed by a non-Explore stage (input: `Messages.explore.test.tsx`; output: failing-then-passing test; validation: `npm exec vitest run src/features/messages/components/Messages.explore.test.tsx`)
- [x] 3.2 Run target test and TypeScript typecheck (dependency: 2.x and 3.1; output: verification result; validation: `npm exec vitest run src/features/messages/components/Messages.explore.test.tsx` and `npm run typecheck`)
