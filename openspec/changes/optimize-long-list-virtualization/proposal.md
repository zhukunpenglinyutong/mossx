## Why

`add-runtime-perf-baseline` 已经产出 v0.4.18 的长会话渲染基线。当前 `S-LL-*`
行显示长列表场景存在可量化的 commit 成本：

- `S-LL-200`：`commitDurationP95 = 59.26ms`
- `S-LL-500`：`commitDurationP95 = 39.73ms`
- `S-LL-1000`：`commitDurationP95 = 20.76ms`
- `S-LL-1000`：`scrollFrameDropPct = 0%`，但备注为 `jsdom proxy; browser scroll gate is follow-up`

这些数据说明下一步不该继续盲目 memo 化，而应把长会话渲染优化收口成一个可验证的
virtualization change：在真实浏览器 scroll gate 里证明长列表渲染不会随消息数量线性扩大。

## Scope

### In Scope

- 为 messages/thread 长列表引入或完善 virtualization 策略。
- 复用仓库已存在的 `@tanstack/react-virtual` 能力，避免自研虚拟滚动。
- 使用 `docs/perf/history/v0.4.18-baseline.md` 的 `S-LL-*` 行作为优化前对照。
- 为 200 / 500 / 1000 条消息场景补浏览器级 scroll verification。

### Out of Scope

- 不改 realtime event batching。
- 不拆分 Composer 或 app-server event hub。
- 不调整 bundle chunking。

## Acceptance Criteria

- `S-LL-1000` 的 browser scroll gate 必须从 jsdom proxy 升级为真实浏览器验证。
- `S-LL-1000` 的 commit / scroll 指标不得高于 v0.4.18 baseline。
- 长列表首屏与滚动位置恢复必须保持现有用户语义。
- 必须运行 `npm run perf:long-list:baseline` 并更新 `docs/perf/baseline.{md,json}`。
