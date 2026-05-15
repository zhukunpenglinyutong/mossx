## Context

当前 realtime turn 的可见输出和 lifecycle settlement 分属两条链路：

- assistant text / `item/completed` 可以让最终回答先显示出来；
- `turn/completed` 才会进入 `onTurnCompleted`，最终清理 `isProcessing` 与 `activeTurnId`。

偶发“最终回答已显示但 composer 仍正在生成”说明 output path 已成功，terminal settlement path 没有完成。已确认 composer 的关键 loading state 来自 canonical `threadStatusById[activeThreadId].isProcessing`，不是近期 background render gating 的 deferred snapshot。

风险集中在三个竞态窗口：

- `turn/completed` 未到达 frontend。
- `turn/completed` 到达但 `turnId` 与当前 `activeTurnId` 不匹配，被 guard 拒绝。
- pending thread 与 finalized/canonical thread alias 分裂，最终文本和 processing state 落在不同 thread identity。

## Goals / Non-Goals

**Goals:**

- 让 terminal settlement 的每次接收、拒绝、成功都有结构化证据。
- 对 canonical/pending alias 的 completion settlement 做统一清算。
- 在 final assistant completion 已经出现且没有 newer active turn 时，有界清除 pseudo-processing residue。
- 用测试覆盖偶发极端态，而不是只验证正常路径。

**Non-Goals:**

- 不把所有 `item/completed` 直接升级为 turn terminal。
- 不绕过 runtime/backend 的 terminal event contract。
- 不扩大 background render scheduling 的职责。
- 不重构 conversation state store。

## Decisions

### Decision 1: settlement audit 先于行为 fallback

`turn/completed` 进入前端后，settlement path 必须记录：

- `workspaceId`
- requested `threadId`
- `turnId`
- resolved `aliasThreadId`
- requested/alias `activeTurnId`
- requested/alias `isProcessing`
- result: `settled` / `rejected` / `fallback-settled`
- rejection reason: `turn-mismatch` / `missing-thread` / `newer-turn-active`

替代方案：只在卡住时人工看 React state。该方案无法复现偶发态，也无法区分“未收到信号”和“收到但被拒绝”，拒绝。

### Decision 2: terminal settlement 必须 alias-aware

当 `turn/completed` 归属于 finalized/canonical thread，但 pending alias 仍保持相同 active turn，settlement 必须清理两侧状态；反过来，如果 terminal event 先打到 pending thread，也应解析 canonical 目标后安全清算。

替代方案：只清 event 携带的 threadId。该方案在 pending->canonical rebind 的竞态里会残留另一侧 `isProcessing`，拒绝。

### Decision 3: fallback settlement 只接受 final assistant evidence + no newer turn

fallback 条件必须同时满足：

- 当前 thread 或 alias 已观察到 final assistant completion evidence。
- terminal event 或 deferred completion 可关联到同一 turn，或者当前没有 active turn。
- 目标 thread 不存在不同于 terminal turn 的 newer active turn。

如果 newer active turn 存在，必须拒绝 fallback 并记录 audit，避免误清真实运行中的新任务。

替代方案：只要 final text 可见就清 processing。该方案会破坏 tool/subagent/newer turn 生命周期，拒绝。

### Decision 4: tests 先锁极端事件序列

测试要覆盖：

- `turn/completed` mismatch 被拒绝时会留下 audit。
- canonical event + pending alias active turn 能清两边。
- final assistant evidence 后 deferred/fallback settlement 能清 pseudo-processing。
- newer active turn 存在时 fallback 不清。

## Risks / Trade-offs

- [Risk] fallback 过宽导致误清仍在运行的 turn。→ Mitigation: 强制 newer active turn guard，并在测试中覆盖。
- [Risk] audit 噪音过大。→ Mitigation: 只在 terminal settlement result/rejection 上记录，不对每个 delta 打日志。
- [Risk] alias resolution 不完整。→ Mitigation: 优先复用现有 pending/canonical resolver，不新增平行 identity 系统。
- [Risk] 修改 settlement 影响 completion email/history reconcile。→ Mitigation: 只有真正 handled 的 terminal settlement 才触发 external completion side effects。

## Migration Plan

1. 增加 focused tests 复现 settlement race。
2. 增加 settlement audit helper 与 debug event。
3. 补强 alias-aware terminal settlement。
4. 增加 guarded fallback settlement。
5. 跑 focused Vitest 与 OpenSpec strict validation。

Rollback:

- 可回退到仅 audit 模式：保留诊断，关闭 fallback settlement。
- 如 settlement 修复引发误清，回滚单个 frontend patch 即可；不涉及数据迁移或 provider/runtime contract 变更。

## Open Questions

- 现场是否存在真正未收到 `turn/completed` 的 backend 转发丢失？本变更会先让证据可见；如果确认未收到，需要后续在 backend event forwarding 补 ack/terminal replay。
