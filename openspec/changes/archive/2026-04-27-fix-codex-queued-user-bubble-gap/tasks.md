## 1. Handoff State

- [x] 1.1 [P0][Depends: none][Input: 当前 `useQueuedSend` auto-drain 行为与 queued item 结构][Output: `Codex` queued handoff state 的线程级建模与创建时机][Verify: 类型收敛，无 `any`，auto-drain 摘队列时可同步建立 handoff state] 在 `useQueuedSend` 为 `Codex live -> queued follow-up` 增加 thread-local handoff bubble state。
- [x] 1.2 [P0][Depends: 1.1][Input: handoff state identity、queued payload 字段][Output: 可用于后续去重的 handoff identity / payload 约束][Verify: `text/images/sendOptions` 等必要字段在状态中可用且无降级] 明确 handoff state 与真实 user item 的等价判定字段。

## 2. Timeline Continuity

- [x] 2.1 [P0][Depends: 1.1-1.2][Input: 当前 `Messages` / `MessagesTimeline` 渲染入口][Output: handoff bubble 的幕布可见性接线][Verify: queued follow-up handoff 开始后，最新用户消息在消息区立即可见] 在消息渲染层接入 handoff bubble，填补 queue 移除与真实 user item 到达之间的可见性空窗。
- [x] 2.2 [P0][Depends: 2.1][Input: 当前 `useThreadMessaging` optimistic / history item 收口路径][Output: handoff bubble 与 optimistic / authoritative item 的去重与清理逻辑][Verify: optimistic 与 history 到达后都只保留一份 latest user bubble] 在 `useThreadMessaging` 完成 handoff state 的替换、清理和去重。

## 3. Reconcile Guard

- [x] 3.1 [P0][Depends: 2.1-2.2][Input: 当前 `useThreads` Codex reconcile 调度链路][Output: handoff-aware reconcile guard][Verify: 旧 turn reconcile 与下一轮 queued handoff 并发时，latest user bubble 不消失] 在 `useThreads` 为 `Codex` history reconcile 增加 handoff 未决保护。

## 4. Validation

- [x] 4.1 [P0][Depends: 1.1-3.1][Input: queue auto-drain、thread messaging、Codex reconcile 测试基线][Output: 覆盖 handoff continuity 的 regression tests][Verify: Vitest 覆盖 `auto-drain + reconcile race + dedupe` 组合场景] 补齐 hook / integration tests，锁住用户报告的高概率复现路径。
- [x] 4.2 [P0][Depends: 4.1][Input: 本 change artifacts 与实现范围][Output: 规范与前端门禁记录][Verify: `openspec validate --strict` 通过，相关前端测试通过] 完成 OpenSpec 校验和最小实现门禁记录。
