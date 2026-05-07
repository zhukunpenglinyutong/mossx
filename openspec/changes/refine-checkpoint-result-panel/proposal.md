## Why

`replace-edits-with-checkpoint` 已成功将底部旧 `Edits` 模块替换为 `Checkpoint/结果`，四态判词（running / blocked / needs_review / ready）和三层数据架构（Facts → Verdict → Summary）都已落地。但在实际走查中发现 7 个影响用户体验的一致性问题，涉及 UI 信息缺失、交互断链、视觉密度不一致、判决规则过于刚性等。

与其把这些零散问题当成 bug 逐个修，不如作为一个统一的「收口 refinement」change，确保 `结果` 模块从「能用」升级到「好用」。

## 目标与边界

### 目标

- 修复 Key Changes 切片逻辑导致的信息丢失问题
- 补全 Next Actions 的交互闭环（`commit` 按钮接入实际提交流程）
- 让 `popover` compact 模式真正差异化，不再与 dock 内容完全相同
- 提升 Evidence 区域的信息密度与可操作性
- 细化 Verdict 判决规则，减少误判
- 放宽模型 Summary 的采纳条件，让 summary 层真正发挥作用
- 为后续接入 canonical file facts（依赖 `normalize-conversation-file-change-surfaces`）预留桥接点

### 边界

- 不改动 `CheckpointViewModel` 的顶层 schema 结构
- 不重做整个 status panel 的 tab 系统
- 不把 `结果` 模块扩展成完整的 CI/CD 面板
- 不引入新的视觉设计语言，继续遵循现有 dock 风格约束
- 不修改 conversation storage schema 或 message 事实源

## 非目标

- 不在本轮接入 `normalize-conversation-file-change-surfaces` 的 canonical file facts（仅预留桥接点）
- 不新增 verdict 状态类型（保持四态）
- 不修改右侧 `session activity` 面板
- 不引入胶囊风格按钮或新的装饰型卡片体系

## What Changes

### 1. Key Changes 切片修复（P0）

- 移除 `CheckpointPanel.tsx` 中 `keyChanges.slice(1)` 的无条件切片
- 若 Hero 区域需要突出首个 keyChange，改为通过视觉层级（primary/secondary）区分，而非直接丢弃

### 2. Next Actions 交互闭环（P0）

- 为 `commit` action 接入实际 Git 提交流程入口
- 移除 `open_risk` / `retry` 类型或在 actions map 中补全其生成逻辑
- 将 `review_diff` 从 panel filter 中放回 visible actions

### 3. popover compact 模式差异化（P1）

- compact 模式下隐藏 FileChangesList 和 Risks 区域
- 仅保留 Verdict + Evidence 精简版 + 「展开完整结果」入口
- 确保两种宿主语义一致，仅在信息密度上不同

### 4. Evidence 信息密度提升（P1）

- 在 evidence 卡片顶部添加 `+N/-M across K files` 的摘要行
- 将 validations 按 required / optional 分组展示
- 为 `not_run` 的 required validation 提供一键复制命令按钮

### 5. Verdict 规则细化（P2）

- 非关键命令（非 required validation 对应的命令）失败降级为 `needs_review`，不再一律判 `blocked`
- 引入命令严重性（severity）判定：命令是否属于 required validation 范畴

### 6. Summary 采纳策略放宽（P2）

- 允许 `running` 状态采纳模型摘要（用于解释正在做什么）
- 放宽 `POSITIVE_SUMMARY_HINT` 正则，仅过滤明显造假（如「全部通过」但 verification 实际为 fail）
- 扩展摘要来源：不仅查 `kind === "review"`，也查最近的 assistant message 中的总结性内容

### 7. canonical file facts 桥接预留（P3）

- 在 checkpoint view-model 构建层预留一个 `canonicalFileFacts` 入口参数
- 当 `normalize-conversation-file-change-surfaces` 落地后，通过该入口切换数据源
- 本 change 不实现实际切换，仅确保接口兼容

## 方案选项与取舍

### 方案 A：逐个修 bug

- 优点：改动最小，风险最低
- 缺点：缺乏整体视角，各修复之间可能产生新的不一致

### 方案 B：整体 refinement change

- 优点：一次对齐所有已知问题，确保各修复之间语义一致
- 缺点：变更面稍大，需要系统回归

**采用方案 B。**

## Capabilities

### Modified Capabilities

- `status-panel-checkpoint-module`：更新 `结果` 模块的 UI 行为、判决规则、summary 策略
- `client-ui-visibility-controls`：compact 模式差异化后需验证 popover 可见性逻辑
- `opencode-mode-ux`：确保 compact 变更不影响 OpenCode 模式下的统一 status panel

## Impact

- Affected code:
  - `src/features/status-panel/components/CheckpointPanel.tsx`
  - `src/features/status-panel/utils/checkpoint.ts`
  - `src/features/status-panel/utils/checkpoint.test.ts`
  - `src/features/status-panel/components/StatusPanel.test.tsx`
  - `src/features/status-panel/types.ts`（轻量）
  - `src/i18n/locales/**`（可能新增少量 key）
- Affected systems:
  - 底部 dock status panel
  - composer 上方 popover status panel
  - 判决引擎（verdict rules）
  - 模型摘要 pipeline
- Dependencies:
  - 依赖于 `replace-edits-with-checkpoint` 已完成的实现
  - 与 `normalize-conversation-file-change-surfaces` 有数据源协调关系（本 change 仅预留桥接）

## 验收标准

- `keyChanges` 在 Key Changes 区域完整展示，不再丢失第一个条目
- `commit` button 点击后能触发实际提交流程入口
- popover compact 模式与 dock 模式在信息密度上有明显差异
- Evidence 区域能看到文件变更摘要行和 required/optional 分组
- 非关键命令失败不再导致 `blocked` 误判
- 模型摘要能在更多场景下生效，且不会伪造状态
- 现有测试套件全部通过，新增 focused tests 覆盖上述变更点
