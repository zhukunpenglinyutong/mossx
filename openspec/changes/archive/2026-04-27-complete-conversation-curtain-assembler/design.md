## Context

上一阶段 `unify-conversation-curtain-normalization` 已经把 `Codex` 的 user / assistant / reasoning duplicate 判断收口到 `src/features/threads/assembly/conversationNormalization.ts`。这解决了“同一语义内容在 realtime 与 history path 使用不同 comparator”的主要问题。

但旧的 curtain architecture refactor 目标仍未完成：仓库已有 `RealtimeAdapter`、`HistoryLoader`、`ConversationAssembler` contract 与 parity tests，实际运行主链路仍大量把 normalized event 再拆回 legacy handlers / reducer actions。结果是 assembler 能证明一组样本一致，却不是所有主链路 state assembly 的入口。

当前约束：

- 不能破坏刚完成的 B 阶段 normalization contract。
- 不能一次性重写 `useThreadsReducer`，该文件承载大量引擎特例、queue handoff、generated image、rename recovery。
- 不能改 Tauri / Rust runtime contract。
- 用户要求本轮不提交，最终由人工测试。

## Goals / Non-Goals

**Goals:**

- 将 `ConversationAssembler` implementation 落到 `assembly` 层，符合旧架构分层。
- 让 history hydrate 实际通过 `hydrateHistory(snapshot)` canonicalization 后再进入 reducer。
- 让 assembler 复用 `conversationNormalization` core，避免再次出现 comparator drift。
- 引入 reducer-facing normalized event assembly helper，作为后续逐步替换 legacy handlers 的稳定入口。
- 补测试证明 assembler path 与现有 reducer visible output 一致。

**Non-Goals:**

- 不全量替换 `useThreadsReducer` 中所有 action。
- 不删除 legacy handler path。
- 不改变 `Messages` 组件输入 contract。
- 不改变 runtime event payload 或 backend storage schema。

## Decisions

### Decision 1: assembler implementation 从 `contracts` 下沉/迁移到 `assembly`

选择：新增或迁移 `src/features/threads/assembly/conversationAssembler.ts`，`src/features/threads/contracts/conversationAssembler.ts` 仅保留兼容 re-export。

原因：`contracts` 目录应该表达类型与边界，当前里面有大量 merge implementation。放到 `assembly` 后，B 阶段 normalization core 与 C 阶段 assembler 在同一领域目录下，后续更容易继续推进。

备选：保持文件位置不动。未采用，因为架构上会继续把 implementation 和 contract 混在一起。

### Decision 2: history hydrate 先接 assembler，realtime 采用 helper 渐进迁移

选择：`useThreadActions` 在消费 `HistoryLoader.load()` 结果时调用 `hydrateHistory(snapshot)`，使用其 `items/plan/userInputQueue/meta` 作为 reducer 输入。Realtime 先增加 `assembleNormalizedThreadEvent` / reducer-facing helper，并用测试锁定输出，暂不全量替换所有 handler。

原因：history path 的输入是完整 snapshot，最适合先稳定接入 assembler。Realtime path 有 batching、processing 标记、Gemini late reasoning、generated image placeholder 等副作用，直接全量替换风险高。

备选：直接在 `useAppServerEvents` 里让 normalized event 绕过 legacy handlers。未采用，因为 side effect 面太大，容易破坏当前稳定行为。

### Decision 3: assembler 内部只依赖 normalization core，不复制 comparator

选择：assembler 对 assistant/reasoning/user equivalence 使用 `conversationNormalization` 里的 helper；若需要 text merge，则调用现有 reducer text merge helper 或新增 thin wrapper，不再写新的 compact 正则。

原因：B 的价值就是统一 comparator。C 如果再复制一套，就会把重复问题带回来。

备选：保留 assembler 当前局部 compact helper。未采用，因为这正是 drift 来源。

### Decision 4: 保留 history reconcile，但明确它只能是 assembled-state backfill

选择：不删除 `scheduleCodexRealtimeHistoryReconcile()`；它拿到 history 后仍走 assembler hydrate，再由 reducer 做 optimistic/handoff preservation。

原因：history 仍可能补 canonical id、final timing、token usage、plan、user input queue。问题不是 reconcile 存在，而是它过去承担 duplicate repair 主责。

备选：关闭 reconcile。未采用，风险大且会丢失 structured facts。

### Decision 5: Codex realtime render 采用 staged Markdown + input-priority defer

选择：`Codex` latest assistant row 保持 live Markdown surface，但根据输出体量使用 staged `streamingThrottleMs`；当用户正在 composer 中输入时，允许对 `streamActivityPhase`、context usage、rate limits 等非 send-critical state 使用 deferred props 与结构化 memo，优先保证输入响应。

原因：完全退回 plain-text live surface 虽然能压卡顿，但会让结构只在 completion 后突然恢复；而让最热的 curtain state 直接传进 composer，会把输入框一起拖慢。staged Markdown + input-priority defer 能在不依赖 history refresh 的前提下，兼顾实时结构感与输入可操作性。

备选 A：持续使用 plain-text live surface。未采用，因为实时结构感过差，completion 时视觉跳变明显。
备选 B：不做输入优先，只靠 reducer / event batching。未采用，因为用户实测仍会出现输入框与幕布一起卡顿。

## Risks / Trade-offs

- [Risk] `hydrateHistory(snapshot)` 的 dedupe 规则与 reducer `setThreadItems` preservation 冲突
  → Mitigation：只 canonicalize snapshot 自身，再让 reducer 保留 optimistic / handoff 本地项；测试覆盖 queued handoff reconcile。

- [Risk] assembler 迁移路径造成 import cycle
  → Mitigation：`assembly/conversationAssembler.ts` 只依赖 `types`、`threadItems`、`conversationNormalization` 和必要 pure helper；`contracts` re-export 不反向依赖 feature hooks。

- [Risk] realtime helper 变成新旁路，没有实际价值
  → Mitigation：把 helper 用在 reducer/action 测试或 history parity 测试中，并在 tasks 中限定至少一个 runtime-facing path 使用 assembled state。

- [Risk] 这次范围扩大到所有引擎
  → Mitigation：实现以 Codex-first 为主，保持 `Claude/Gemini/OpenCode` 现有测试通过；非 Codex 只复用不强迁。

## Migration Plan

1. 新建 `assembly/conversationAssembler.ts` 并让 `contracts/conversationAssembler.ts` 兼容 re-export。
2. 将 assembler 内部 comparator 改为复用 `conversationNormalization` core。
3. 在 `useThreadActions` history hydrate 中使用 `hydrateHistory(snapshot)` 的 assembled state。
4. 为 normalized realtime event 增加 reducer-facing assembly helper，并用 tests 锁定与旧 reducer output 一致。
5. 为 `Codex` realtime render 引入 staged Markdown throttle 与 input-priority defer，确保 realtime 结构与输入响应共同可接受。
6. 更新 OpenSpec tasks 和 spec，运行 targeted tests + `lint/typecheck/test`。

回滚策略：

- 若 history hydrate 发生回归，回退 `useThreadActions` 中的 `hydrateHistory(snapshot)` 接入点即可。
- 若 assembler 迁移发生 import 问题，恢复 `contracts/conversationAssembler.ts` implementation；新文件无持久化影响。

## Open Questions

- 下一步是否把 `routeNormalizedRealtimeEvent()` 直接改成分发 `NormalizedThreadEvent` action？本轮先不做全量切换。
- `PresentationProfile` 是否在 C 同步推进？当前先不推进，避免把渲染样式和数据装配混在一轮里。
