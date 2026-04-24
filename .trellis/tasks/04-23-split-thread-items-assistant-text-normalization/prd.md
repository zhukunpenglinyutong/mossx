# Split thread items assistant text normalization into utility module

## Goal
在不改变 `threadItems` 对外 export surface、会话 item build 语义和调用方 import 路径的前提下，将 assistant text normalization / dedupe / readability scoring 子域从 `src/utils/threadItems.ts` 中抽离，优先把主文件压回当前 large-file hard gate 以下。

## Requirements
- 抽离 `stripClaudeApprovalResumeArtifacts`、assistant text dedupe/fragment normalization、assistant readability scoring、assistant placeholder normalization。
- 保持 `src/utils/threadItems.ts` 继续导出 `stripClaudeApprovalResumeArtifacts`，现有调用方不需要迁移 import 路径。
- 不修改 `buildConversationItem`、`buildItemsFromThread`、`mergeThreadItems` 的对外语义。
- 抽分后 `src/utils/threadItems.ts` 需要低于当前 `feature-hotpath` policy 的 fail threshold。

## Acceptance Criteria
- [ ] 新增 util module 承载 assistant text normalization 子域。
- [ ] `src/utils/threadItems.ts` 行数降到 `2800` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `threadItems.ts` 不再属于 retained hard debt。
- [ ] 相关 targeted tests 通过。

## Technical Notes
- OpenSpec change: `split-thread-items-assistant-text-normalization`
- 本轮不拆 `buildConversationItem` / `buildItemsFromThread` / `mergeThreadItems` 主链。
