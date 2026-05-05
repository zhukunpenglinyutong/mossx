# Fix OpenCode Auto Probe Churn

## Goal

Stop OpenCode background detection from running automatically during unrelated UI flows, and keep readiness probing behind explicit user refresh actions.

## Requirements

- Opening the workspace session menu must not auto-trigger OpenCode provider-health detection.
- Claude-only model refresh paths must not trigger OpenCode engine detection.
- Manual refresh must still allow users to probe OpenCode readiness on demand.

## Acceptance Criteria

- [ ] Sidebar menu open no longer calls OpenCode provider-health probing automatically.
- [ ] Claude pending-thread model refresh no longer triggers all-engine refresh.
- [ ] Manual refresh path still probes successfully and updates UI state.

## Technical Notes

- Primary files: `src/features/app/hooks/useSidebarMenus.ts`, `src/features/engine/hooks/useEngineController.ts`, `src/app-shell.tsx`
- Regression coverage should stay close to the existing hook tests instead of introducing broad integration rewrites.
