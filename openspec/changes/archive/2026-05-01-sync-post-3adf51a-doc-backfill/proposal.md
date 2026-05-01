# Proposal: Backfill OpenSpec Documentation After `3adf51a`

## Why

`3adf51af0ceff9597930e4f85435ef99f4fa96a8..HEAD` 包含多轮功能、修复、质量门禁和提案同步提交。部分能力已经有独立 OpenSpec change 或已归档，但仍存在三类留痕缺口：

- 有代码提交但没有独立提案，例如 Windows user-local CLI install discovery、自定义 slash command 残留、tooltip 残留、空会话回退保护等。
- 有提案但后续补丁扩展了真实边界，例如 Claude plugin skill discovery 后又支持 symlink skill directories，terminal shell path 后又补充示例文案。
- 主 `openspec/specs/**` 与 `.trellis/spec/**` 尚未完全反映最新代码事实，后续 AI 容易按旧 contract 回退。

本 change 只做文档与规范回写，确保从该基准 commit 到当前 HEAD 的行为变更都能追溯到 OpenSpec capability 或 Trellis code-spec。

## 目标与边界

### 目标

- 建立 `3adf51a..HEAD` 的功能变更索引，明确哪些提交已经由既有 change 覆盖，哪些需要补充 delta。
- 为缺失或不完整的行为契约补充 OpenSpec delta specs，并同步必要的主 specs。
- 更新项目快照，让 `openspec/project.md` 反映当前 active changes、capability 数量和最新同步事实。
- 更新 `.trellis/spec/**` 中与最新代码事实相关的 executable contract，尤其是 cross-layer、quality gate、skill discovery、terminal shell 和 conversation lifecycle。

### 边界

- 本 change 不修改产品代码、测试代码、构建脚本或运行时配置。
- 本 change 不归档既有 active changes；只补足文档事实与主 specs。
- 本 change 不替代已有专项 change，例如 `fix-codex-composer-startup-selection-stability`、`fix-sidebar-exited-session-visibility-toggle`、`fix-codex-context-summary-and-history-user-images`。
- 本 change 不为未来计划引入新功能，只记录已经在 `3adf51a..HEAD` 出现的行为事实。

## 非目标

- 不重写 OpenSpec 工作流或目录结构。
- 不清理历史 archive 命名。
- 不修复当前 dirty code 文件。
- 不运行 UI 或 Rust 行为实现改动。

## What Changes

- 新增一个区间追溯 change：`sync-post-3adf51a-doc-backfill`。
- 补充以下能力的 delta specs：
  - `composer-context-project-resource-discovery`
  - `codex-app-server-wrapper-launch`
  - `conversation-lifecycle-contract`
  - `composer-model-selector-config-actions`
  - `workspace-sidebar-visual-harmony`
  - `codex-chat-canvas-user-input-elicitation`
  - `detached-spec-hub-window`
  - `spec-hub-workbench-ui`
  - `workspace-note-card-pool`
  - `composer-note-card-reference`
  - `git-panel-diff-view`
  - `heavy-test-noise-cleanliness`
  - `large-file-modularization-governance`
  - `terminal-shell-configuration`
  - `app-shortcuts`
- 将已实现但未充分留痕的小修复按 capability 合并记录，而不是为每个像素级补丁制造孤立提案。
- 更新主 specs 与 Trellis code-spec，使最新代码事实可被后续 AI 读取。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险 / 成本 | 结论 |
|---|---|---|---|---|
| A | 为每个 commit 单独创建一个 change | 粒度最细 | 44 条非记录提交会制造大量低价值碎片，后续维护成本高 | 不采用 |
| B | 创建一个区间追溯 change，并按 capability 写 delta specs | 能完整留痕，也保持 capability 聚合 | 需要人工认真映射 commit 到能力 | 采用 |
| C | 只改 `CHANGELOG.md` 或 `project.md` | 快速 | 不能作为 OpenSpec contract，后续实现无法验证 | 不采用 |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `composer-context-project-resource-discovery`
- `codex-app-server-wrapper-launch`
- `conversation-lifecycle-contract`
- `composer-model-selector-config-actions`
- `workspace-sidebar-visual-harmony`
- `codex-chat-canvas-user-input-elicitation`
- `detached-spec-hub-window`
- `spec-hub-workbench-ui`
- `workspace-note-card-pool`
- `composer-note-card-reference`
- `git-panel-diff-view`
- `heavy-test-noise-cleanliness`
- `large-file-modularization-governance`
- `terminal-shell-configuration`
- `app-shortcuts`

## Commit Coverage

| Area | Representative commits | Existing change coverage | Backfill action |
|---|---|---|---|
| Codex compaction canvas copy | `536062c` | archived `show-codex-auto-compaction-message` | 主 spec 已有，记录在 project snapshot |
| Missing-session delete idempotency | `5970d73`, `510e737`, `080d52d` | `fix-idempotent-missing-session-delete` | 补 lifecycle stale-list / fallback guard 场景 |
| Git commit scope / preview / visual fixes | `c2bbf53`, `df4709b`, `da9ea37`, `a6770de` | archived git changes | 补 diff panel preview affordance 与 outline 场景 |
| Spec Hub detached reader | `a6dd7b2`, `c2ca9e0`, `3b74b06` | archived `spec-hub-viewer-and-detached-window` | 补 window chrome/maximize button 约束 |
| Workspace note cards | `c277c8a`, `8257af6`, `178accb`, `c60e6d` | archived `add-workspace-note-card-pool` | 补 duplicate/history/image/layout 场景 |
| Composer thread-scoped model selection | `7fbf130`, `33082ce`, `2fc0489`, `28eaec3`, `76632c2`, `6125bba` | `fix-codex-composer-startup-selection-stability` | 已专项覆盖，记录索引 |
| Skill discovery | `9b1b63c`, `f0c3ecc`, `851c105` | `add-claude-plugin-skill-discovery` | 补 symlink + review boundary 场景 |
| Terminal shell path | `9bf3de6`, `5227e43` | `add-configurable-terminal-shell` | 补示例文案与 path guidance 场景 |
| Model refresh stale mapping | `4a49638` | `fix-claude-model-refresh-stale-mapping` | 同步主 spec 场景 |
| AskUserQuestion timeout | `a6b50d1`, `851c105` | `fix-ask-user-question-timeout-settlement` | 同步主 spec 场景 |
| Windows CLI discovery | `13c193d` | none | 补 `codex-app-server-wrapper-launch` 场景 |
| Custom slash command residue | `ac8d246`, `dda268c` | none | 补 app shortcut / composer command cleanup 场景 |
| Completion email turn identity | `c5d725e` | `fix-completion-email-turn-terminal-normalization` | 已专项覆盖，记录索引 |
| Sidebar exited toggle | `3ee7523`, `1be5bc0`, `38f215c` | `fix-sidebar-exited-session-visibility-toggle` | 同步主 spec 场景 |
| Memory summary / history image | `7177533` | `fix-codex-context-summary-and-history-user-images` | 已专项覆盖，记录索引 |
| Quality sentries | `16c68c9`, `b6c0d66` | partial specs exist | 补 noise / large-file 收紧场景 |
| Tooltip residual | `1dcd072` | none | 补 app shortcut tooltip cleanup 场景 |

## 验收标准

- `3adf51a..HEAD` 的所有非记录、非 merge 功能提交 MUST 能在本 proposal coverage 表、已有 OpenSpec change 或新增 delta spec 中找到对应留痕。
- 本 change MUST 只修改文档与规范文件。
- 主 specs MUST 包含本轮补充的已实现行为约束。
- `openspec validate sync-post-3adf51a-doc-backfill --strict` MUST 通过。
- `openspec validate --all --strict` SHOULD 通过；如存在历史 unrelated warning，必须记录。

## Impact

- OpenSpec:
  - `openspec/changes/sync-post-3adf51a-doc-backfill/**`
  - `openspec/specs/**`
  - `openspec/project.md`
- Trellis:
  - `.trellis/spec/**`
- Runtime:
  - 无代码影响。
