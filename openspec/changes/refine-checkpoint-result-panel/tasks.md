## 1. Key Changes 切片修复

- [ ] 1.1 [P0][依赖:无][输入: `CheckpointPanel.tsx:279` `keyChanges.slice(1)`][输出: 完整渲染全部 keyChanges][验证: component tests 覆盖 1/2/3 个 keyChange 场景] 移除无条件切片，展示所有 keyChange 条目。

## 2. Next Actions 交互闭环

- [ ] 2.1 [P0][依赖:无][输入: `CheckpointPanel.tsx` 现有 action row][输出: `onCommit` callback prop 并向上传递][验证: focused tests 覆盖 commit 按钮点击触发 callback] 接入 Git 提交流程入口。
- [ ] 2.2 [P1][依赖:2.1][输入: `buildNextActions` map 与 panel filter][输出: `review_diff` 在 action row 可见][验证: component tests 覆盖 action row 包含 review_diff] 清理 `review_diff` 的双重过滤。

## 3. popover compact 差异化

- [ ] 3.1 [P1][依赖:1.1][输入: `CheckpointPanel` compact prop][输出: compact 模式三区精简布局][验证: focused tests 覆盖 compact 不渲染 FileChangesList 和 Risks] 实现信息密度差异化。
- [ ] 3.2 [P1][依赖:3.1][输入: compact 模式底部][输出: 「在 dock 中查看完整结果」展开入口][验证: tests 覆盖入口可点击且切换 dock 后内容完整] 确保 compact 不丢失能力。

## 4. Evidence 信息密度提升

- [ ] 4.1 [P1][依赖:无][输入: `checkpoint.evidence` 现有字段][输出: evidence 卡片顶部变更摘要行][验证: focused tests 覆盖摘要文案] 添加 `+N/-M across K files` 摘要。
- [ ] 4.2 [P1][依赖:4.1][输入: `validationProfile.requiredKinds` / `visibleKinds`][输出: validations 按 required/optional 分组][验证: tests 覆盖分组渲染逻辑] 分组展示 validations。

## 5. Verdict 规则细化（P2）

- [ ] 5.1 [P2][依赖:无][输入: `resolveVerdict` 与 `validationProfile`][输出: 非 required 命令失败降级为 needs_review][验证: focused checkpoint tests 覆盖 command severity 判定] 细化 blocked 触发条件。

## 6. Summary 采纳策略放宽（P2）

- [ ] 6.1 [P2][依赖:无][输入: `shouldUseGeneratedSummary`][输出: running 状态允许采纳][验证: tests 覆盖 running + summary 场景] running 状态放宽。
- [ ] 6.2 [P2][依赖:6.1][输入: summary 来源查找逻辑][输出: 扩展至 assistant message 总结段落][验证: tests 覆盖多种 summary 来源] 扩展摘要来源。
- [ ] 6.3 [P2][依赖:6.1-6.2][输入: `POSITIVE_SUMMARY_HINT` 正则][输出: 仅在有 fail/error 时拒绝正面摘要][验证: tests 覆盖边界条件] 放宽正面摘要过滤。

## 7. canonical file facts 桥接预留（P3）

- [ ] 7.1 [P3][依赖:无][输入: `buildCheckpointViewModel` 参数][输出: `canonicalFileFacts` 可选参数][验证: typecheck + tests 覆盖 fallback 行为] 预留参数接口。

## 8. 回归验证

- [ ] 8.1 [P0][依赖:1.1-7.1][输入: 全部实现变更][输出: 全量 status-panel 测试通过][验证: `npx vitest run src/features/status-panel/`] 完善回归。
- [ ] 8.2 [P0][依赖:8.1][输入: 修改文件列表][输出: `npm run lint && npm run typecheck` 通过][验证: CI 门禁通过] 质量门禁。
