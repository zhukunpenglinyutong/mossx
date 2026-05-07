## Context

`replace-edits-with-checkpoint` 已交付核心架构：四态判词、三层数据模型、固定 UI 骨架。但实际走查暴露了 7 个一致性问题——从「keyChanges 第一个条目被无条件丢弃」到「commit 按钮无响应」到「compact 模式名存实亡」。

本次设计的目标不是推翻现有架构，而是在同一架构内做 targeted refinement：修复信息丢失、补全交互断链、提升信息密度、细化判决规则。

## Goals / Non-Goals

**Goals:**

- 修复所有已识别的 P0/P1 问题
- 保持 `CheckpointViewModel` schema 兼容
- 继续遵循现有 dock/status panel 视觉约束
- 为 canonical file facts 预留接口但不实现切换

**Non-Goals:**

- 不新增 verdict 状态类型
- 不重构 `CheckpointPanel` 的组件树结构
- 不修改 conversation storage / message schema

## Decisions

### Decision 1：Key Changes 用视觉层级替代切片

`checkpoint.keyChanges.slice(1)` 的原始意图可能是避免在 Key Changes 区域重复 Hero 区已有信息。但实际上 Hero 区只展示 headline + summary，并不渲染 keyChanges 内容。

**选项 A：保留切片，在 Hero 区补渲染 keyChanges[0]**

- 优点：不改变 Key Changes 区域行为
- 缺点：Hero 区信息过载，且 Hero 设计本就不承载文件/Task/Agent 明细

**选项 B：移除切片，Key Changes 区域展示全部条目**

- 优点：信息完整，用户一眼看到所有变更维度
- 缺点：当只有 1 个 keyChange 时，区域略显「单薄」

**选项 C：移除切片，首个 keyChange 使用更大字号/primary 样式**

- 优点：信息完整 + 主次分明
- 缺点：需要新增视觉变体

**采用选项 B**（最小改动），后期可迭代到 C。

### Decision 2：commit action 接入现有 Git 提交流程

当前 `commit` action 只是一个无响应的按钮。本 change 通过 `onCommit` callback prop 将点击事件向上传递，由 StatusPanel 容器层接入已有的 Git commit 流程。

具体：

- `CheckpointPanel` 新增 `onCommit?: () => void` prop
- `StatusPanel` 从 app-shell 获取 commit 入口并传入
- 若 `onCommit` 未提供，commit 按钮不渲染

### Decision 3：compact 模式三区精简

compact 模式（popover）当前与 dock 视觉一致，违背设计文档中「共享语义、不同密度」的约束。

compact 模式变更：

- **保留**：Verdict hero（含 verdict badge + headline + summary）
- **保留**：Evidence compact 卡片（validations + todos/subagents badges）
- **隐藏**：FileChangesList（移至「展开完整结果」入口）
- **隐藏**：Risks（仅在有高风险时显示精简 warning）
- **新增**：「在 dock 中查看完整结果」的展开入口

### Decision 4：Evidence 卡片顶部加一行文件变更摘要

在 validations 列表上方添加一行紧凑摘要：

```
+N/-M across K files  ·  N tasks (M done)  ·  K agents (M done)
```

仅在有对应数据时显示对应部分。此摘要来自 `checkpoint.evidence` 中已有字段，不引入新数据源。

### Decision 5：validations 分组展示

当前 validations 是扁平列表。改为：

```
Required
  tests    ✓ pass
  lint     ✗ not_run   [npm run lint]

Optional
  typecheck  ✓ pass
  build      — not_observed
```

- required/optional 判定来自 `validationProfile`
- 已存在的「一键复制命令」按钮保留在 `not_run` 的 required validation 旁

### Decision 6：Verdict 引入命令严重性判定

当前规则：任何 command error → blocked。改为：

- 命令对应的 validation kind 在 `requiredKinds` 中 → 仍判 blocked
- 命令对应的 validation kind 不在 `requiredKinds` 中 → 降级为 needs_review
- 无法分类的命令（custom）→ 降级为 needs_review

实现：在 `resolveVerdict` 中增加 `failedCommandKind` 参数，对照 `validationProfile.requiredKinds` 判定。

### Decision 7：Summary 策略三处放宽

1. **running 状态允许采纳**：当 verdict 为 running 且摘要不包含「完成/通过/成功」等词汇时，允许模型解释当前进度
2. **放宽 POSITIVE_SUMMARY_HINT**：仅在有 fail/error 事实时拒绝正面摘要，而非一律拒绝
3. **扩展摘要来源**：除 `kind === "review"` 外，也检查最近的 `kind === "message"` 且 `role === "assistant"` 的总结性内容（以 `## Summary` 或 `总结` 开头）

### Decision 8：canonical file facts 桥接

在 `buildCheckpointViewModel` 的输入类型中新增可选参数：

```ts
canonicalFileFacts?: FileChangeSummary[] | null;
```

当该参数存在时，优先使用 canonical facts 构建 fileChanges 相关字段；否则回退到现有 `input.fileChanges`。

本 change 不接入实际 canonical source，仅确保接口兼容。

## Risks / Trade-offs

- [Risk] Verdict 规则调整后可能出现漏判 → Mitigation：保留 `blocked` 优先级最高，仅在非 required 命令失败时降级
- [Risk] compact 模式移除内容后用户找不到文件列表 → Mitigation：在 compact 底部提供显式展开入口
- [Risk] Summary 放宽后可能采纳误导性摘要 → Mitigation：保留 fail/error 事实检查作为硬门禁

## Open Questions

- commit 流程是否沿用现有 `src/features/git/` 下的提交流程，还是需要全局 commit modal？
- compact 模式中 validations 的 `not_run` 命令是否仍然展示（空间有限）？
