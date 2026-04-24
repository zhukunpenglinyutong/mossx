## Context

上一轮 `exhaustive-deps` 治理中，`ButtonArea` 和 `useSessionRadarFeed` 被刻意延期。原因不是它们“太复杂”，而是它们依赖了一种隐式模式：通过改变某个 state，让 `useMemo` 因依赖数组变化而重跑，但该 state 本身并不在计算体内被消费。

这种模式短期可用，但有两个问题：

1. lint 会持续报 `unnecessary dependency`
2. 维护者很容易误删依赖，从而静默破坏重算语义

## Goals / Non-Goals

**Goals:**

- 用显式状态/快照替代依赖数组哨兵。
- 让代码意图对阅读者和 lint 都清晰。
- 用最小实现范围完成修复，不扩展到更大的共享抽象。

**Non-Goals:**

- 不在本 change 中推广通用 external-store 框架。
- 不改变 `ButtonArea` 的 provider/model 合并规则。
- 不改变 `useSessionRadarFeed` 的 incremental derivation 算法。

## Decisions

### Decision 1：`ButtonArea` 采用 storage snapshot state，而不是继续使用版本号递增

- **Chosen**：把 `localStorage` 中与模型列表相关的数据读成一个显式 snapshot state；storage/custom event 到来时直接刷新 snapshot。
- **Why**：`availableModels` 的重算依赖会变成“真正使用到的 snapshot 数据”，lint 可理解，阅读者也能看懂刷新来源。
- **Alternative A**：保留 `customModelsVersion`，在 `useMemo` 体内显式读取该变量。
  - Rejected，因为只是消 lint，不解决“意图隐式”的问题。
- **Alternative B**：使用 `useSyncExternalStore` 包装本地模型配置。
  - Rejected，因为当前只有单组件需要，先上简单 snapshot state 更符合 YAGNI。

### Decision 2：`useSessionRadarFeed` 拆成 `clock snapshot` + `history snapshot`

- **Chosen**：
  - 用显式 `clockNow` state 驱动 running duration 刷新
  - 用显式 `historySnapshot` state 驱动 persisted recent / dismissed state 刷新
- **Why**：这两类重算来源不同，混成版本号会继续模糊语义；拆开后每个依赖都有明确来源。
- **Alternative**：继续使用 tick/version state，并在 `useMemo` 体内强行引用。
  - Rejected，因为依然是 sentinel 模式，只是换一种写法自欺欺人。

### Decision 3：测试以行为锁定，而不是只断言 warning 消失

- **Chosen**：补两类行为测试
  - `ButtonArea`：same-tab storage event 后模型列表刷新
  - `useSessionRadarFeed`：history event 触发 recent feed 更新；timer 继续驱动 duration 刷新
- **Why**：sentinel refactor 最大风险不是类型错误，而是“看起来更干净但不再更新”。

## Risks / Trade-offs

- **[Risk] storage snapshot 读取逻辑重复现有 parsing helper** → 复用现有 `getCustom*Models` / mapping helper，避免复制解析逻辑。
- **[Risk] radar clock state 引入额外重渲染** → 仅在存在 running thread 时启动 interval，保持现有 cadence。
- **[Trade-off] 没抽象出通用 external store** → 当前范围更小，但未来若出现第三处同类模式，届时再统一抽象。

## Migration Plan

1. 新建 sentinel-pattern change artifacts。
2. 改造 `ButtonArea` 为显式 storage snapshot。
3. 改造 `useSessionRadarFeed` 为显式 `clock/history snapshot`。
4. 补 ButtonArea 与 radar 的定向测试。
5. 跑 lint/typecheck/targeted vitest，确认 sentinel warning 消失且行为稳定。

## Open Questions

- 如果未来 `ButtonArea` 之外还有第二个组件需要同类模型配置订阅，是否要提升为共享 hook？
- `SESSION_RADAR_HISTORY_UPDATED_EVENT` 后续是否值得统一走 events service，而不是直接监听 `window`？
