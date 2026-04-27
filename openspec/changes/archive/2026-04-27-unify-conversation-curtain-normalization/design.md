## Context

当前 `Codex` 幕布的 duplicate convergence 分散在多条链路中：

- realtime event ingress：`useAppServerEvents.ts`
- assistant completed merge：`threadReducerTextMerge.ts`
- optimistic / handoff user bubble reconcile：`useThreadsReducer.ts` + `queuedHandoffBubble.ts`
- history hydrate：`codexHistoryLoader.ts` / `resumeThreadForWorkspace()`
- post-turn repair：`useThreads.ts` 中的 `scheduleCodexRealtimeHistoryReconcile()`

这些逻辑都在做“等价判断”和“重复收敛”，但判断口径并不完全一致，所以系统形成了“本地先近似收敛，最后 history refresh 再修正”的双阶段模型。用户看到的偶发重复，本质上是 source merge contract 没有单一事实源。

同时，仓库里已经存在旧的 curtain architecture 方向：`conversationCurtainContracts.ts` 和 realtime adapters 已经成型，但 `HistoryLoader / ConversationAssembler` 没有完整落地。本次方案 B 需要在不扩大 blast radius 的前提下，做一个可以自然长成 phase C 的子集。

## Goals / Non-Goals

**Goals:**

- 提炼一套 engine-neutral 的 conversation normalization core。
- 让 `Codex` realtime upsert、completed settlement、history hydrate 共用同一套 user/assistant/reasoning merge 规则。
- 保留 post-turn history reconcile，但把它降级为 validation / backfill，而不是 duplicate repair 主路径。
- 将新增逻辑尽量落在 feature-local pure module 中，减少 hook 层条件分支继续膨胀。

**Non-Goals:**

- 不完整实现 phase C 的 assembler/profile 分层。
- 不迁移所有引擎到新 core；本次只保证 `Codex` first integration，公共 pure helper 允许被其它路径复用。
- 不改 backend contract、session store 或 UI layout。

## Decisions

### Decision 1: 新建 engine-neutral normalization core，而不是继续扩写 reducer / loader 局部 helper

- 选择：新增 `src/features/threads/assembly/`（或等价 feature-local 目录）下的 pure normalization module，暴露统一 contract：
  - `normalizeUserObservationEquivalence`
  - `mergeAssistantSettlement`
  - `mergeReasoningObservation`
  - `hydrateConversationItemsWithCanonicalization`
- 原因：这些规则本质上是 pure merge logic，不应继续散落在 hook 与 loader 中；抽到 feature-local pure module 最符合当前代码结构，也为后续 C 的 assembler 提供直接前身。
- 备选：继续把逻辑塞在 `useThreadsReducer.ts` / `codexHistoryLoader.ts` 中。未采用，因为这会继续制造重复规则。

### Decision 2: B 采用 Codex-first integration，但 core 不携带 Codex-only 命名

- 选择：core 的输入输出保持 conversation-domain 语义，不把函数名写成 `codex*`；真正的 Codex 接线只发生在 reducer / history loader / useThreads 调度层。
- 原因：这样 B 做完后，C 可以继续把 Claude/Gemini/OpenCode 接进来，而不需要先推翻命名和类型。
- 备选：做一个 `codexRealtimeNormalization.ts`。未采用，因为会把 B 固化为专用补丁层。

### Decision 3: 将 “visible row cardinality” 设为核心 invariant

- 选择：统一把 user/assistant/reasoning 的 normalization 目标定义为“等价 observation 进入后，幕布中可见 row 数量保持稳定”。
- 原因：当前用户感知最强的问题不是 metadata 漂移，而是“突然多一条 / 少一条 / 刷一下才对”。row cardinality 是最直接的 correctness signal。
- 备选：只比较最终 text 是否相等。未采用，因为 queued handoff、selected-agent prompt injection、history canonical id 替换这些场景会出现 text 不完全相同但语义等价。

### Decision 4: post-turn history reconcile 保留，但职责显式收窄

- 选择：保留 `scheduleCodexRealtimeHistoryReconcile()`，但要求它只做两类事：
  1. 补齐本地尚未掌握的 canonical id / structured facts / metadata；
  2. 验证本地 normalized state 与 persisted history 是否等价。
- 原因：直接删除 reconcile 风险过高，而且 history 仍可能补齐 sparse realtime 缺失的信息；但 duplicate repair 不应再主要依赖它。
- 备选：彻底关闭 reconcile。未采用，因为会丢失 backfill 价值并扩大风险。

### Decision 5: 先把 `Codex` 历史 hydrate 改为共用 normalization，再考虑把 realtime adapter 进一步接成 assembler

- 选择：优先改两条已经最容易发生 drift 的入口：
  - `useThreadsReducer` / completed merge
  - `codexHistoryLoader` / `setThreadItems`
- 原因：当前最明显的 source divergence 就在 realtime settlement 与 history hydrate 之间。先打通这两个点，收益最大，且不必一次改掉所有 hook 编排。
- 备选：从 `useAppServerEvents` 开始重构完整 adapter pipeline。未采用，因为会过早触碰更大范围的事件路由。

## Risks / Trade-offs

- [Risk] normalization core 初版判断过宽，误合并合法重复内容
  → Mitigation：先覆盖已知高频场景（optimistic/history user 等价、completed replay、reasoning snapshot）；保守处理跨 turn、跨 role、跨 item kind 的合并。

- [Risk] history hydrate 接入新 core 后，`Codex` reopen 的 row 顺序发生细微变化
  → Mitigation：保持现有 item ordering 规则，只替换等价判定与 canonical replacement，不重写 timeline ordering。

- [Risk] reconcile 仍然存在，团队误以为 duplicate 已完全靠本地修好，忽略兜底路径
  → Mitigation：在 spec 与测试里显式把 reconcile 定义成 validation / backfill path，并增加“等价 history replay 不改变 visible row count”的测试。

- [Risk] 抽 core 时顺手影响 `Claude` / `Gemini`
  → Mitigation：本次 integration 只接 `Codex`；公共 helper 如被其它引擎复用，必须由对应测试证明无回归。

## Migration Plan

1. 新增 normalization core，并先把现有 user/assistant/reasoning 等价规则集中进去。
2. 让 `useThreadsReducer` 的 optimistic user reconcile 与 assistant completed merge 走新 core。
3. 让 `codexHistoryLoader` 或 history hydrate merge 走同一套 canonicalization 规则。
4. 保留现有 `scheduleCodexRealtimeHistoryReconcile()`，但增加测试保证等价 history replay 不再改变 visible row cardinality。
5. 当 B 稳定后，再评估是否继续把 realtime adapter + history loader 全量收敛到 phase C 的 assembler。

回滚策略：

- 若新 core 引发回归，可回退到旧 merge path；本次改动不涉及持久化 schema，无数据迁移成本。
- 归一化模块设计为内部 pure helper，回滚时只需恢复调用点，不需要回滚 UI contract。

## Open Questions

- B 阶段是否只让 `Codex` 的 history hydrate 使用新 core，还是同时把 `Claude` completed duplicate collapse 的一部分 helper 共用掉？当前倾向先只接 `Codex`。
- 是否需要在本次顺手引入 `ConversationAssembler` 空壳接口，为 C 提前定型？当前倾向先不引入空壳，避免无效抽象。
- 当前 `useThreadsReducer` 中 optimistic generated image placeholder 的 preserve 逻辑是否也应该迁入同一 core？本次先不并入，除非实现时发现它与 user/assistant canonicalization 强耦合。
