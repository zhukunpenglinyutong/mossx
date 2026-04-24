## Why

`src/utils/threadItems.ts` 当前约 `2983` 行，已经进入 `feature-hotpath` policy 的 retained hard-debt 区间。  
问题不只是文件大，而是它同时承担了两类不同职责：

- thread item build / merge 的 domain assembly
- assistant text normalization / dedupe / readability scoring 的 text policy

这两类逻辑长期堆在一起，导致任何纯文本清洗策略调整都会放大 thread item 主链的 review 面积，也让后续继续拆 `buildItemsFromThread` 的成本更高。

## 目标与边界

- 目标：
  - 将 assistant text normalization 子域提取到独立 util module。
  - 保持 `threadItems.ts` 对外 export surface 稳定。
  - 让 `src/utils/threadItems.ts` 回到当前 large-file hard gate 以下。
- 边界：
  - 不改 `buildConversationItem`、`buildItemsFromThread`、`mergeThreadItems` 主链。
  - 不改变 `ConversationItem` shape、tool merge 语义或 thread preview 行为。
  - 不要求现有调用方迁移 import 路径。

## Non-Goals

- 不做 `threadItems.ts` 全量重写。
- 不顺手重构 ask-user parsing、tool detail normalize、user message fallback parsing。
- 不改变 assistant text 清洗算法的用户可见结果。

## What Changes

- 新增 util module 承载 assistant text normalization / dedupe / readability scoring 子域。
- 将 `stripClaudeApprovalResumeArtifacts`、assistant no-content placeholder 处理、assistant readability scoring 和相关内部 dedupe helpers 从 `threadItems.ts` 迁出。
- 保持 `threadItems.ts` 继续导出既有符号，由主文件 re-export / re-use 新 util module。
- 通过 typecheck、large-file gate 与 targeted thread/history tests 验证拆分没有破坏 contract。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `thread-items-assistant-text-normalization-compatibility`: 增补 thread item text-normalization modularization 的兼容性要求，确保 assistant text policy 抽离后外部导出面与可见结果保持稳定。

## Acceptance Criteria

- 现有从 `src/utils/threadItems.ts` 导入 `stripClaudeApprovalResumeArtifacts` 的调用方不需要改 import 路径。
- `src/utils/threadItems.ts` 低于当前 P1 hard gate。
- `npm run typecheck`、`npm run check:large-files:gate` 和相关 targeted tests 通过。

## Impact

- Affected code:
  - `src/utils/threadItems.ts`
  - `src/utils/threadItemsAssistantText.ts`
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - `src/features/threads/hooks/threadReducerTextMerge.ts`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
  - `npx vitest run src/features/threads/hooks/threadReducerTextMerge.test.ts src/features/threads/hooks/useThreadActions.test.tsx src/features/threads/hooks/useThreadActions.rewind.test.tsx`
