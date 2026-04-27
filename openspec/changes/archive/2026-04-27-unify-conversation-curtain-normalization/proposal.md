## Why

当前对话幕布在 `Codex` 路径上仍然存在“实时先近似去重、turn 完成后再靠 history reconcile 修正”的双阶段收敛模式。这样虽然能在多数场景下最终修正重复，但用户仍会偶发看到重复 user bubble、assistant completed replay、reasoning snapshot 抖动，说明系统还没有形成单一 normalization truth。

现在需要先落一层前端统一归一化能力，把 realtime 与 history hydrate 的 merge 规则收口到同一个 contract，降低偶发重复与 reconcile 依赖，为后续完整的 curtain architecture phase C 提供可持续的演进底座。

## What Changes

- 新增一层 **conversation curtain normalization core**，统一处理 `user / assistant / reasoning / queued handoff` 的等价判断与 merge 规则。
- 让 `Codex` 的 realtime path 与 history hydrate path 共用同一套 normalization contract，而不是分别在 event hook、reducer、history loader 中各自去重。
- 将 `Codex` turn 完成后的 history reconcile 从“主要 duplicate repair 路径”降级为“validation / backfill 路径”：
  - 允许补齐缺失的 canonical id、structured activity 与 metadata；
  - 不再把“去掉重复 assistant/user bubble”主要寄托在 refresh 之后。
- 保持当前 runtime / Tauri command / storage contract 不变，不引入新的后端 payload。
- 本次实现采用 **engine-neutral core + Codex-first integration**：
  - core 设计必须可被后续 `Claude / Gemini / OpenCode` 复用；
  - 实际接线先收敛 `Codex`，避免一次性扩大 blast radius。

## 目标与边界

### 目标

- 目标 1：让 `Codex` 幕布在本地 realtime settlement 阶段就能稳定收敛重复 user/assistant/reasoning 信息。
- 目标 2：让 history hydrate 与 realtime merge 使用同一个 normalization contract，降低偶发重复和 source drift。
- 目标 3：保留后续继续推进 phase C（完整 assembler / history loader / profile 分层）的演进空间。

### 边界

- 本 change 只处理 frontend conversation curtain 的 normalization / merge 收口。
- 本 change 不改 Rust backend、Tauri command、session storage schema。
- 本 change 先以 `Codex` 接线为主；其它引擎保持现状，除非共用 core 不可避免地影响通用 pure helper。

## 非目标

- 不一次性完成旧 `chat-canvas-conversation-curtain-architecture-refactor` 里全部 `HistoryLoader / Assembler / Profile` 架构工作。
- 不重做 `Messages` 视觉层或布局结构。
- 不改 history loading UX、queue FIFO 语义或 runtime scheduling 策略本身。
- 不以“禁用 reconcile”作为修复方式；reconcile 仍然保留，但职责收窄。

## 技术方案对比

| 方案 | 描述 | 优点 | 风险 / 成本 | 结论 |
|---|---|---|---|---|
| A | 继续在 `useAppServerEvents`、`threadReducerTextMerge`、`threadItems`、history loader 各处补 dedupe 规则 | 改动最小 | 规则继续漂移；仍依赖 reconcile 擦屁股；后续 C 更难做 | 不采用 |
| B | 引入前端共享 normalization core，并先接入 `Codex` realtime + history hydrate | 低于完整重构的风险；能显著降低偶发重复；是 phase C 的可演进子集 | 需要梳理现有 merge 规则并补测试矩阵 | **采用** |
| C | 一次性补齐完整 curtain architecture：Assembler、HistoryLoader、Presentation Profile 全部分层 | 架构最完整 | 范围大、回归面大、当前任务不适合一口吃完 | 作为后续阶段，不在本 change 内完成 |

取舍：先采用 **方案 B**。但 B 的模块边界必须按 C 的目标设计，避免再生成一层只服务 `Codex` 的临时补丁层。

## 验收标准

1. `Codex` 同一条 user message 在 `optimistic / queued handoff / authoritative history` 三种来源下，幕布中 MUST 收敛为单条可见 user bubble。
2. `Codex` assistant 在 `stream delta / completed snapshot / history hydrate` 多来源下，幕布中 MUST 收敛为单条 completed assistant message，不得依赖 history refresh 才去掉主体重复。
3. `Codex` reasoning snapshot 在 realtime 与 history hydrate 之间 MUST 使用同一套重复判断规则，避免重复 reasoning row 仅靠 history 重刷消失。
4. turn 完成后的 `Codex` history reconcile 若只带来等价内容，MUST 不改变用户可见 message row 数量；它只允许 canonicalize ids / metadata 或补齐缺失 structured facts。
5. 非 `Codex` 引擎的现有可见行为 MUST 不回归。

## Capabilities

### New Capabilities
- `conversation-curtain-normalization-core`: 定义 conversation curtain 在 realtime 与 history hydrate 两条路径上的统一 normalization / merge contract，包括 user bubble equivalence、assistant settlement canonicalization 与 reasoning snapshot dedupe。

### Modified Capabilities
- `conversation-lifecycle-contract`: 增加 `Codex` realtime terminal settlement 与 post-turn history reconcile 的职责边界，要求 reconcile 以 validation / backfill 为主，而不是 primary duplicate repair。

## Impact

- Frontend hooks:
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/threadReducerTextMerge.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreads.ts`
- Frontend loaders / utils:
  - `src/features/threads/loaders/codexHistoryLoader.ts`
  - `src/features/threads/utils/queuedHandoffBubble.ts`
  - 新增 shared normalization module（建议落位在 `src/features/threads/assembly/` 或等价 feature-local 目录）
- Tests:
  - reducer merge tests
  - memory race / history reconcile integration tests
  - history loader parity tests
