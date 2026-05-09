## Context

`replace-edits-with-checkpoint` 已交付核心架构：四态判词、三层数据模型、固定 UI 骨架。本 change 的后续实现已经把 `Checkpoint/结果` 从「聚合 telemetry」收口为「基于当前 workspace 事实的决策面板」。

当前代码事实：

- `StatusPanel` 在 workspace Git facts 可用时，将 `workspaceGitFiles` 转换为 `canonicalFileFacts` 并传入 `buildCheckpointViewModel`
- `CheckpointPanel` 保留 `review_diff` 作为 Next Actions 的真实入口，并通过同一套 checkpoint diff modal 展示文件 diff
- `FileChangesList` 承载 changed-file count、`+/-` 总计、总览 diff 入口与文件行 diff 入口
- Evidence 区域只展示 required / optional validation groups，不重复渲染文件摘要
- `commit` action 打开 `CheckpointCommitDialog`，复用现有 Git commit message、generate message、file selection 与 scoped commit callback

本设计同步这些实现事实，避免 proposal / design / tasks 继续描述早期设想。

## Goals / Non-Goals

**Goals:**

- 保持 `CheckpointViewModel` schema 兼容
- 让 checkpoint 的文件事实优先来自当前 workspace Git working tree
- 让 Evidence 聚焦 validation facts，避免与 FileChangesList 重复
- 保留 `review_diff` 与 `commit` 两类真实 Next Actions
- 通过 commit confirmation dialog 接入已有 Git commit flow
- 放宽 summary 采纳范围，但不让 summary 改写 facts / verdict

**Non-Goals:**

- 不新增 verdict 状态类型
- 不修改 conversation storage / message schema
- 不重做右侧 activity panel
- 不引入第二套 Git staging 或 commit workflow

## Decisions

### Decision 1：Key Changes 不再依赖切片隐藏信息

初版问题来自无条件 `keyChanges.slice(1)`：Hero 区只展示 headline + summary，并不承载 `keyChanges[0]` 的明细，因此切片会造成文件 / task / agent 维度丢失。

采用方案：Key Changes 的数据层保持完整，文件维度在 FileChangesList 中做详细呈现；`buildKeyChanges` 继续产出 files / tasks / agents 的完整摘要。

### Decision 2：文件事实优先使用 workspace Git working tree

`StatusPanel` 将当前 Git working tree 文件映射为 `FileChangeSummary[]`，并作为 `canonicalFileFacts` 传入 `buildCheckpointViewModel`。当 Git facts 存在时，checkpoint evidence、key changes、file list、totals 都使用这组当前事实；Git facts 不存在时才回退到历史 tool fileChanges。

这个选择比只预留接口更直接：用户看到的结果区必须与 Git 区当前工作树一致，避免 stale tool fileChanges 覆盖真实未提交变更。

### Decision 3：Evidence 只展示 validation facts

早期设想是在 Evidence 顶部增加 `+N/-M across K files` 摘要。但当前实现已经把文件数量和 `+/-` 统一放到 FileChangesList。继续在 Evidence 重复展示会降低扫描效率。

采用方案：

- Evidence 渲染 required validation row
- Evidence 渲染 optional validation row
- todos / subagents 用紧凑 badge 展示
- 缺失验证命令只在非 `needs_review` 场景中提示，避免把「需要人工判断」误导成「只要跑命令」

### Decision 4：review diff 保持为真实 Next Action

当前实现保留 `review_diff` action，并由 `handleReviewDiff` 打开 checkpoint diff modal。FileChangesList 也提供总览 diff 和文件行 diff 入口。

这不是双轨 workflow，而是同一能力的两个入口：

- Next Actions 负责决策层的推荐动作
- FileChangesList 负责文件层的就地查看

### Decision 5：commit action 进入可复用确认弹窗

`commit` action 不直接提交。点击后打开 `CheckpointCommitDialog`：

- 复用 app shell 注入的 `commitMessage`
- 复用 `onCommitMessageChange`
- 复用 `onGenerateCommitMessage`
- 复用 `useGitCommitSelection`
- 复用 scoped `onCommit(selectedPaths)`
- commit button 由现有 `CommitButton` 控制 disabled 状态

这样避免在 checkpoint 内实现第二套 staging / commit 语义。

### Decision 6：Verdict 只把 required validation failure 升级为 blocked

判决规则保留 `blocked` 的高优先级，但缩窄触发面：

- failed subagent 仍为 `blocked`
- required validation failure 仍为 `blocked`
- failed command 能分类为 required validation kind 时为 `blocked`
- optional / custom command failure 降级为 `needs_review`

这样可以避免普通读文件、搜索、辅助命令失败把整个结果误判为阻塞。

### Decision 7：Summary 是解释层，不是事实源

Summary 采纳策略同步当前代码：

- `blocked` 不采纳 generated summary
- high severity risk 不采纳 generated summary
- `running` 可采纳 generated summary
- assistant message 只有存在明确 `## Summary` / `## 总结` / `## 摘要` heading 时才可作为 summary source
- 普通 assistant answer 不会被误用为 checkpoint summary
- 正面 summary 在 unsettled evidence 下会被过滤，避免伪造「全部通过 / 可提交」

## Risks / Trade-offs

- [Risk] `review_diff` 同时出现在 Next Actions 与 FileChangesList 入口，可能显得重复。Mitigation：两者指向同一 modal，分别服务决策层与文件层。
- [Risk] Git working tree facts 覆盖历史 tool fileChanges 后，历史消息中的变更可能不再出现在结果区。Mitigation：结果区目标是当前可提交事实，历史解释仍由 conversation timeline 承载。
- [Risk] `needs_review` 隐藏缺失验证命令后，用户可能少一步提示。Mitigation：Next Action hint 明确进入 review，validation groups 仍显示缺失状态。

## Open Questions

- `onExpandToDock` 当前已作为 compact 入口 prop 暴露，但 `StatusPanel` 尚未传入实际切换逻辑；是否要在下一轮把 popover 的「在 dock 中查看完整结果」接到布局状态。
- `CheckpointActionType` 仍保留 `open_risk` / `retry` 类型但当前不生成可见 action；是否要在后续清理类型，还是保留兼容空间。
