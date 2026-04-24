## Context

`app-shell` 在前面的拆分中已经把搜索/compose 和 sections 编排迁到了 `app-shell-parts`。这让文件行数下降了，但也留下了一批没有立即处理完的 `react-hooks/exhaustive-deps` warning：

- `useAppShellSearchAndComposerSection.ts`: 6 条，全部集中在 search palette setters 和结果选择回调。
- `useAppShellSections.ts`: 3 条，分别落在 kanban panel 打开、home/workspace 切换链以及 recurring scheduler effect。

这些 warning 不是新的功能需求，而是对现有编排正确性的工程约束补强。关键约束有两个：

- 不能因为机械补依赖导致搜索面板或 kanban 调度行为漂移。
- 不能把低风险 setter 补全和高风险 scheduler 逻辑混成一锅无边界清理。

## Goals / Non-Goals

**Goals:**

- 把 `app-shell-parts` 的 9 条 warning 拆成明确批次，而不是一次性无差别补全。
- 优先处理搜索/面板切换这类 setter-only、contract-stable 的 warning。
- 在补 `kanbanCreateTask` 调度依赖时保留现有 recurring new-thread 语义，并用定向测试兜底。

**Non-Goals:**

- 不替换 `ctx: any` 的 context 形态。
- 不做 `app-shell-parts` 的结构重构或 helper 抽取。
- 不覆盖仓库中其他 feature 的 warning。

## Decisions

### Decision 1: 按风险拆成 `P0 search/transition` 和 `P1 scheduler`

- 选项 A：一次性补全两个文件的所有 warning。
- 选项 B：先吃 `search/composer + home/workspace transition`，再单独确认 scheduler effect。

选择 B。

原因：

- `search/composer` 和 `transition` 这批几乎全是 stable setter 依赖，补全后行为面最清晰。
- recurring scheduler effect 会触发 task auto-move / new-thread creation，虽然 warning 只有 1 条，但行为权重大，应该单独看待。

### Decision 2: 只补依赖数组，不做 hook 结构改写

- 选项 A：顺手把 `app-shell-parts` 再拆更细，或者把 setter 打包成 memo helper。
- 选项 B：保持当前结构，只修闭包依赖面。

选择 B。

原因：

- 当前目标是降 warning 噪音，不是再开一轮大文件重构。
- 这些 hook 仍带 `@ts-nocheck`，结构重写会放大改动面和回归成本。

### Decision 3: 用现有 `app-shell` / `kanban` 测试兜底，不新增高成本 integration harness

- 选项 A：只跑 lint/typecheck。
- 选项 B：lint/typecheck + 定向 vitest。

选择 B。

原因：

- 这类 warning 的风险本质在 effect/callback 触发时机，仅静态检查不够。
- 现有测试已经覆盖搜索与 kanban 入口，复用它们比临时搭新 harness 更稳。

## Risks / Trade-offs

- [Scheduler effect 依赖补全后重跑次数增加] → 只补 `kanbanCreateTask` 这一项，不改 effect body，并用定向测试验证 recurring 行为。
- [搜索面板 setter 全补后 identity 变化触发更多 callback 重建] → 这些 setter 来自 stable state contract，补全只影响 lint 和闭包准确性，不改变 outward API。
- [文件仍保留 `@ts-nocheck`，后续可维护性问题未根治] → 本 change 明确聚焦 warning 收敛；类型治理留到后续单独 change。
