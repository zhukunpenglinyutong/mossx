## Context

`threads` 域目前还残留 10 条 `react-hooks/exhaustive-deps` warning，分布在 5 个 hook：

- `useQueuedSend.ts`: 1 条普通缺依赖
- `useThreadActions.ts`: 1 条普通缺依赖 + 4 条 `factory callback` 警告
- `useThreadActionsSessionRuntime.ts`: 1 条 `factory callback` 警告
- `useThreadItemEvents.ts`: 2 条普通缺依赖
- `useThreadTurnEvents.ts`: 1 条普通缺依赖

这批 warning 的一个关键特点是它们并不都属于同一种风险。普通缺依赖直接关系到 stale closure；而 `useCallback(factory(...))` 则更多是 React Hooks lint 对“先创建函数再 memoize”模式的警告。

## Goals / Non-Goals

**Goals:**

- 把 `threads` warning 按风险拆成 `P0 missing deps` 和 `P1 factory callback stabilization`。
- 通过最小代码形态变更把 10 条 warning 全部收掉。
- 用现有 `threads` 测试覆盖发送、resume 和 event handling 主链。

**Non-Goals:**

- 不在本 change 中改 reducer 结构或共享状态模型。
- 不重写 `sessionActions` helper 的内部实现。
- 不扩展到 `threads` 以外的 feature。

## Decisions

### Decision 1: `P0` 和 `P1` 同一 change 内分批执行

- 选项 A：把 10 条 warning 一次性视为同质问题。
- 选项 B：把普通缺依赖和 `factory callback` 警告分成两个批次。

选择 B。

原因：

- 普通缺依赖是闭包正确性问题，应先明确收口。
- `factory callback` 警告并不是业务逻辑错误，更适合通过统一模式替换消除。

### Decision 2: 用 `useMemo(() => factory(...), deps)` 替换 `useCallback(factory(...), deps)`

- 选项 A：保留 `useCallback(factory(...), deps)` 并忽略 lint。
- 选项 B：把 factory 生成的回调改成 `useMemo` 返回稳定函数。
- 选项 C：把所有 factory 回调内联重写。

选择 B。

原因：

- `useMemo(() => factory(...), deps)` 与当前语义最接近，只改变 memoization 形式。
- 相比内联重写，改动面小，不会把 session action helper 的逻辑复制回调用点。

### Decision 3: 复用现有 `threads` hook tests

- 选项 A：只跑 lint/typecheck。
- 选项 B：lint/typecheck + `threads` 定向 hook tests。

选择 B。

原因：

- 这批 warning 紧贴发送和事件流，必须通过测试确认时序没有漂。
- 仓库已经有足够多的 `threads` hook tests，不需要再新建 harness。

## Risks / Trade-offs

- [补入普通依赖后 callback/effect 重建次数增加] → 只补被实际引用的依赖，并用定向测试覆盖发送和事件主链。
- [`useMemo` 替换 `useCallback(factory(...))` 误改函数稳定性] → 只替换 factory-returning callbacks；helper 本身不改，确保返回的仍是 stable function reference。
- [`threadActivityRef` / `onDebug` 这类 ref/debug 依赖引发额外 effect 运行] → 这些值本来就在闭包中被引用，补全后比静默 stale 更正确，且不改变 outward contract。
