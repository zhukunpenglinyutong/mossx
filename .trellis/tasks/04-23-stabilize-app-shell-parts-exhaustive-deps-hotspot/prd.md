# Stabilize app-shell-parts exhaustive deps hotspot

## Goal
把 `useAppShellSearchAndComposerSection.ts` 和 `useAppShellSections.ts` 中剩余的 `react-hooks/exhaustive-deps` warning 分批清掉，先处理 search/transition 的低风险 setter 依赖，再确认 recurring scheduler effect 的依赖补全，同时保持现有搜索、home/workspace 切换和 kanban 调度行为不回退。

## Requirements
- OpenSpec change `stabilize-app-shell-parts-exhaustive-deps-hotspot` 必须包含完整 proposal / design / specs / tasks。
- `P0` 只能覆盖 search palette callbacks/effects 与 `useAppShellSections.ts` 的低风险 transition callbacks。
- `P1` 只允许处理 recurring scheduler effect 的 `kanbanCreateTask` 缺失依赖，不得顺手重写 effect 结构。
- 必须用 `lint`、`typecheck` 和定向 `app-shell` / `kanban` 测试做验收。

## Acceptance Criteria
- [ ] `useAppShellSearchAndComposerSection.ts` 的 6 条 warning 清零。
- [ ] `useAppShellSections.ts` 的 3 条 warning 清零。
- [ ] 搜索面板开关、selection reset、filter toggle、结果打开行为不回退。
- [ ] recurring scheduler effect 在依赖补全后不出现重复创建任务或状态回退。
- [ ] `npm run lint`、`npm run typecheck` 与定向测试通过。

## Technical Notes
- 优先补 stable setter 和 transition setter，不新增 wrapper helper。
- `kanbanCreateTask` effect 的补全只做 dependency remediation，不改 effect body。
- 如果定向测试暴露 recurring 行为漂移，立刻回退到分批提交策略，不把 scheduler 修复和其他 setter 补全混进同一提交。
