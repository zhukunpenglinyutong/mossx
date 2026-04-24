## Context

`useThreadMessaging` 是线程消息域的主编排 hook，这个角色本身没有问题。  
问题在于它同时承担了三类不同风险级别的逻辑：

- 高风险主链：`sendMessageToThread`、engine send、thread recovery、memory capture
- 中风险控制链：`interruptTurn`、`startReviewTarget`
- 低风险 session tooling：`/status`、`/mcp`、`/lsp`、`/spec-root`、`/export` 等

这些 tooling commands 大多只是读取状态、调用 service、再写回 assistant message，但被塞在主链文件里，持续推高改动复杂度。

## Goals / Non-Goals

**Goals:**
- 保持 `useThreadMessaging` 继续作为主入口。
- 将 session tooling commands 抽到独立 feature-local hook。
- 保持对外返回的 action 名称不变。
- 不改变 slash commands 的用户可见行为。

**Non-Goals:**
- 不重写主发送链或 review 流程。
- 不引入新的 shared framework 或 command registry。
- 不做与本轮降线无关的结构清理。

## Decisions

### Decision 1: 按“动作域”切，而不是按工具函数切

- Decision: 第一轮直接抽整组 session tooling commands，而不是零散抽 helper。
- Rationale: 这些 commands 在语义上属于同一子域，整体迁移比散点 helper 提取更不容易形成新的跨文件耦合。
- Alternative considered:
  - 只抽纯函数 helper：减重有限，而且主 hook 仍会保留大量 callback 噪音。

### Decision 2: 保持 `useThreadMessaging` 的 outward contract 不变

- Decision: 顶层 hook 继续返回 `startContext/startStatus/...` 这些字段名。
- Rationale: `useThreads` 和 `useQueuedSend` 已经依赖这组 action surface，保留 contract 可把回归面压到最小。
- Alternative considered:
  - 让调用方改为消费 nested object：结构更“干净”，但会扩大改动面。

### Decision 3: 主发送链与 review 链保持原地

- Decision: 本轮不动 `sendMessageToThread`、`interruptTurn`、`startReviewTarget`、`startReview`。
- Rationale: 这些链路直接涉及 engine contract、thread recovery 与 review flow，是当前最不适合顺手拆的部分。
- Alternative considered:
  - 一次性拆完整个 hook：收益大，但行为回归风险过高。

## Risks / Trade-offs

- [Risk] 新 hook 入参过多，导致 contract 在提取后继续膨胀  
  → Mitigation: 只迁移 session tooling 真正需要的依赖，不把主链依赖整包传入。

- [Risk] slash commands 的错误文案或 activity 打点顺序发生漂移  
  → Mitigation: 迁移时保持 service 调用、dispatch、recordThreadActivity、safeMessageActivity 的顺序不变。

- [Trade-off] `useThreadMessaging` 仍然是复杂 hook  
  → Mitigation: 这轮先降到 hard gate 以下，下一轮再评估是否继续拆 review / interrupt 或 send lifecycle。

## Migration Plan

1. 为本轮 change 补齐 PRD 与 OpenSpec artifacts。
2. 新建 feature-local hook 承载 session tooling commands。
3. 在 `useThreadMessaging.ts` 中接入新 hook，并保持原返回字段名。
4. 跑 typecheck、targeted tests 与 large-file gate。
5. 重算 baseline/watchlist。

Rollback strategy:
- 若出现行为或编译回归，直接回退新增 hook 与顶层接线，不影响主发送链。
