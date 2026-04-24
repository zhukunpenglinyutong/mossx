## Why

`ButtonArea` 和 `useSessionRadarFeed` 当前都依赖“版本号/时间 tick state 只放进依赖数组、不直接参与计算”的 sentinel 模式来触发重算。这能工作，但会持续触发 `react-hooks/exhaustive-deps` warning，也会让后续维护者误判为“可以机械删掉的多余依赖”。

## 目标与边界

- 把这两处 sentinel warning 从“隐式重算触发器”改成“显式 snapshot/clock 驱动”。
- 保持现有用户可见行为不变：
  - 自定义模型变更后，`ButtonArea` 里的模型列表仍会即时刷新
  - Session radar 在无外部 rerender 时仍会持续更新时间/历史快照
- 用定向测试锁住这两类行为，避免后续再次退回 sentinel 依赖模式。

## 非目标

- 不顺手处理 `git-history`、`threads`、`app-shell` 等其它高风险 `exhaustive-deps` warning。
- 不引入全局 store 框架或统一 external-store 基础设施。
- 不修改模型来源、session radar 合并策略、或任何用户可见文案。

## What Changes

- 为 `ButtonArea` 引入显式的 storage snapshot 读取与订阅更新逻辑，替代 `customModelsVersion` sentinel。
- 为 `useSessionRadarFeed` 引入显式的 `clock/history snapshot` 驱动，替代 `durationRefreshTick` / `historyMutationVersion` sentinel。
- 新增或扩展定向测试，覆盖：
  - same-tab `localStorageChange` 后模型列表刷新
  - radar history event 后 recent feed 重新合并
  - running duration 在无外部 rerender 时仍随时间刷新

## Capabilities

### New Capabilities

- `exhaustive-deps-sentinel-pattern-stability`: 约束 sentinel-style re-render trigger 必须收敛为显式 snapshot/clock 驱动，而不是依赖数组哨兵。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src/features/composer/components/ChatInputBox/ButtonArea.tsx`
  - `src/features/session-activity/hooks/useSessionRadarFeed.ts`
  - related test files for the two modules
- Systems:
  - frontend hook stability
  - localStorage-driven model refresh
  - session radar refresh cadence
- Validation:
  - `npm run lint`
  - `npm run typecheck`
  - direct `npx vitest run ...` for touched tests

## 验收标准

- `ButtonArea` 不再使用 `customModelsVersion` 作为仅存在于依赖数组中的重算哨兵。
- `useSessionRadarFeed` 不再使用 `durationRefreshTick` / `historyMutationVersion` 作为仅存在于依赖数组中的重算哨兵。
- 两处用户行为保持不变，并有定向测试覆盖。
- 本 change 完成后，这 3 条 sentinel warning 从 lint 输出中消失。
