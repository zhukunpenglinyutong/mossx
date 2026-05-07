## 1. Contract And Data Ownership

- [x] 1.1 [P0][依赖:无][输入: 现有 `status panel` 数据来源与 proposal/design][输出: `CheckpointViewModel` 与 `facts -> verdict -> summary` contract][验证: `npm run typecheck` 且 contract tests/derivation tests 覆盖四态 verdict] 定义固定 schema，明确哪些字段由系统写入、哪些字段允许模型生成。
- [x] 1.2 [P0][依赖:1.1][输入: file changes / tasks / subagents / command/validation 现有事实源][输出: checkpoint 聚合层与 deterministic verdict rules][验证: focused Vitest 覆盖 `running / blocked / needs_review / ready / not_run / not_observed`] 建立真实结论规则，不允许模型单独决定状态。
- [x] 1.3 [P0][依赖:1.1-1.2][输入: canonical file-change contract 与 active change `normalize-conversation-file-change-surfaces`][输出: 复用 canonical file facts 的 checkpoint evidence adapter][验证: focused tests 证明 checkpoint 不再自建平行 `+/-` 统计] 明确与现有 canonical file facts 的共享关系，避免双轨事实源。

## 2. Status Panel UI Replacement

- [x] 2.1 [P0][依赖:1.1-1.3][输入: 现有 `StatusPanel.tsx`、`FileChangesList.tsx`、i18n tab copy][输出: `结果` tab 替换旧 `Edits` tab，并接入折叠/展开双态布局][验证: `npx vitest run src/features/status-panel/components/StatusPanel.test.tsx`] 完成底部 tab 结构替换，保证旧 `Edits` 主语义下线。
- [x] 2.2 [P0][依赖:2.1][输入: `dock` 与 `popover` 两种宿主的现有 status panel 布局][输出: rich `dock` + compact `popover` 的统一 `Checkpoint` 语义][验证: focused tests 覆盖两种宿主不再暴露 legacy `Edits`] 确保两个宿主只在密度上不同，不在语义上分叉。
- [x] 2.3 [P1][依赖:2.1-2.2][输入: 设计文档中的视觉约束][输出: `Verdict / Evidence / Key Changes / Risks / Next Action` 固定骨架 UI][验证: component tests + 人工检查无胶囊式按钮、保持现有 dock 风格] 确保便捷性、易用性与风格一致性落地。
- [x] 2.4 [P1][依赖:1.3,2.1-2.3][输入: file-change canonical facts 与现有 diff/file jump 入口][输出: 文件变化从 primary surface 降级为 secondary detail，但仍保留 review/jump 入口][验证: focused tests 覆盖 file secondary detail 与 review action] 避免丢失原有能力，同时收口冗余。

## 3. Preference, Copy, And Compatibility

- [x] 3.1 [P0][依赖:1.1][输入: `client-ui-visibility` persistence keys 与 settings copy][输出: `bottomActivity.edits -> bottomActivity.checkpoint` 兼容迁移][验证: `npx vitest run src/features/layout/hooks/useLayoutNodes.client-ui-visibility.test.tsx` 或等效 focused tests] 保证老用户隐藏偏好不丢失。
- [x] 3.2 [P1][依赖:2.1-2.2,3.1][输入: zh/en i18n、settings labels、test snapshots][输出: `Edits` 用户文案替换为 `结果/Result`，并更新相关测试][验证: `npm run typecheck` + i18n/status-panel focused tests] 清掉旧模块文案残留，保持语言一致。
- [x] 3.3 [P1][依赖:1.3,2.1][输入: `opencode-mode-ux` 与 active change `normalize-conversation-file-change-surfaces` 的相关 spec/实现约束][输出: checkpoint 与 canonical file facts 的 wording/contract 一致][验证: 相关 focused tests 与 spec sync 检查] 避免一个 change 继续强化 `Edits`，另一个 change 又在下线它。

## 4. Summary Generation And Fallback

- [x] 4.1 [P1][依赖:1.1-1.2][输入: checkpoint facts 与现有可用模型/summary infrastructure][输出: optional summary generation pipeline，受固定 schema 约束][验证: tests 覆盖 model unavailable fallback，不出现伪造 pass 状态] 模型只能写解释层，不得改写 facts/verdict。
- [x] 4.2 [P1][依赖:4.1][输入: risk/next-action ranking rules][输出: 限量 action 建议与 deterministic fallback 文案][验证: focused tests 覆盖 `blocked` 与 `needs_review` 的 action 排序] 保证小白易懂、老手不烦。

## 5. Verification And Cleanup

- [x] 5.1 [P0][依赖:2.1-4.2][输入: 全部实现与 spec delta][输出: focused verification matrix 与更新后的 component tests][验证: `npm run lint && npm run typecheck && npx vitest run <status-panel suites>`] 确认替换后无回归。
- [x] 5.2 [P1][依赖:5.1][输入: 旧 `Edits` 组件与残留引用][输出: 无主路径残留的 legacy `Edits` 语义，必要兼容代码仅保留 persistence alias][验证: `rg -n \"tabEdits|bottomActivityEdits|bottomActivity\\.edits\" src` 结果符合迁移预期] 做最后的收口与卫生清理。
