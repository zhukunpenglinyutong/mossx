## Why

`app-shell-parts` 目前仍然承载 `app-shell` 主入口拆分后的搜索面板、composer 跳转和 kanban 调度逻辑。虽然程序当前可用，但这两份 hook 还残留 9 条 `react-hooks/exhaustive-deps` warning，导致后续继续改 `app-shell` 时很难判断哪些依赖缺失是历史噪音，哪些是新的闭包时序风险。

现在处理的原因很直接：仓库剩余 warning 已经收敛到少数热点文件，`app-shell-parts` 是下一个收益最高、且比 `threads` 主链风险更低的治理对象。

## 目标与边界

- 目标：收敛 `useAppShellSearchAndComposerSection.ts` 与 `useAppShellSections.ts` 中剩余的 `react-hooks/exhaustive-deps` warning，并保持搜索面板、home/workspace 切换、kanban 调度行为不回退。
- 边界：本次只处理依赖数组与必要的批次治理文档，不修改用户可见交互、不调整 `app-shell` outward contract、不引入新的 state abstraction。

## 非目标

- 不移除 `@ts-nocheck`。
- 不重写 `app-shell-parts` 的 context 结构。
- 不顺手处理 `threads`、`files` 等其他 feature 的 warning。

## What Changes

- 为 `app-shell-parts` 新建一条独立 OpenSpec change，定义 warning 治理的批次和验收面。
- 收敛 `useAppShellSearchAndComposerSection.ts` 中搜索面板开关、selection、filter 和结果选择回调的缺失依赖。
- 收敛 `useAppShellSections.ts` 中 kanban panel 打开、home/workspace 切换以及 kanban scheduler effect 的缺失依赖。
- 用 `lint`、`typecheck` 与定向 `app-shell` / `kanban` 测试验证行为未漂移。

## Capabilities

### New Capabilities

- `app-shell-exhaustive-deps-stability`: 约束 `app-shell-parts` 中搜索/kanban 编排 hook 的依赖数组治理必须分批执行，并保持原有 UI 行为和调度语义。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src/app-shell-parts/useAppShellSearchAndComposerSection.ts`
  - `src/app-shell-parts/useAppShellSections.ts`
- Affected workflow:
  - `openspec/changes/stabilize-app-shell-parts-exhaustive-deps-hotspot/**`
  - `.trellis/tasks/04-23-stabilize-app-shell-parts-exhaustive-deps-hotspot/prd.md`
- Validation:
  - `npm run lint`
  - `npm run typecheck`
  - 定向 `vitest` 覆盖搜索面板/kanban 入口与 scheduler 相关测试

## Acceptance Criteria

- `app-shell-parts` 两个热点文件的 `react-hooks/exhaustive-deps` warning 清零。
- 搜索面板开关、selection reset、filter toggle 和搜索结果打开行为保持不变。
- home/workspace/kanban 切换行为保持不变，scheduler effect 不出现重复创建任务或状态倒退。
- `npm run lint` 与 `npm run typecheck` 通过，且定向测试覆盖搜索与 kanban 主链。
