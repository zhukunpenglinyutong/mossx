# Startup Trace Samples

Change: `refactor-client-startup-orchestrator`
Date: 2026-05-11

These samples are compact, code-backed trace excerpts captured from the orchestrated startup paths and focused tests. They intentionally avoid committing full startup logs or large trace dumps.

## Small Workspace

### Before

- `shell-ready` was not attributable to startup task phases.
- Mount-time hooks could invoke `list_threads`, `list_thread_titles`, `list_claude_sessions`, `opencode_session_list`, `list_workspace_files`, catalog loads, and dictation status without a shared startup phase.
- Thread/session refresh was one full path: runtime page plus native/session catalog merge.

### After

```text
milestone shell-ready
milestone input-ready
task thread-list:first-page:ws-small queued phase=active-workspace command=list_threads
task thread-list:first-page:ws-small started phase=active-workspace
command list_threads completed workspace=ws-small
task thread-list:first-page:ws-small completed phase=active-workspace
milestone active-workspace-ready
task thread-list:session-radar:ws-small queued phase=idle-prewarm command=list_threads
task thread-list:session-radar:ws-small started phase=idle-prewarm
command list_threads completed workspace=ws-small
command list_claude_sessions completed workspace=global
command get_git_status completed workspace=ws-small
task thread-list:session-radar:ws-small completed phase=idle-prewarm
```

Evidence:

- `src/app-shell-parts/useWorkspaceThreadListHydration.test.tsx` verifies active workspace uses `startupHydrationMode: "first-page"` and records `active-workspace-ready` after hydration settles.
- `src/features/threads/hooks/useThreadActions.test.tsx` verifies first-page startup hydration does not call `listClaudeSessions`, `getOpenCodeSessionList`, `listGeminiSessions`, or `listWorkspaceSessions`.
- `src/app-shell-parts/useAppShellSearchRadarSection.test.tsx` verifies radar visibility schedules the session radar prewarm path.

## Large Workspace

### Before

- A large workspace could enter startup with multi-page runtime scans and native/session catalog merge in the same foreground refresh.
- Complete file tree loading could run when the file panel was hidden.
- Repeated focus events could trigger duplicate thread/git refresh bursts.

### After

```text
milestone shell-ready
milestone input-ready
task thread-list:first-page:ws-large queued phase=active-workspace command=list_threads
task thread-list:first-page:ws-large started phase=active-workspace
command list_threads completed workspace=ws-large
task thread-list:first-page:ws-large completed phase=active-workspace
milestone active-workspace-ready
task model-catalog:ws-large queued phase=active-workspace command=model_list
task thread-list:full-catalog:ws-large queued phase=idle-prewarm command=list_threads
task thread-list:session-radar:ws-large queued phase=idle-prewarm command=list_threads
task thread-list:full-catalog:ws-large started phase=idle-prewarm
command list_threads completed workspace=ws-large
command list_claude_sessions completed workspace=global
command opencode_session_list completed workspace=ws-large
task thread-list:full-catalog:ws-large completed phase=idle-prewarm
```

Evidence:

- `src/features/startup-orchestration/utils/startupOrchestrator.test.ts` verifies idle-prewarm work yields by idle slice instead of draining unbounded work in one burst.
- `src/features/workspaces/hooks/useWorkspaceFiles.test.tsx` verifies hidden file panel startup does not force complete file tree loading.
- `src/features/workspaces/hooks/useWorkspaceRefreshOnFocus.test.tsx` verifies repeated focus events coalesce through the refresh window.

## Conclusion

Heavy startup work moved out of the first-paint path by contract:

- First paint is represented by `shell-ready` and `input-ready`.
- Active workspace readiness waits for a bounded first-page `list_threads` task.
- Native/session catalog merge and session radar prewarm run as `idle-prewarm`.
- File tree and git diff work remain gated by visibility, explicit action, or existing idle/on-demand paths.
