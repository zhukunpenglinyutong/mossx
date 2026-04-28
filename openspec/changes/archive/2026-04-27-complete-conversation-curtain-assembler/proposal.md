## Why

`Codex` 幕布的 duplicate normalization 已经收口到共享 core，但旧的架构目标还没完成：`RealtimeAdapter`、`HistoryLoader`、`ConversationAssembler` 已存在，却仍有一部分实际状态装配绕过 assembler，导致 contract 测试和运行主链路之间存在距离。

现在继续做 Phase C，是为了把现有 assembler 从“旁路验证层”推进成 realtime / history 的共同语义装配边界，避免后续继续在 reducer、loader、event router 中追加分散规则。

## What Changes

- 将 `ConversationAssembler` implementation 从 `contracts` 域整理到 `assembly` 域，`contracts` 只保留类型与兼容 re-export。
- 让 history hydrate 的主链路先经过 `hydrateHistory(snapshot)` 再写入 reducer，确保 loader 输出和 UI state 使用同一 canonicalization。
- 将 assembler 内部的 message / reasoning / assistant 等价判断接入 `conversationNormalization` core，避免 C 阶段重新引入第二套 comparator。
- 为 realtime normalized event 增加可复用的 reducer-facing assembly helper，使 adapter 输出不再只能回退成 legacy handler payload。
- 保留旧 reducer 行为与现有 handlers，不做一次性全量切换；本次只迁移可验证、低风险的 Codex-first 主路径。

## 目标与边界

- 目标：让 `ConversationAssembler` 成为 `Codex` realtime/history convergence 的显式 source-of-truth。
- 目标：保持 B 阶段 normalization core 的单一事实源，不复制 user/assistant/reasoning comparator。
- 目标：让后续继续扩展 `Claude / Gemini / OpenCode` 时可以接同一 assembler contract。
- 边界：不改 Rust / Tauri command contract。
- 边界：不做消息幕布视觉样式改动。
- 边界：不删除 post-turn history reconcile；只继续收窄其职责为 validation / backfill。

## 非目标

- 不一次性替换所有 `useThreadsReducer` action。
- 不迁移 `Messages` 渲染组件和样式系统。
- 不修改 provider runtime 通信协议。
- 不引入新的持久化 schema 或数据迁移。
- 不提交代码；本 change 完成后等待人工测试。

## 技术方案对比

| 方案 | 描述 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A | 继续只靠 reducer / loader 局部 helper | 改动小 | `ConversationAssembler` 继续旁路，重复规则会回来 | 不采用 |
| B | 直接让所有 realtime action 全量改走 assembler | 架构最彻底 | blast radius 过大，容易打断 reasoning/tool/gemini 特例 | 不采用 |
| C | 先把 assembler 接入 history hydrate 与 Codex normalized event 边界，逐步替换 reducer 内部装配 | 风险可控，能真正推进旧架构目标 | 仍保留少量 legacy handler 编排 | 采用 |

## Capabilities

### New Capabilities

- `conversation-curtain-assembly-core`: 定义 `ConversationAssembler` 作为 realtime event 与 history snapshot 的统一 semantic assembly layer，要求实际主链路复用该 contract。

### Modified Capabilities

- `conversation-lifecycle-contract`: 明确 post-turn history reconcile 在 assembler 收口后只能补 canonical facts / metadata，不得成为 primary duplicate repair。
- `codex-realtime-canvas-message-idempotency`: 明确 assembler migration 不得改变 `Codex` assistant idempotent convergence 语义。

## 验收标准

1. `Codex` history hydrate MUST 先经过 `ConversationAssembler.hydrateHistory()` 再进入 reducer visible items。
2. `ConversationAssembler` MUST 使用 `conversationNormalization` core 处理 user/assistant/reasoning 等价判断。
3. 等价 history replay MUST NOT 改变 visible row cardinality。
4. normalized realtime adapter 输出 MUST 有 reducer-facing assembly helper，可在不读取 raw engine payload 的情况下装配 `ConversationItem`。
5. 现有 `Messages` / reducer / history loader 回归测试必须通过。

## Impact

- Frontend contracts / assembly:
  - `src/features/threads/contracts/conversationAssembler.ts`
  - `src/features/threads/contracts/conversationCurtainContracts.ts`
  - `src/features/threads/assembly/**`
- Realtime / history:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/loaders/*HistoryLoader.ts`
- Tests:
  - `conversationAssembler.test.ts`
  - `realtimeHistoryParity.test.ts`
  - `useThreadsReducer.test.ts`
  - `historyLoaders.test.ts`
  - `useThreads.memory-race.integration.test.tsx`
