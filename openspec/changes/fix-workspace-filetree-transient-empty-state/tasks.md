## 1. Hook State Machine

- [x] 1.1 Input: `useWorkspaceFiles` current workspace lifecycle; Output: distinguish pending, loaded-empty, loaded-non-empty without backend changes; Verification: hook tests assert `isLoading` during unconfirmed current workspace snapshot.
- [x] 1.2 Input: fast workspace switch and delayed responses; Output: stale responses remain ignored; Verification: existing stale response test still passes.

## 2. File Tree Empty-State Rendering

- [x] 2.1 Input: `FileTreePanel` loading and empty checks; Output: empty state considers both files and directories; Verification: component test covers directories-only snapshot.
- [x] 2.2 Input: root node selection refresh path; Output: delayed current snapshot renders children without page navigation; Verification: hook/component tests cover delayed refresh.
- [x] 2.3 Input: light theme pending root snapshot; Output: root pending state renders a compact inline loading indicator; Verification: component test asserts status row renders before empty state.

## 3. Validation

- [x] 3.1 Run focused Vitest for workspace file hook and file tree panel.
- [x] 3.2 Run OpenSpec validation for the new change.
