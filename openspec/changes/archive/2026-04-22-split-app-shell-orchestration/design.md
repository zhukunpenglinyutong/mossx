## Context

`AppShell` 仍然是 UI 主入口，这个角色本身没有问题。问题在于它同时承担了太多“可抽离但仍安全”的 orchestration：

- workspace projection / thread hydration / activity summary
- global search source construction 与 radar feed side effects
- prompt CRUD / reveal handlers

这些逻辑不直接定义 layout，却让 `src/app-shell.tsx` 的变更面持续膨胀。  
本轮目标不是改变架构角色，而是把低耦合 orchestration 从入口中移走。

## Goals / Non-Goals

**Goals:**
- 保持 `AppShell` 继续作为顶层入口。
- 将 `workspace/search/radar/activity` 编排抽到独立 hook。
- 将 `prompt actions` 抽到独立 hook。
- 保留 `appShellContext` 的字段名与 render 语义。

**Non-Goals:**
- 不重写 `renderAppShell` 或 `useAppShellSections` 的整体 contract。
- 不改 runtime / storage / i18n 行为。
- 不做与本轮降线无关的抽象清理。

## Decisions

### Decision 1: 继续使用 `app-shell-parts` 目录承载 orchestration hook

- Decision: 新逻辑落在 `src/app-shell-parts/`，而不是再造一个新的 `shell/hooks/` 层级。
- Rationale: 当前仓库已经建立了 `app-shell-parts` 作为 `AppShell` 提取层，沿用现有边界可减少迁移噪音。
- Alternative considered:
  - 新建更细分目录：结构更“纯”，但本轮收益不够，反而扩大改动面。

### Decision 2: 保留顶层上下文注入模式

- Decision: `AppShell` 仍然组装 `appShellContext`，新 hook 只负责返回稳定字段。
- Rationale: 这样 `renderAppShell`、`useAppShellSections`、`useAppShellLayoutNodesSection` 可以零语义迁移。
- Alternative considered:
  - 顺手把 context builder 也拆掉：收益更大，但超出本轮安全范围。

### Decision 3: 优先抽“数据投影 + side effects + handlers”，不碰布局骨架

- Decision: 第一轮只迁出 `search/radar/activity` 与 `prompt actions`。
- Rationale: 这两段对 layout 依赖低、对 runtime contract 影响小，适合先降线。
- Alternative considered:
  - 直接拆 `layout node assembly`：减重大，但更容易牵动 UI 回归。

## Risks / Trade-offs

- [Risk] 新 hook 返回字段漏项，导致下游 `ctx` 消费断裂  
  → Mitigation: 保持字段名不变，并通过 typecheck 校验。

- [Risk] effect 迁移后依赖数组漂移，造成 search/radar 行为变化  
  → Mitigation: 迁移时保持原依赖数组与 side effect 次序不变。

- [Trade-off] `AppShell` 仍会保留巨大的 context object  
  → Mitigation: 本轮目标是先低于 hard gate，后续再考虑继续拆 context builder。

## Migration Plan

1. 为本轮 change 补齐 PRD 与 OpenSpec artifacts。
2. 新建 `app-shell-parts` hook 并迁移 `workspace/search/radar/activity` orchestration。
3. 新建 `app-shell-parts` hook 并迁移 `prompt actions` handlers。
4. 更新 `src/app-shell.tsx` 的 imports 与 hook 调用。
5. 跑 typecheck 与 large-file gate，确认 contract 不回退。

Rollback strategy:
- 若出现行为或编译回归，直接回退新增 hook 与 `AppShell` 接线改动，不影响其他 feature。
