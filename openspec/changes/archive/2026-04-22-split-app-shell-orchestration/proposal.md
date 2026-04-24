## Why

`src/app-shell.tsx` 当前约 `2950` 行，已经进入 `bridge-runtime-critical` policy 的 hard-debt 区间。  
它不是单纯的“大组件”，而是把 workspace projection、global search、session radar、prompt actions、layout orchestration 长时间堆在一个入口里，导致：

- 任何 UI 主链改动都容易扩大 diff 面积
- `AppShell` 成为 merge hotspot
- 低风险 orchestration 调整被迫与高风险主布局共享同一冲突面

因此需要先做一轮兼容性拆分，把可独立迁移的 orchestration 抽到 `app-shell-parts`。

## 目标与边界

- 目标：
  - 抽离 `workspace/search/radar/activity` orchestration 到独立 hook。
  - 抽离 `prompt actions` handlers 到独立 hook。
  - 保持 `AppShell` 对外行为、`appShellContext` 字段名和 layout/render contract 稳定。
  - 让 `src/app-shell.tsx` 重新低于当前 large-file hard gate。
- 边界：
  - 不改变 `renderAppShell`、`useAppShellSections`、`useAppShellLayoutNodesSection` 的消费方式。
  - 不修改 runtime command、workspace storage、notification payload。
  - 不顺手重写 `threads` 或 `tauri service` 相关主链。

## Non-Goals

- 不做 `AppShell` 全量重构。
- 不调整页面布局或用户交互。
- 不引入新的 shared abstraction framework。

## What Changes

- 新增 `src/app-shell-parts` orchestration hooks。
- 将 `src/app-shell.tsx` 中 `workspace/search/radar/activity` 和 `prompt actions` 的实现移动到新 hook。
- 保持顶层 `AppShell` 中的数据注入字段不变，只替换实现来源。
- 通过 typecheck 与 large-file gate 验证拆分没有破坏 contract。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `shell-orchestration-hardening`: 增补 `AppShell` orchestration modularization 的兼容性要求，确保提取 hook 后上下文字段和布局行为保持稳定。

## Acceptance Criteria

- 现有 `app-shell-parts` 与 `renderAppShell` 不需要迁移到新的上下文字段名。
- `src/app-shell.tsx` 低于当前 P0 hard gate。
- `npm run typecheck` 与 `npm run check:large-files:gate` 通过。

## Impact

- Affected code:
  - `src/app-shell.tsx`
  - `src/app-shell-parts/*.ts*`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
