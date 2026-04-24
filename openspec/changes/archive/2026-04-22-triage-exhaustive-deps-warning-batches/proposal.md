## Why

当前仓库存在 `109` 条 `react-hooks/exhaustive-deps` warning，分布在 `25` 个 frontend 文件中。程序现在仍可用，但这些 warning 正在掩盖真正的 effect/callback 闭包风险，也让后续重构很难区分“历史噪音”和“新引入回归”。

## 目标与边界

- 把当前 `109` 条 warning 按“风险 + 模块关键度 + 修复形态”拆成两张表：`值得马上处理` 与 `可以先不动`。
- 只把低风险、可机械验证、不会改动主链副作用时机的 warning 送入第一批可执行排期。
- 为后续 `app-shell`、`threads`、`git-history` 热点 warning 设定延期门槛，避免机械补依赖把主链行为改坏。

## 非目标

- 不在本 change 中一次性清零全仓 `react-hooks/exhaustive-deps` warning。
- 不对 `git-history`、`threads`、`app-shell` 主链热点做无设计前置的机械修复。
- 不通过 `eslint-disable`、降级规则或关闭 lint 来“消灭” warning。

## 方案对比

### 方案 A：全仓一次性清零

- 优点：数字下降最快，lint 噪音一次性变少。
- 缺点：会把高风险 orchestration hook 和低风险 leaf 组件混在一起，极易引入 effect 重跑、重复订阅、stale closure 回归。

### 方案 B：按风险分桶，分批治理

- 优点：先清理低风险、收益明确的 warning，保住主链稳定性；每一批都能做定向验证和回滚。
- 缺点：warning 总量不会立刻归零，需要持续治理。

### 方案 C：保留现状，只在改到文件时顺手处理

- 优点：短期投入最低。
- 缺点：warning 会继续淹没真实问题，热点文件会在未来重构中持续扩大闭包时序风险。

**结论**：选择方案 B。仓库目前最缺的不是“零 warning”，而是“可执行、可回归、可持续的 warning 治理节奏”。

## What Changes

- 新增一套 `exhaustive-deps` warning triage 规则，按模块关键度、warning 形态、验证边界做分桶。
- 固化两张盘点表，覆盖当前 `109` 条 warning。
- 把 `11` 条低风险 warning 列为第一批 `P0` 可执行治理项，并拆成两个可在单次会话内完成的子批次。
- 把剩余 `98` 条 warning 标记为 deferred，仅在完成专门设计或热点拆分后再进入修复。

## 值得马上处理

| 文件 | Warning 数 | 修复形态 | 理由 | 批次 |
|---|---:|---|---|---|
| `src/features/opencode/components/OpenCodeControlPanel.tsx` | 2 | 稳定化 `inferModelProvider` | 本地函数 identity 稳定化，边界清晰 | P0-A |
| `src/features/settings/components/settings-view/sections/WebServiceSettings.tsx` | 2 | `useCallback` 补 `t` | i18n callback 闭包修正，影响面局部 | P0-B |
| `src/features/files/components/FileViewPanel.tsx` | 1 | `useMemo` 去掉多余依赖 | 纯 memo 噪音，机械修复 | P0-A |
| `src/features/git/components/GitDiffPanel.tsx` | 1 | `useMemo` 补 `t` | 文本 derive 闭包补齐，边界清晰 | P0-A |
| `src/features/messages/components/toolBlocks/ReadToolBlock.tsx` | 1 | `useMemo` 补 `outputKeys` | 纯 derive，易验证 | P0-A |
| `src/features/project-memory/components/ProjectMemoryPanel.tsx` | 1 | `useEffect` 补 `closeManager` | 局部 panel cleanup 逻辑，回归面可控 | P0-B |
| `src/features/search/components/SearchPalette.tsx` | 1 | `visibleResults` 提前 `useMemo` | 避免条件表达式导致依赖漂移 | P0-A |
| `src/features/settings/components/settings-view/hooks/useSystemResolvedTheme.ts` | 1 | `useEffect` 补状态依赖 | 本地 theme 同步 effect，验证简单 | P0-B |
| `src/features/spec/hooks/useSpecHub.ts` | 1 | `useCallback` 去掉多余依赖 | 纯 callback 依赖收敛，不改主链 | P0-A |

**合计**：`11` 条 warning，`9` 个文件。

## 可以先不动

| 文件 | Warning 数 | 暂缓原因 | 进入修复前提 |
|---|---:|---|---|
| `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx` | 70 | 热点文件、warning 密度过高，极易出现 effect/callback 连锁重跑 | 先单独做 design review 或再次模块化 |
| `src/app-shell-parts/useAppShellSearchAndComposerSection.ts` | 6 | `app-shell` orchestration 刚拆分完成，不适合立刻机械补 setter 依赖 | 先补稳定 contract 分析 |
| `src/features/threads/hooks/useThreadActions.ts` | 5 | `threads` 主链 hook，包含 runtime/session 生命周期 | 先做 thread hotpath 专项批次 |
| `src/app-shell-parts/useAppShellSections.ts` | 3 | 中枢级 orchestration，effect 改动会影响多面板联动 | 先做 app-shell 批次设计 |
| `src/features/session-activity/hooks/useSessionRadarFeed.ts` | 2 | `durationRefreshTick` / `historyMutationVersion` 是重算哨兵，不能按“多余依赖”机械删除 | 先设计 sentinel-to-external-store 策略 |
| `src/features/threads/hooks/useThreadItemEvents.ts` | 2 | realtime/event flush 主链，race 风险较高 | 先补事件时序验证 |
| `src/features/composer/components/ChatInputBox/ButtonArea.tsx` | 1 | `customModelsVersion` 是 `localStorage` 变更触发器，去掉会丢失模型列表重算语义 | 先设计 persisted-model snapshot 策略 |
| `src/features/files/components/FileTreePanel.tsx` | 1 | 依赖父层 `onInsertText` 稳定性，可能上卷到父组件 contract | 先确认上游 callback 是否需要稳定化 |
| `src/features/files/hooks/useDetachedFileExplorerState.ts` | 1 | effect 依赖本地 helper，需先确认 helper identity 策略 | 先做 detached explorer 小批次 |
| `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx` | 1 | ref cleanup 警告属于时序细节，适合与 git-history 热点一起处理 | 并入 git-history 专项 |
| `src/features/kanban/components/TaskCreateModal.tsx` | 1 | effect 缺依赖较多，可能改动初始化时机 | 先确认表单初始化语义 |
| `src/features/layout/hooks/useLayoutNodes.tsx` | 1 | 布局状态 derive 涉及 thread status，容易引出级联刷新 | 先并入 layout/perf 批次 |
| `src/features/threads/hooks/useQueuedSend.ts` | 1 | 发送主链，active thread 闭包变更要谨慎 | 先并入 threads 批次 |
| `src/features/threads/hooks/useThreadActionsSessionRuntime.ts` | 1 | `useCallback` 依赖未知，需先改函数边界 | 先做 runtime 封装分析 |
| `src/features/threads/hooks/useThreadTurnEvents.ts` | 1 | debug callback 来自上层，可能需要父级 contract 调整 | 先确认 debug handler 稳定性 |
| `src/features/workspaces/components/WorktreePrompt.tsx` | 1 | effect 依赖集合值，可能触发不必要重跑 | 先做 workspace prompt 批次 |

**合计**：`98` 条 warning，`16` 个文件。

## Capabilities

### New Capabilities

- `exhaustive-deps-warning-governance`: 定义仓库如何对 `react-hooks/exhaustive-deps` warning 做分桶、延期和批次执行。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src/features/opencode/components/OpenCodeControlPanel.tsx`
  - `src/features/settings/components/settings-view/sections/WebServiceSettings.tsx`
  - `src/features/files/components/FileViewPanel.tsx`
  - `src/features/git/components/GitDiffPanel.tsx`
  - `src/features/messages/components/toolBlocks/ReadToolBlock.tsx`
  - `src/features/project-memory/components/ProjectMemoryPanel.tsx`
  - `src/features/search/components/SearchPalette.tsx`
  - `src/features/settings/components/settings-view/hooks/useSystemResolvedTheme.ts`
  - `src/features/spec/hooks/useSpecHub.ts`
- Systems:
  - Frontend lint governance
  - React effect/callback stability
  - Trellis / OpenSpec execution planning
- Validation:
  - `npm run lint`
  - `npm run typecheck`
  - 针对受影响模块补充定向 `vitest`，不使用仓库 batched wrapper 作为局部验收

## 验收标准

- proposal 中两张表覆盖全部 `109` 条 warning，且总数可回算。
- `P0` 批次只包含低风险、可机械验证的 `11` 条 warning。
- `git-history`、`threads`、`app-shell` 热点 warning 均被明确延期，不允许在本批次偷带修复。
- `ButtonArea` 与 `useSessionRadarFeed` 的 sentinel warning 被明确延期，不允许按“多余依赖”机械修复。
- tasks 可直接进入 apply 阶段，不需要再补提案信息。
