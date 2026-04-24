## Context

当前 `Claude` assistant 文本有两条不同的收敛路径：

1. live delta 先通过 `appendAgentDelta` 把正文前缀渲到当前 bubble
2. turn completed 后再通过 `completeAgentMessage` 用最终 completed payload 结算 terminal state

已存在的 duplicate collapse 主要覆盖：

- `A + A`
- `A + tail`
- 近似段落块重复

但对 `Markdown report` 常见的 `prefix + full snapshot` 形态，现有 `mergeCompletedAgentText(...)` 会把它当成“更长的 completed 正文”，从而在 terminal bubble 里保留两份主体。

## Goals / Non-Goals

**Goals**

- 让 completed normalization 在 terminal settlement 前识别并折叠 leading replay。
- 保持修复只发生在 completed assistant text 边界，不改 event ordering / item id / history reconcile。
- 让 reducer 与 merge helper 都有明确回归测试。

**Non-Goals**

- 不新增 render-layer dedupe。
- 不改 `loadClaudeSession(...)` / `parseClaudeHistoryMessages(...)`。
- 不把 fragmented reasoning 或 blanking recovery 混进这次修复。

## Decisions

### Decision 1: 在 completed normalization 前折叠 leading replay，而不是改 history path

问题发生在 terminal payload merge 阶段。最小、最稳定的修复点是 `normalizeCompletedAssistantText(...)` 前置一次 replay collapse，而不是去改 history reconcile。

### Decision 2: 只在“后半段严格更长且以前缀可比较文本开头”时才裁掉前缀

为了避免误伤合法重复正文，检测逻辑要求：

- comparable text 达到最小长度阈值
- 在正文后半段再次找到 leading anchor
- 该 anchor 后的 remainder 比 replayed prefix 更长
- remainder 自身以此前缀起始

只有满足这些条件，才把前缀裁掉并保留后面的完整 snapshot。

### Decision 3: 保持修复 engine-agnostic 的 helper 位置，但由 Claude 现场回归驱动

helper 位于通用 reducer merge 层，这样 terminal settlement contract 仍然集中；但本 change 的现场、验收和测试目标都以 `Claude completed output duplication` 为主，不扩大行为承诺。

## Risks / Trade-offs

- [Risk] 过度折叠，误伤合法的“引言 + 正文”重复结构。  
  Mitigation: 仅对足够长的 comparable replay 触发，且要求 remainder 明显更长。

- [Risk] 修复 helper 后影响既有 completed duplicate collapse。  
  Mitigation: 保留现有 normalize / paragraph collapse 顺序，并运行 reducer + merge targeted tests。

- [Risk] 真实现场可能还包含 fragmented prefix。  
  Mitigation: 本次先覆盖已稳定复现的 `plain prefix + full snapshot` 形态；若后续仍有 fragmented 现场，再单独扩展。

## Validation Plan

1. 在 `threadReducerTextMerge.test.ts` 增加 `Markdown report prefix replay` 单测。
2. 在 `useThreadsReducer.completed-duplicate.test.ts` 增加 reducer 级 terminal settlement 回归。
3. 运行 targeted Vitest，确认既有 completed duplicate cases 不回退。
4. 运行 `npm run typecheck`。
5. 结合用户在 macOS 上的实际复现场景，确认 completed 最后一跳不再出现大段重复。
