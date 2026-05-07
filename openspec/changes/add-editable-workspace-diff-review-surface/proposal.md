## Why

当前产品里已经有多个 `git diff` 审查入口，但它们大多停留在只读 patch viewer：用户看完差异后，如果想顺手修一两行，还得退出 diff、重新打开文件、再自己定位改动位置。对 AI 调试与人工复核这种高频 `review -> tweak -> recheck` 闭环来说，这条链路过长，而且会打断判断节奏。

这个问题现在值得单独立项，因为仓库里已经同时具备两块成熟底座：`GitDiffViewer` 负责差异审查，`FileViewPanel` 负责文本编辑、保存与 changed-line markers。下一步不是再造一个全新的 diff editor，而是把这两条现有能力接成一个共享的 workspace-backed review surface，并参考 IntelliJ IDEA 的“边看 diff 边改当前文件”体验，把最常见的修补动作拉回 diff 现场完成。

## 目标与边界

### 目标

- 为当前 workspace working tree 的 diff 审查面提供直接编辑与保存能力。
- 首批覆盖当前 workspace-backed 的 review surfaces：
  - 主 Git diff panel
  - 底部 `结果 / Checkpoint` 的 review diff 入口
  - 右侧 `workspace session activity` 的 diff review 入口
- 保持“review context 仍在场”的交互原则：用户在编辑时不需要先离开 diff 审查面。
- 复用现有 `FileViewPanel`、`readWorkspaceFile`、`writeWorkspaceFile`、`getGitFileFullDiff` 和 line-marker 能力，而不是平行再做一套保存链路。
- 保存后在当前 review flow 内刷新文件 diff、`+/-` 统计和 changed-line markers。

### 边界

- 仅支持 **workspace-backed、当前工作树、可写文本文件** 的 diff 编辑。
- 仅当 review target 能稳定映射到当前 workspace 实际文件时，才允许进入 editable mode。
- binary / image / pdf / preview-only document 继续只读。
- 项目外绝对路径、external spec 文件、只读 surface 继续沿用既有只读策略。

## 非目标

- 不在第一阶段支持 commit-to-commit、PR compare、历史快照、rewind review 等 **历史基线 diff** 的直接编辑。
- 不在第一阶段重做完整 `3-way merge` 或 IntelliJ 那种全功能 merge editor。
- 不顺带引入 auto-stage、auto-commit、auto-apply-patch 或新的 Git backend 写入协议。
- 不为每个 diff surface 各自复制一套 editor / save / refresh 逻辑。

## What Changes

- 新增一个共享 capability：`editable-workspace-diff-review-surface`，定义哪些 diff 可以编辑、哪些必须只读，以及 save/refresh/dirty-state 的统一契约。
- 为 in-scope 的 workspace-backed diff 审查面增加 `Edit` 进入路径，让用户可以在 review shell 内直接修改当前文件。
- 让 review shell 复用现有 `FileViewPanel` 编辑能力，同时保留文件 rail、diff 上下文或 changed-line review affordance。
- 为不满足条件的 review target 提供明确的只读退化语义，而不是让用户误以为所有 diff 都可改。
- 保存成功后触发同一上下文内的 diff refresh / git status refresh，避免用户改完还得手动退出再重新看结果。
- 保持现有“打开文件”“查看全文 diff”“切换 split/unified”等只读审查能力继续可用；编辑能力是增强，不是替换。

## 方案选项与取舍

### 方案 A：继续保持只读 diff，只新增 `Open in editor` 快捷入口

- 优点：实现最便宜，风险最小。
- 缺点：仍然不是在 diff 区域直接修改，本质上只是把“退出 diff 再去编辑”的路径缩短半步，解决不了你提出的核心问题。

### 方案 B：新增共享 review shell，在同一审查面内复用现有文件编辑器

- 优点：最符合当前代码库现状。可以复用 `FileViewPanel` 的文本编辑、保存、dirty state、line markers，同时保住 `GitDiffViewer` 的审查上下文与文件 rail。
- 缺点：需要仔细定义 editable / read-only eligibility，以及 save 后的 refresh contract。

### 方案 C：直接把 `GitDiffViewer` 重写成完整可编辑 diff / merge editor

- 优点：最接近 IntelliJ IDEA 的“左右对比并直接编辑”终态。
- 缺点：会复制现有 editor / save / preview 基础设施，第一阶段实现与回归成本明显过高，也容易把多个 surface 一起拖进高风险重构。

**采用方案 B。**

第一阶段优先对齐 IntelliJ IDEA 的核心体验目标，而不是 1:1 复刻其完整 merge engine：用户应能在 diff 审查现场直接改当前文件，但实现上优先复用现有文件编辑器与保存链路。

## Capabilities

### New Capabilities

- `editable-workspace-diff-review-surface`: 定义共享的 workspace-backed editable diff review contract，包括 eligibility、read-only fallback、layout 结构、dirty/save 语义、diff refresh 与 marker continuity。

### Modified Capabilities

- `git-panel-diff-view`: 主 Git diff panel 的 workspace review flow 需要支持进入共享 editable review mode，同时保持 flat/tree、single-file focus、full diff 与现有 Git 操作语义。
- `opencode-mode-ux`: 底部 `结果 / Checkpoint` 的 `review diff` 入口需要在 workspace-backed file changes 上支持 editable review mode，并在非可写 target 上继续只读。
- `codex-chat-canvas-workspace-session-activity-panel`: 右侧 activity panel 的 file-change diff review 需要复用共享 editable review surface，而不是永远停留在只读 patch modal。

## 验收标准

- 用户从主 Git diff panel、`结果 / Checkpoint`、右侧 activity panel 进入 **workspace-backed 文本 diff** 时，MUST 能在不离开 review surface 的前提下直接编辑当前文件。
- 保存动作 MUST 复用现有文件写入链路，并在当前 review flow 内刷新对应文件 diff 与相关 `+/-` 统计。
- 当文件 diff 已被用户修平或显著变化时，review surface MUST 更新 changed-line markers 或清空过期 markers，而不是继续高亮旧行号。
- 不满足 editable 条件的 target MUST 明确保持只读，并给出稳定的 read-only reason；不得静默失去按钮或表现异常。
- 用户在 review surface 中存在未保存修改时，系统 MUST 沿用现有 dirty-state 保护或等效保护，不能因切文件或关窗而静默丢内容。
- commit history、PR compare、rewind review、外部绝对路径文件等 out-of-scope surfaces MUST 继续只读，不得被这次改动误伤成可写。

## Impact

- Affected frontend:
  - `src/features/git/components/GitDiffViewer.tsx`
  - `src/features/git/components/GitDiffPanel.tsx`
  - `src/features/files/components/FileViewPanel.tsx`
  - `src/features/app/hooks/useGitPanelController.ts`
  - `src/features/status-panel/components/CheckpointPanel.tsx`
  - `src/features/session-activity/components/WorkspaceSessionActivityPanel.tsx`
- Shared contracts / services:
  - `src/services/tauri.ts` 的 `readWorkspaceFile` / `writeWorkspaceFile` / `getGitFileFullDiff`
  - changed-line marker / diff refresh / open-file routing helpers
- Dependencies:
  - 不要求新增第三方 editor 或 diff library，优先复用现有 CodeMirror / file-view stack。
