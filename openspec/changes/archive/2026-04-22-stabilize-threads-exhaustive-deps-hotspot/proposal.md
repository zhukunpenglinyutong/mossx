## Why

仓库剩余的 `react-hooks/exhaustive-deps` warning 现在主要集中在 `threads` 域。相比叶子组件，这些 warning 直接贴着消息发送、thread resume、item event 和 turn event 主链，继续放着会让后续任何 `threads` 改动都更难判断闭包时序风险。

现在处理的原因是：`git-history` 和 `app-shell-parts` 热点已经收口，`threads` 成为下一个最高价值目标，而且这批 warning 已经可以明确分成“普通缺依赖”和“factory callback lint 模式”两类，具备可控治理边界。

## 目标与边界

- 目标：收敛 `threads` 域 5 个 hook 中剩余的 10 条 `react-hooks/exhaustive-deps` warning，并保持发送、resume、event handling 与 shared-session runtime 行为不回退。
- 边界：本次只处理 dependency remediation 和稳定 callback construction，不改 Tauri contract、不重构 reducer/data flow、不修改用户可见交互。

## 非目标

- 不处理 `files`、`kanban`、`layout` 等其他 feature 的 warning。
- 不重写 `threads` hook 结构或拆分新的文件。
- 不改变 message queue、resume、rewind 的业务语义。

## What Changes

- 为 `threads` warning 新建一条独立 OpenSpec change，定义 `P0 missing deps` 与 `P1 factory callback stabilization` 两批治理边界。
- 补齐 `useQueuedSend.ts`、`useThreadItemEvents.ts`、`useThreadTurnEvents.ts`、`useThreadActions.ts` 中普通缺失依赖。
- 将 `useThreadActions.ts` 与 `useThreadActionsSessionRuntime.ts` 中 `useCallback(factory(...))` 的 lint pattern 改成稳定的 `useMemo(() => factory(...), deps)`。
- 用 `lint`、`typecheck` 和定向 `threads` 测试验证主链行为未漂移。

## Capabilities

### New Capabilities

- `threads-exhaustive-deps-stability`: 约束 `threads` 域 hook 的依赖数组和 factory callback 必须分批治理，并保持发送、resume、event handling 行为兼容。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src/features/threads/hooks/useQueuedSend.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadActionsSessionRuntime.ts`
  - `src/features/threads/hooks/useThreadItemEvents.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
- Affected workflow:
  - `openspec/changes/stabilize-threads-exhaustive-deps-hotspot/**`
  - `.trellis/tasks/04-23-stabilize-threads-exhaustive-deps-hotspot/prd.md`
- Validation:
  - `npm run lint`
  - `npm run typecheck`
  - 定向 `threads` hook tests

## Acceptance Criteria

- 目标 5 个 `threads` hook 的 `react-hooks/exhaustive-deps` warning 清零。
- `send/queue`、`resume`、`item event`、`turn event`、`shared-session start` 行为不回退。
- `factory callback` warnings 被稳定替换，不再依赖 `useCallback(factory(...))` 这种 lint pattern。
- `npm run lint`、`npm run typecheck` 与定向 `threads` 测试通过。
