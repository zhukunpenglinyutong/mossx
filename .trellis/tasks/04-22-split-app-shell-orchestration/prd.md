# Split app shell orchestration into submodule hooks

## Goal
在不改变 `AppShell` 对外行为、layout contract 和下游上下文字段名的前提下，把 `src/app-shell.tsx` 中高密度 orchestration 段落抽到 `app-shell-parts` 独立 hook，先把文件压回 large-file hard gate 以下。

## Requirements
- 抽离 `workspace/search/radar/activity` 相关 orchestration 到独立 hook。
- 抽离 `prompt actions` 相关 handlers 到独立 hook。
- 保持 `appShellContext` 暴露的字段名、基础数据结构和 render 行为不变。
- 不修改 runtime command 名、Tauri payload、i18n key 和现有 feature import surface。
- 抽分后 `src/app-shell.tsx` 需要低于当前 `bridge-runtime-critical` policy 的 fail threshold。

## Acceptance Criteria
- [ ] 新增 `src/app-shell-parts` hook 文件承载上述两块 orchestration。
- [ ] `src/app-shell.tsx` 行数降到 `2600` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `src/app-shell.tsx` 不再属于 retained hard debt。

## Technical Notes
- OpenSpec change: `split-app-shell-orchestration`
- 本轮只做 façade-style extraction，不重写 `renderAppShell` / `useAppShellSections` / `useAppShellLayoutNodesSection` 的调用模式。
