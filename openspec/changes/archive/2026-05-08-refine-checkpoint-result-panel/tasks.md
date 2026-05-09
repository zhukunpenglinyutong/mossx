## 1. Key Changes 与文件事实收口

- [x] 1.1 [P0][依赖:无][输入: `buildKeyChanges` / `FileChangesList`][输出: files / tasks / agents 摘要不被无条件切片丢弃][验证: `StatusPanel.test.tsx` 覆盖文件列表完整渲染] 保留完整 key changes 事实，不再通过 UI 切片隐藏首项。
- [x] 1.2 [P0][依赖:1.1][输入: `workspaceGitFiles` / `workspaceGitDiffs` / `workspaceGitTotals`][输出: `canonicalFileFacts` 优先于历史 `fileChanges`][验证: `checkpoint.test.ts` 覆盖 canonical fallback，`StatusPanel.test.tsx` 覆盖 Git-backed 文件展示] 使用当前 workspace Git working tree 作为 checkpoint 文件事实优先来源。

## 2. Next Actions 交互闭环

- [x] 2.1 [P0][依赖:无][输入: `CheckpointPanel` action row / `onCommit` / Git status files][输出: commit action 打开 `CheckpointCommitDialog`][验证: `StatusPanel.test.tsx` 覆盖 dialog 打开、message change、selected paths commit] 接入可复用 Git commit confirmation flow。
- [x] 2.2 [P0][依赖:2.1][输入: `CheckpointCommitDialog` / `GitDiffPanelCommitScope`][输出: 复用 commit message、generate message、file selection、scoped commit callback][验证: `StatusPanel.test.tsx` 覆盖 generate message selected paths 与 commit selected paths] 避免在 checkpoint 内实现第二套 staging / commit 逻辑。
- [x] 2.3 [P1][依赖:无][输入: `buildNextActions` / `CheckpointPanel.handleReviewDiff`][输出: `review_diff` action 是真实可点击入口][验证: `StatusPanel.test.tsx` 覆盖 review diff modal 与 sidebar] 保留 Next Actions 中的 diff review 决策入口。
- [x] 2.4 [P1][依赖:2.3][输入: `FileChangesList`][输出: 文件变化区提供总览 diff 与文件级 diff 入口][验证: `StatusPanel.test.tsx` 覆盖 checkpoint diff modal 打开与路径规范化] 在文件层提供就地 review 入口。
- [x] 2.5 [P1][依赖:2.1-2.2][输入: `CheckpointCommitDialog` / `useGitCommitSelection`][输出: 提交文件 header 提供单个批量切换 checkbox][验证: `StatusPanel.test.tsx` 覆盖 partial -> 全选与全选 -> 清空可选项] 补齐提交确认弹窗的批量选择入口，不增加第二套按钮或 staging 状态。

## 3. popover compact 差异化

- [x] 3.1 [P1][依赖:1.1][输入: `CheckpointPanel` compact prop][输出: compact 模式隐藏 FileChangesList 和 Risks][验证: 组件结构通过 `compact` 条件渲染约束] 实现信息密度差异化。
- [x] 3.2 [P2][依赖:3.1][输入: `onExpandToDock` / layout dock state][输出: 「在 dock 中查看完整结果」真正切换到 dock checkpoint][验证: `StatusPanel.test.tsx` 覆盖 compact expand callback 与 dock preferred tab] 补齐 compact expand 入口的上层接线。

## 4. Evidence 信息密度提升

- [x] 4.1 [P1][依赖:无][输入: `checkpoint.evidence` / `validationProfile`][输出: Evidence 不重复 changed-file count / `+/-` 摘要][验证: `StatusPanel.test.tsx` 覆盖 evidence section 不包含 `filesChangedValue`] 将文件统计统一交给 FileChangesList。
- [x] 4.2 [P1][依赖:4.1][输入: `validationProfile.requiredKinds` / `visibleKinds`][输出: required / optional validations 分组渲染][验证: component tests 覆盖 required/optional i18n keys 与验证 chips] 分组展示 validations。
- [x] 4.3 [P1][依赖:4.2][输入: missing validation commands][输出: 可复制验证命令；`needs_review` 下不强推 run-missing guide][验证: `StatusPanel.test.tsx` 覆盖 needs_review 不显示命令提示] 避免把人工 review 状态误导成单一验证步骤。

## 5. Verdict 规则细化

- [x] 5.1 [P2][依赖:无][输入: `resolveVerdict` / `validationProfile.requiredKinds`][输出: optional/custom command failure 降级为 `needs_review`][验证: `checkpoint.test.ts` 与 `StatusPanel.test.tsx` 覆盖 custom command failure] 细化 blocked 触发条件。
- [x] 5.2 [P2][依赖:5.1][输入: required validation command failure][输出: required validation failure 仍为 `blocked`][验证: `checkpoint.test.ts` 覆盖 `npm run test` error blocked] 保留真实阻塞的高优先级。

## 6. Summary 采纳策略放宽

- [x] 6.1 [P2][依赖:无][输入: `shouldUseGeneratedSummary`][输出: running 状态允许采纳 generated summary][验证: `checkpoint.test.ts` 覆盖 running + generated summary] running 状态放宽。
- [x] 6.2 [P2][依赖:6.1][输入: `resolveCheckpointGeneratedSummary`][输出: 支持 assistant message 中明确 `## Summary` heading 的总结段落][验证: `checkpoint.test.ts` 覆盖 assistant summary heading] 扩展摘要来源。
- [x] 6.3 [P2][依赖:6.1-6.2][输入: 普通 assistant message][输出: 不把最新 assistant answer 当成 checkpoint summary][验证: `StatusPanel.test.tsx` 覆盖普通 assistant answer 不复用] 防止 summary 层误用聊天回复。
- [x] 6.4 [P2][依赖:6.1-6.3][输入: `POSITIVE_SUMMARY_HINT` / risks / verdict][输出: unsettled evidence 下拒绝「全部通过 / 可提交」类摘要][验证: focused checkpoint tests 覆盖 positive summary 过滤] 避免 summary 伪造状态。

## 7. Type / spec cleanup

- [x] 7.1 [P1][依赖:1.2][输入: `buildCheckpointViewModel` 参数][输出: `canonicalFileFacts` 可选参数][验证: typecheck + `checkpoint.test.ts` 覆盖 fallback 行为] 接入 canonical file facts 参数。
- [x] 7.2 [P3][依赖:2.3][输入: `CheckpointActionType`][输出: 清理或保留说明 `open_risk` / `retry` 未生成的 action 类型][验证: typecheck + focused action tests] 收敛未使用 action type。

## 8. 回归验证

- [x] 8.1 [P0][依赖:1.1-7.1][输入: checkpoint 实现变更][输出: focused status-panel 行为测试通过][验证: `npx vitest run src/features/status-panel/`] 覆盖 checkpoint panel、view-model、dialog、diff modal 关键路径。
- [x] 8.2 [P0][依赖:8.1][输入: 修改文件列表][输出: `npm run lint && npm run typecheck` 通过][验证: CI 门禁通过] 完成最终质量门禁。
