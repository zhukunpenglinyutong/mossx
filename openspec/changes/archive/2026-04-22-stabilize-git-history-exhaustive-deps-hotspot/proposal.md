## Why

`src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx` 当前承载了仓库剩余 `react-hooks/exhaustive-deps` warning 中最大的一块热点，单文件占 `70/95`。这些 warning 大多集中在 `git-history` 的 branch/create-pr/push/pull/diff orchestration 上，如果继续放任不管，后续每次改动这个 hook 都会同时面临 stale closure 风险、lint 噪音和 review 面过大的问题。

这轮需要把该文件的 warning 从“一个大堆”拆成有风险边界的 remediation batches，先执行低风险、可机械验证的批次，再为高风险 effect/timer/preview 链路建立专门的落地顺序。

## 目标与边界

- 只处理 `useGitHistoryPanelInteractions.tsx` 内的 `react-hooks/exhaustive-deps` warning。
- 先落地低风险批次：稳定 setter、stable service/helper 依赖、branch/create-pr 基础动作。
- 为剩余高风险批次建立明确的 deferred gate、验证命令和排期。

## 非目标

- 本轮不拆分 `useGitHistoryPanelInteractions.tsx` 文件结构。
- 本轮不修改 `git-history` 的 user-visible behavior、文案或 runtime command contract。
- 本轮不顺手清理其它文件中的 `exhaustive-deps` warning。

## What Changes

- 建立 `git-history` 热点 warning 的分批治理方案，按 `P0/P1/P2` 记录 remediation 形状与验证范围。
- 先实现 `P0` 低风险批次，覆盖 fallback/workspace state、branch CRUD、create-pr bootstrap 的 warning。
- 为 create-pr preview、push/pull/sync preview、diff preview、context-menu/resize 这几组中高风险 warning 建立后续任务顺序与 defer gate。

## Capabilities

### New Capabilities
- `git-history-exhaustive-deps-stability`: 约束 `git-history` 大型 orchestration hook 必须以分批治理方式收敛 `exhaustive-deps` warning，并保持 branch/create-pr/push/pull/diff 交互链路行为稳定。

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx`
  - 相关 `git-history` interaction tests（按实际落批次补跑）
- Affected process:
  - `react-hooks/exhaustive-deps` hotspot 将从“单文件一次性清零”改成“按风险分批执行”
- Validation:
  - `npm run lint`
  - `npm run typecheck`
  - `npx vitest run <git-history touched tests>`

## 验收标准

- [ ] `useGitHistoryPanelInteractions.tsx` 的 warning 必须被拆成明确的 remediation batches，并写入 tasks。
- [ ] 首批 `P0` warning 只包含低风险、可机械验证的依赖修复。
- [ ] 首批落地后，lint/typecheck 和定向 `git-history` tests 全部通过。
- [ ] 剩余 warning 必须保留明确的 defer reason 和下一批进入条件。
