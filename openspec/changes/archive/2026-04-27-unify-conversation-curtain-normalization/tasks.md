## 1. Normalization Contract

- [x] 1.1 [P0][Depends:none][Input: `threadReducerTextMerge.ts`、`queuedHandoffBubble.ts`、`threadItems.ts` 现有等价判断][Output: 单一 normalization core API 与 type contract][Verify: 新模块单测覆盖 user/assistant/reasoning 三类等价规则] 提炼共享 conversation normalization core，收口重复的 pure merge / equivalence 逻辑。
- [x] 1.2 [P0][Depends:1.1][Input: 现有 `Codex` duplicate 场景与 history reconcile 行为][Output: 明确的 visible row cardinality invariant 与 helper 注释/测试基线][Verify: 用例覆盖 optimistic/history user、completed replay、reasoning snapshot duplicate] 把“visible row cardinality 不漂移”固化为 normalization 主判据。

## 2. Codex Realtime Integration

- [x] 2.1 [P0][Depends:1.1-1.2][Input: `useThreadsReducer.ts` 当前 optimistic user reconcile 路径][Output: reducer 改为调用 normalization core 进行 authoritative replacement][Verify: `useThreadsReducer.test.ts` 相关 optimistic user/handoff 用例通过] 收口 user bubble 的 optimistic / handoff / authoritative merge 规则。
- [x] 2.2 [P0][Depends:1.1-1.2][Input: `threadReducerTextMerge.ts` 当前 completed merge 逻辑][Output: assistant completed settlement 接入 normalization core][Verify: completed duplicate / prefix replay / short greeting 回归测试通过] 收口 assistant completed replay 与近似重复正文折叠。
- [x] 2.3 [P1][Depends:1.1-1.2][Input: `useThreadsReducer.ts` / `threadItems.ts` 当前 reasoning duplicate 逻辑][Output: reasoning snapshot duplicate collapse 统一到 normalization core][Verify: reasoning snapshot 重建与 realtime upsert 共用同一判断规则] 收口 reasoning snapshot 的重复判断口径。

## 3. Codex History Hydrate Integration

- [x] 3.1 [P0][Depends:2.1-2.3][Input: `codexHistoryLoader.ts` 与 `resumeThreadForWorkspace` 的 history hydrate 输出][Output: history hydrate 走同一 normalization/canonicalization 规则][Verify: `historyLoaders.test.ts` 与 reopen 相关测试通过，等价 user/assistant 不重复出现] 让 `Codex` history hydrate 与 realtime settlement 使用同一 merge contract。
- [x] 3.2 [P0][Depends:3.1][Input: `useThreads.ts` 中 `scheduleCodexRealtimeHistoryReconcile()` 行为][Output: reconcile 保留但只做 validation/backfill 的测试与行为护栏][Verify: 等价 history replay 不改变 visible row 数；缺失 structured fact 仍可被补齐] 将 post-turn history reconcile 降级为兜底路径而不是 primary duplicate repair。

## 4. Verification

- [x] 4.1 [P0][Depends:2.1-3.2][Input: `useThreadsReducer.test.ts`、`useThreads.memory-race.integration.test.tsx`、`historyLoaders.test.ts`][Output: 覆盖 Codex realtime/history convergence 的回归矩阵][Verify: duplicate chunk、completed replay、queued handoff、history hydrate 四类场景均有自动化覆盖] 补齐 normalization 重构后的核心测试矩阵。
- [x] 4.2 [P0][Depends:4.1][Input: 前端受影响模块与现有质量门禁][Output: lint/typecheck/test 通过，必要时补 targeted 命令记录][Verify: `npm run lint && npm run typecheck && npm run test` 通过] 完成最小实现门禁验证并记录剩余风险。
