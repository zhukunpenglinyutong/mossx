## Context

`#424` 暴露的 `Claude Code` 回归并不是单点渲染问题，而是一次典型的 cross-cutting continuity drift。当前前端已经具备几块各自正确、但没有被统一收口的能力：

- `threadAliases` 已经支持持久化 alias chain 压平与 canonical resolve。
- `renameThreadId` 在 pending->finalized 成功时会迁移 `activeThreadId`、`items`、`status`、`userInputRequests`。
- `useThreadTurnEvents` 已经尝试把 `claude-pending-*` 收敛到 `claude:<sessionId>`。
- `useThreadActions` 能在部分 stale-thread 场景下通过 `rememberThreadAlias` 恢复 replacement thread。

真正的问题在于，这些能力没有形成一个统一的 `Claude thread/session continuity` contract。`setActiveThreadId` 仍把异步 resume 当成“针对当前 id 的局部刷新”；approval / `requestUserInput` 事件仍可能先清掉旧 thread 的 processing，再让真实 continuation 跑到另一个 thread；`Claude` history reopen 仍是独立 JSONL load path，缺少 “readable-until-truth-resolves” 语义。

因此本 design 不新增新的后端账本，也不重做 sidebar/session store，而是把现有 alias、pending anchor、history reopen、approval continue 统一到一条 canonical identity 流里。

## Goals / Non-Goals

**Goals:**

- 让 `Claude` 的 pending->finalized、approval continue、`requestUserInput` submit、history reopen 共享同一条 canonical thread identity。
- 避免用户在一次连续任务中看到 duplicate pending thread、ghost replacement conversation 或“先出现历史再消失”的空白回退。
- 最大化复用现有 `threadAliases`、`renameThreadId`、`requestUserInput` / approval contract，避免引入新的 storage schema。
- 在证据不足时进入明确的 reconcile / failure，而不是 settle 成 false loaded success。

**Non-Goals:**

- 不把 `Claude` 问题继续并回 generic blanking / stream visibility / markdown rendering change。
- 不采用启发式“猜最近 session”自动误绑。
- 不为 `Claude` 单独设计新的 approval UI、history sidebar UI 或后端 session ledger。
- 不改变 `Codex`、`Gemini`、`OpenCode` 的现有 lifecycle contract。

## Decisions

### Decision 1: Reuse persisted `threadAliases` as the single continuity ledger

选择：继续复用 `useThreadStorage` / `threadStorage` 里的 `threadAliases` 作为唯一 canonical mapping 事实源，而不是新建 `Claude` 专属 ledger。

原因：

- 现有 alias map 已具备持久化、链式压平、canonical resolve 能力。
- `Codex` stale-thread recovery 已验证这条路径可行。
- `Claude` 当前缺的不是存储能力，而是“哪些链路会写 alias、哪些链路会先 canonicalize”。

备选方案：

- 新增后端 session mapping 表：准确，但明显超出本次范围。
- 仅靠内存 pending anchor：能修一部分 live 问题，但 reopen / sidebar 仍会漂。

结论：沿用现有 alias map，只补 `Claude` 写入与消费边界。

### Decision 2: Canonicalize before every Claude lifecycle mutation, not only on reopen failure

选择：对以下 `Claude` 消费者统一执行 canonical resolve：

- active thread selection / lazy resume
- approval event arrival / decision submit
- `requestUserInput` event arrival / submit
- turn completion / error / stalled settlement
- history reopen / native session load

原因：

- 现在的问题不是“某次 reopen 失败后没有恢复”，而是多个消费者各自用不同 id 改状态。
- 如果只在 `thread not found` 后补救，旧 thread 仍会先被错误标记为 `processing=false` 或 `loaded=true`。

备选方案：

- 只修 `setActiveThreadId`：历史消失会改善，但 approval / submit 仍会分叉。
- 只修 `onThreadSessionIdUpdated`：pending->finalized 会好一点，但 reopen 与 late reconcile 仍会空白。

结论：把 canonicalization 前移到状态写入前，而不是错误之后。

### Decision 3: Async resume / reopen must be allowed to move loading ownership to a recovered canonical thread

选择：`setActiveThreadId` 触发的 lazy resume 不能只 `void resumeThreadForWorkspace(...)` 然后在原 id 上关 loading；必须消费返回的 `threadId | null`，并在 target 变化时同步切换 active selection 与 loading owner。

原因：

- 当前 `Claude` / `Codex` 都已经允许 `resumeThreadForWorkspace` 返回 replacement thread。
- 但 `setActiveThreadId` 仍把 loading state 绑定在选中时的旧 id 上，导致“旧历史闪一下 -> loading 结束 -> surface 被空 state 覆盖”。

备选方案：

- 继续沿用 fire-and-forget resume：实现简单，但本次问题不会真正收敛。

结论：resume 结果成为 lifecycle input，而不是副作用。

### Decision 4: Duplicate pending thread is treated as continuity failure, not a valid user-visible replacement surface

选择：如果 `Claude` session-id update 无法安全匹配到 active pending lineage，系统不能把新 thread 当作“自动切过去的正确会话”；应该保留当前 surface，并进入 reconcile / failure diagnostics。

原因：

- `#424` 的最大伤害不是报错，而是“系统悄悄换了一个用户点不动、又会自行消失的 thread”。
- 这种 silent replacement 会让原 thread 的 approval / history / completion 全部失真。

备选方案：

- 一旦看到新的 `claude:<sessionId>` 就直接切过去：最危险，容易误绑。
- 完全忽略新 thread：会导致 continuation 丢失。

结论：只在 lineage 可验证时迁移；不可验证时显式失败，不制造 ghost truth。

### Decision 5: Claude history reopen follows a readable-first reconcile model

选择：当 `Claude` history reopen 已经有可读 items 时，late native truth reconcile 期间必须保持 readable surface；若最终无法确认真值，进入 explicit reconcile / failure，而不是掉进空态。

原因：

- 用户感知最差的不是“还在加载”，而是“已经看到了内容，1 秒后又没了”。
- 这本质上是 false loaded success + empty fallback 的组合。

备选方案：

- 继续用当前空态/无态：会重复 `#424` 的历史消失。
- 完全阻止 history 先显示：减少闪烁，但牺牲已有缓存可读性。

结论：先保 readable，再等 truth；truth 失败则给 explicit state。

### Decision 6: Diagnostics remain minimal and continuity-scoped

选择：本轮只补 continuity-scoped diagnostics，覆盖：

- `session-id update` 的 source / pending anchor / active thread
- approval / `requestUserInput` submit 的 stale->canonical remap
- history reopen 的 stale id / canonical id / late reconcile outcome

原因：

- 当前最缺的是能把三类表象对齐到同一根因。
- 不需要为本 change 引入新的复杂 telemetry system。

备选方案：

- 不补 diagnostics：实现后很难验证是否真的收敛。
- 做全面 telemetry：收益不足，范围过大。

结论：补最小必要诊断链，优先服务回归定位。

## Risks / Trade-offs

- [Risk] canonicalization 过宽会把错误事件绑到无关 thread。
  → Mitigation：只消费已验证 alias、active pending anchor、turn-bound lineage；证据不足则显式失败，不自动替换。

- [Risk] readable-first reopen 可能暂时保留旧内容更久。
  → Mitigation：保留 readable surface 期间显示 explicit reconcile state；truth failure 后必须给出明确 outcome，而不是长期假装成功。

- [Risk] approval / `requestUserInput` 在 remap 后可能暴露更多 reducer 竞态。
  → Mitigation：优先在 reducer 层保留 `renameThreadId` 的 request migration，并为 submit / late event 增补 targeted integration tests。

- [Risk] `Claude` 特殊逻辑继续膨胀成 engine-specific patch pile。
  → Mitigation：把逻辑约束在 continuity helper / lifecycle consumer boundary 内，不把 UI 组件改成到处判 `claude` 特例。

## Migration Plan

1. 先补 continuity helper 与事件/submit canonicalization，不改持久化 schema。
2. 再补 `setActiveThreadId` / history reopen 对 recovered canonical thread 的 loading owner 迁移。
3. 再补 sidebar / readable-surface-safe reconcile 与 ghost-thread suppression。
4. 最后补 diagnostics 与 targeted tests，跑 OpenSpec validate。

回滚策略：

- 若实现引入新竞态，可先回退 `Claude` submit/reopen canonical rewrite，保留现有 `threadAliases` 存储不动。
- `threadAliases` 继续兼容旧值；本 change 不引入新的不可逆数据格式。

## Open Questions

- continuity diagnostics 是否需要一条用户可见 toast，还是先维持 debug-only evidence 即可。
- 对“无法安全配对的 duplicate finalized Claude thread”最终是完全隐藏，还是保留一条显式 degraded entry 供调试查看。
