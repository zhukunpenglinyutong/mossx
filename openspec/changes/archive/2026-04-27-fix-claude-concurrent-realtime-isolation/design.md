## Context

当前 `Claude` realtime continuity 在单会话场景已经基本可用，但它仍建立在一个隐含前提上：同一 workspace、同一 engine 只有一个 pending session 需要与 finalized session 对账。这个前提体现在两处：

- `resolvePendingThreadIdForSession()` 只返回一个 pending candidate。
- `onThreadSessionIdUpdated()` 在 thread id 不是明确 pending source 时，会退回到单个 resolved pending 或 `activeThreadId` 做保守猜测。

并行 `Claude` 会话会打破这个前提。由于 `thread/started` 的 session update 事件当前只带 `sessionId`，不带 `turnId`，前端无法分辨“这次 session started 对应哪个 pending turn”，于是 live rebind 会暂时串到当前活动 tab 或被错误跳过。等任务完成后，history / canonical reconcile 重新读取真实 session，UI 才被修正。

## Goals / Non-Goals

**Goals**

- 让 `Claude` 并行 pending turns 的 realtime `sessionId update` 有精确锚点。
- 在不改 storage schema 的前提下修复 live rebind 串会话。
- 保留现有 canonical history reconcile 作为兜底，而不是把它变成主修复手段。

**Non-Goals**

- 不重写 `threadAliases` 或 sidebar persistence。
- 不把所有引擎统一迁移到 turn-bound ledger。
- 不扩散到 approval surface 或 message rendering。

## Decisions

### Decision 1: Use `turnId` as the primary concurrent pending isolation key

选择：为 `EngineEvent::SessionStarted` 增加可选 `turnId`，Claude runtime 在 emit session started 时显式透传当前 turn。

原因：

- Claude backend 在发 `SessionStarted` 时已经掌握当前 `turn_id`，只是此前没有透传。
- `turnId` 是并行 pending 场景里比 `activeThreadId` 和“唯一 pending 候选”更精确的绑定键。
- 这属于轻量跨层 contract 增强，不涉及持久化。

### Decision 2: Session-id rebind prefers turn-bound pending thread before fallback heuristics

选择：前端在处理 `onThreadSessionIdUpdated()` 时，先尝试用 `turnId` 匹配 `activeTurnIdByThread[pendingThread]`，只有 turn-bound 匹配失败时才回退到现有 `resolvePendingThreadForSession()`。

原因：

- 并行场景最怕“猜错”；turn-bound 匹配是可验证证据。
- 回退保留现有逻辑，可保持单会话与旧事件源兼容。

### Decision 3: Keep fallback behavior conservative

选择：若 `turnId` 缺失，或者存在多个 pending threads 但没有唯一 turn-bound 匹配，则继续沿用当前保守策略，不新增更激进的 session 猜测。

原因：

- 用户当前最大痛点是误绑，不是“偶尔等 history 修正”。
- 保守 fallback 虽不完美，但比误绑更安全。

### Decision 4: Realtime isolation fix does not replace final canonical reconcile

选择：history / canonical reconcile 继续保留，作为最终 truth convergence；本 change 只减少 realtime 阶段的 crossed surface。

原因：

- 这次根因是 live rebind 锚点不足，不是 final truth contract 全错。
- 分层修复更稳，避免把单次问题扩大成全量 lifecycle 重写。

## Risks / Trade-offs

- [Risk] 新增 `turnId` 字段会触及跨层事件 contract。
  → Mitigation：字段设计为 optional，旧前端或旧测试仍可兼容。

- [Risk] 部分 Claude event path 可能无法提供 `turnId`。
  → Mitigation：仅在可提供时增强精度；缺失时保留现有 fallback。

- [Risk] 未来其他引擎也可能遇到并行 pending 问题。
  → Mitigation：先把 API 设计成通用 optional 字段，但本次只对 Claude 消费。

## Migration Plan

1. 扩展 backend `SessionStarted` 事件，允许包含 optional `turnId`。
2. 前端 `useAppServerEvents` 把 `turnId` 透传给 `onThreadSessionIdUpdated()`。
3. `useThreads` 增加按 `(workspaceId, engine, turnId)` 解析 pending thread 的 helper。
4. `useThreadTurnEvents` 先消费 turn-bound pending，再回退到现有单 pending resolver。
5. 补充并行 Claude regression tests 并跑最小验证。
