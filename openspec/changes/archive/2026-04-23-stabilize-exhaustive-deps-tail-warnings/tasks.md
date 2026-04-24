## 1. Tail warning remediation

- [x] 1.1 Remove the remaining dependency warnings in `FileTreePanel.tsx`, `useDetachedFileExplorerState.ts`, `TaskCreateModal.tsx`, `useLayoutNodes.tsx`, and `WorktreePrompt.tsx` without changing feature behavior.
- [x] 1.2 Remove the remaining `GitHistoryPanelImpl.tsx` ref cleanup warning by switching to a cleanup-safe timer clearing pattern.
- [x] 1.3 Re-run `npm run lint`, `npm run typecheck`, and targeted feature tests to validate the tail batch and confirm repository-wide exhaustive-deps warnings drop to zero.
