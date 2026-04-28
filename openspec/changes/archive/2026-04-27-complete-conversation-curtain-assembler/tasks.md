## 1. Assembly Contract

- [x] 1.1 [P0][Depends:none][Input: 现有 `conversationAssembler.ts`、`conversationNormalization.ts`、parity tests][Output: Phase C OpenSpec specs/tasks 对齐][Verify: `openspec validate complete-conversation-curtain-assembler --type change --strict --no-interactive` 通过] 固化 `ConversationAssembler` 作为 realtime/history 共同语义装配边界，并明确 history reconcile 只负责 canonical backfill。

## 2. Assembler Extraction

- [x] 2.1 [P0][Depends:1.1][Input: `src/features/threads/contracts/conversationAssembler.ts` 当前实现][Output: `assembly` 域下的 assembler implementation 与 `contracts` 兼容 re-export][Verify: assembler 相关单测继续通过，现有 import surface 不破坏] 将 assembler implementation 迁移到 `src/features/threads/assembly/`，让 `contracts` 只保留边界与兼容出口。
- [x] 2.2 [P0][Depends:2.1][Input: B 阶段 `conversationNormalization` core][Output: assembler 内部统一复用 user / assistant / reasoning normalization helper][Verify: assistant/reasoning/user 等价判定用例继续通过，无第二套 comparator 残留] 收口 assembler 内部重复 comparator，避免 normalization drift 回流。

## 3. History Hydrate Integration

- [x] 3.1 [P0][Depends:2.1-2.2][Input: `useThreadActions.ts` 当前 history hydrate 路径][Output: history snapshot 先经 `hydrateHistory()` 再写入 reducer][Verify: `historyLoaders.test.ts` 与 reopen/refresh 用例通过，等价 replay 不增加 visible rows] 把 assembler 接到实际 history hydrate 主链路上。
- [x] 3.2 [P0][Depends:3.1][Input: `scheduleCodexRealtimeHistoryReconcile()` 与 `refreshThread()` 当前行为][Output: reconcile 复用 assembled history state，职责收窄为 validation/backfill][Verify: memory-race / queued handoff / reconcile 回归用例通过] 保留 reconcile，但不再让它承担 primary duplicate repair。

## 4. Realtime Boundary Integration

- [x] 4.1 [P1][Depends:2.1-2.2][Input: `NormalizedThreadEvent` adapter 输出与现有 legacy handler 路径][Output: reducer-facing assembly helper 或等效 runtime 边界接入][Verify: parity tests 或新增 reducer-facing tests 证明 normalized input 可装配 canonical items] 为 realtime normalized event 提供可复用 assembly 入口，作为后续替换 legacy handlers 的稳定落点。

## 5. Verification

- [x] 5.1 [P0][Depends:2.1-4.1][Input: `conversationAssembler.test.ts`、`realtimeHistoryParity.test.ts`、`historyLoaders.test.ts`、`useThreads.memory-race.integration.test.tsx`][Output: assembler 成为实际主链路后的回归矩阵][Verify: 目标测试全过，Codex realtime/history convergence 无新增重复] 补齐 C 阶段自动化覆盖。
- [x] 5.2 [P0][Depends:5.1][Input: 受影响前端模块与现有门禁][Output: lint/typecheck/test 通过][Verify: `npm run lint && npm run typecheck && npm run test` 通过] 完成不提交前的最小实现门禁验证。
