## Why

`replace-edits-with-checkpoint` 已成功将底部旧 `Edits` 模块替换为 `Checkpoint/结果`，四态判词（running / blocked / needs_review / ready）和三层数据架构（Facts → Verdict → Summary）都已落地。但在实际走查与后续实现中发现，`结果` 模块需要从初版「聚合 telemetry」进一步收口为「基于当前 workspace 事实的决策面板」。

本 change 回写当前代码事实：`Checkpoint` 已优先消费 Git working tree facts，文件变化列表成为 `+/-` 汇总与持久 diff 入口；Evidence 只保留 required / optional validation groups；Next Actions 中的 `review_diff` 是真实可点击入口；commit action 打开可复用确认弹窗，而不是静默提交。

## 目标与边界

### 目标

- 修复 Key Changes 切片逻辑导致的信息丢失问题
- 补全 Next Actions 的交互闭环（`commit` 按钮打开可复用 commit confirmation dialog）
- 让 `popover` compact 模式真正差异化，不再与 dock 内容完全相同
- 提升 Evidence 区域的信息密度与可扫读性，同时避免重复展示文件统计
- 细化 Verdict 判决规则，减少误判
- 放宽模型 Summary 的采纳条件，让 summary 层真正发挥作用
- 优先使用 workspace Git working tree facts 作为 checkpoint 的 canonical file facts

### 边界

- 不改动 `CheckpointViewModel` 的顶层 schema 结构
- 不重做整个 status panel 的 tab 系统
- 不把 `结果` 模块扩展成完整的 CI/CD 面板
- 不引入新的视觉设计语言，继续遵循现有 dock 风格约束
- 不修改 conversation storage schema 或 message 事实源

## 非目标

- 不重做 `normalize-conversation-file-change-surfaces` 的消息区 canonical file-change contract
- 不新增 verdict 状态类型（保持四态）
- 不修改右侧 `session activity` 面板
- 不引入胶囊风格按钮或新的装饰型卡片体系

## What Changes

### 1. Key Changes 切片修复（P0）

- 移除 `CheckpointPanel.tsx` 中 `keyChanges.slice(1)` 的无条件切片
- 若 Hero 区域需要突出首个 keyChange，改为通过视觉层级（primary/secondary）区分，而非直接丢弃

### 2. Next Actions 交互闭环（P0）

- `commit` action 在存在 committable Git changes 且上层提供 `onCommit` 时可见
- 点击 `commit` 打开 `CheckpointCommitDialog`，复用现有 Git commit message state、commit message generation callback、file selection 与 scoped commit callback
- commit dialog 必须在 commit message 非空且至少选择一个文件后才允许提交
- `open_risk` / `retry` 不再作为可见 action 暴露；风险信息留在 Risks 区域
- `review_diff` 保持为 Next Actions 中的真实入口，点击后打开同一套 checkpoint diff modal
- FileChangesList 同时提供总览 diff 入口与文件行 diff 入口，确保用户在文件变化区也能进入 review flow

### 3. popover compact 模式差异化（P1）

- compact 模式下隐藏 FileChangesList 和 Risks 区域
- 仅保留 Verdict + Evidence 精简版 + 「在 dock 中查看完整结果」入口
- 确保两种宿主语义一致，仅在信息密度上不同

### 4. Evidence 信息密度提升（P1）

- Evidence 区域只展示 validation facts，不重复展示文件数量与 `+/-` 摘要
- 文件数量与 `+/-` 总计统一由 FileChangesList 承载
- 将 validations 按 required / optional 分组展示
- 为 `not_run` 且有可解析命令的 validation 提供一键复制命令按钮
- `needs_review` 场景下不强推验证命令，避免把缺验证状态误导成唯一下一步

### 5. Verdict 规则细化（P2）

- 非关键命令（非 required validation 对应的命令）失败降级为 `needs_review`，不再一律判 `blocked`
- 引入命令严重性（severity）判定：命令是否属于 required validation 范畴
- `custom` 命令失败保留为 evidence / risk，但不直接升级为 `blocked`

### 6. Summary 采纳策略放宽（P2）

- 允许 `running` 状态采纳模型摘要（用于解释正在做什么）
- 放宽正面摘要过滤，仅在当前 verdict / risk 仍未 settled 且摘要暗示「全部通过 / 可提交」时拒绝
- 扩展摘要来源：不仅查 `kind === "review"`，也查最近 assistant message 中以 `## Summary` / `## 总结` / `## 摘要` 标题标记的总结段落
- 普通 assistant answer 不会被当作 checkpoint summary，避免把最新回复误用为结果判词

### 7. canonical file facts 接入（P1）

- `buildCheckpointViewModel` 支持 `canonicalFileFacts?: FileChangeSummary[] | null`
- `StatusPanel` 在 workspace Git facts 可用时，将 current working tree files 转换为 checkpoint canonical facts
- checkpoint evidence、key changes 与 file list 优先使用同一组 workspace Git facts
- stale historical tool fileChanges 不得覆盖当前 Git working tree facts

## 方案选项与取舍

### 方案 A：逐个修 bug

- 优点：改动最小，风险最低
- 缺点：缺乏整体视角，各修复之间可能产生新的不一致

### 方案 B：整体 refinement change

- 优点：一次对齐所有已知问题，确保各修复之间语义一致
- 缺点：变更面稍大，需要系统回归

**采用方案 B。**

### 实现收口原则

- 文件事实以当前 workspace Git working tree 为优先来源；没有 Git facts 时才回退到历史 tool fileChanges。
- Evidence 只回答「验证是否通过 / 是否缺失」，文件变化详情交给 FileChangesList。
- Next Actions 只保留少量真实动作；`review_diff` 打开 checkpoint diff modal，`commit` 进入确认弹窗。
- Summary 是解释层，不能改写 verdict，也不能把普通 assistant answer 当成可靠结论。

## Capabilities

### Modified Capabilities

- `status-panel-checkpoint-module`：更新 `结果` 模块的 UI 行为、判决规则、summary 策略与 Git-backed file facts contract
- `client-ui-visibility-controls`：compact 模式差异化后需验证 popover 可见性逻辑
- `opencode-mode-ux`：确保 compact 变更不影响 OpenCode 模式下的统一 status panel

## Impact

- Affected code:
  - `src/features/status-panel/components/CheckpointPanel.tsx`
  - `src/features/status-panel/components/CheckpointCommitDialog.tsx`
  - `src/features/status-panel/components/FileChangesList.tsx`
  - `src/features/status-panel/utils/checkpoint.ts`
  - `src/features/status-panel/utils/checkpoint.test.ts`
  - `src/features/status-panel/components/StatusPanel.test.tsx`
  - `src/features/status-panel/components/StatusPanel.tsx`
  - `src/features/status-panel/types.ts`（轻量）
  - `src/i18n/locales/**`（可能新增少量 key）
- Affected systems:
  - 底部 dock status panel
  - composer 上方 popover status panel
  - 判决引擎（verdict rules）
  - 模型摘要 pipeline
  - Git working tree file facts / scoped commit flow
- Dependencies:
  - 依赖于 `replace-edits-with-checkpoint` 已完成的实现
  - 与 `normalize-conversation-file-change-surfaces` 有数据源协调关系；本 change 优先对齐 workspace Git facts，不重做消息区 file-change contract

## 验收标准

- `keyChanges` 在 Key Changes 区域完整展示，不再丢失第一个条目
- `commit` button 点击后打开 commit confirmation dialog，并复用 Git commit message、file selection、generate message 与 scoped commit callback
- commit dialog 的最终提交按钮在 commit message 为空或未选中文件时保持 disabled
- popover compact 模式与 dock 模式在信息密度上有明显差异
- Evidence 区域展示 required/optional validation groups，且不重复展示 changed-file count / `+/-` 文件摘要
- 文件变化区展示 changed-file count、`+/-` 总计、文件级 diff 入口和总览 diff 入口
- Next Actions 中的 `review_diff` 可见且能打开 checkpoint diff modal
- 非关键命令失败不再导致 `blocked` 误判
- 模型摘要能在 running 与明确 summary heading 场景下生效，且普通 assistant answer 不会被误采纳
- workspace Git facts 可用时，checkpoint evidence、key changes 与 file list 使用同一组当前 working tree facts
- 现有测试套件全部通过，新增 focused tests 覆盖上述变更点
