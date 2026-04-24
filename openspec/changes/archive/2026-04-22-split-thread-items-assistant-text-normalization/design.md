## Context

`threadItems.ts` 是 threads/messages 域的共享工具文件，本身承担“从 runtime/history payload 构建 ConversationItem”这件事没有问题。  
问题在于文件内部还叠加了一整块独立的 assistant 文本后处理策略：

- fragment merge
- repeated paragraph / sentence dedupe
- readability scoring
- approval resume artifact stripping
- no-content placeholder normalization

这些逻辑与 thread item build 主链并不属于同一层次，放在一个文件里会持续推高复杂度。

## Goals / Non-Goals

**Goals:**
- 保持 `threadItems.ts` 继续作为 threads/messages 共享入口。
- 将 assistant text policy 抽到独立 util module。
- 保持 `stripClaudeApprovalResumeArtifacts` 等既有对外符号的调用路径稳定。
- 不改变 assistant text 清洗的有效行为。

**Non-Goals:**
- 不拆 `buildConversationItem`、`buildItemsFromThread`、`mergeThreadItems`。
- 不统一所有 text normalize helper。
- 不调整 loader / reducer 侧的消费 contract。

## Decisions

### Decision 1: 按 text policy 子域切，不先拆 thread item assembly

- Decision: 第一轮只抽 assistant text normalization / scoring 子域。
- Rationale: 这是纯文本后处理策略，边界清晰、行为相对稳定；相比之下 item assembly 横跨 tool/message/reasoning 多种 kind，改动风险更高。
- Alternative considered:
  - 先拆 `buildConversationItem`：理论减重更大，但 cross-kind branch 多，容易引入行为漂移。

### Decision 2: 保持 `threadItems.ts` 作为 outward facade

- Decision: 新增 `threadItemsAssistantText.ts`，但 `threadItems.ts` 继续 re-use 并 re-export 既有符号。
- Rationale: `claudeHistoryLoader`、`threadReducerTextMerge`、tests 已依赖 `threadItems.ts` 导出面；保持 facade 能把回归面压到最小。
- Alternative considered:
  - 直接让调用方改 import：结构更“纯”，但会放大迁移范围。

### Decision 3: 只迁移 assistant text strategy 所需的私有 helper

- Decision: 将 fragment merge、paragraph/sentence dedupe、readability scoring、approval resume strip 一并迁入新模块，不零碎拆 helper。
- Rationale: 这些函数互相强耦合，拆成细粒度 shared helper 只会扩大模块间噪音。
- Alternative considered:
  - 只抽 `stripClaudeApprovalResumeArtifacts`：减重有限，主文件仍会保留大段 text-policy 细节。

## Risks / Trade-offs

- [Risk] 新 util module 和主文件之间共享常量后形成双轨逻辑  
  → Mitigation: assistant text policy 自带局部常量与 cache，主文件只依赖公开函数，不共享内部状态。

- [Risk] 迁移后 assistant text 去重结果发生细微漂移  
  → Mitigation: 保持函数顺序与调用顺序逐行等价，并用现有 thread/history tests 回归验证。

- [Trade-off] `threadItems.ts` 仍然偏大  
  → Mitigation: 本轮先脱离 hard debt；下一轮再考虑拆 item assembly 或 ask-user parsing 子域。

## Migration Plan

1. 为本轮 change 补齐 PRD 与 OpenSpec artifacts。
2. 新建 `threadItemsAssistantText.ts` 承载 assistant text policy。
3. 在 `threadItems.ts` 中改为导入/导出新模块的公开函数。
4. 执行 typecheck、targeted tests 与 large-file gate。
5. 重算 baseline/watchlist。

Rollback strategy:
- 若出现行为或编译回归，直接回退新 util module 与 `threadItems.ts` 接线，不触碰 item build/merge 主链。
