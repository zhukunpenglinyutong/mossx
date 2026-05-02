# Design: Backfill OpenSpec Documentation After `3adf51a`

## Context

本次不是新增产品行为，而是把已经进入代码库的行为事实回写到规范系统。输入事实来自：

- `git log 3adf51af0ceff9597930e4f85435ef99f4fa96a8..HEAD`
- 既有 active changes 与 archived changes
- 当前 `openspec/specs/**`
- 当前 `.trellis/spec/**`

设计核心是“按 capability 聚合，而不是按 commit 碎片化”。一个小修复如果只是强化已有能力，就写进对应 capability 的 delta spec；只有无法归属的行为才在本追溯 change 中新增 delta 场景。

## Goals

- 让每个功能提交都有可追溯的 behavior contract。
- 避免把像素级修复、文案补丁、测试门禁修复拆成几十个低价值 changes。
- 将后续 AI 最容易误回退的 contract 写进主 specs。
- 保持文档变更原子化，不触碰 runtime code。

## Non-Goals

- 不调整代码实现。
- 不重跑或重写已有专项 change 的归档。
- 不改变 OpenSpec CLI schema。
- 不补写每个 Trellis journal 细节。

## Decisions

### Decision 1: Use One Range Backfill Change

采用 `sync-post-3adf51a-doc-backfill` 承载本次区间追溯。

原因：

- 该区间包含多轮 PR merge 与已有专项 change，单 commit change 会重复。
- 本任务的目标是留痕，不是拆分新开发工作。
- 一个区间 change 可以形成清晰 coverage table，降低遗漏风险。

### Decision 2: Group Small Fixes Into Existing Capabilities

例如 tooltip 残留、Git 选择框描边、Spec Hub maximize button，这些不应各自成为新 capability。它们分别归入：

- `app-shortcuts`
- `git-panel-diff-view`
- `detached-spec-hub-window`

这样后续实现者查能力规范时能看到真实边界，而不会在 archive 中寻找孤立小修补。

### Decision 3: Keep Existing Active Changes Active

本轮不归档 `fix-sidebar-exited-session-visibility-toggle`、`fix-codex-context-summary-and-history-user-images` 等 active changes。原因是用户要求“回写和更新”，不是执行归档闭环；且归档会移动文件，扩大 diff。

### Decision 4: Update Trellis Specs Only For Executable Rules

`.trellis/spec/**` 只记录后续 AI 写代码时必须执行的 code-level contract，例如：

- skill discovery source priority and symlink handling
- terminal shell path setting boundary
- conversation deletion / stale list guard
- quality sentry enforcement

不把 changelog 风格内容写进 code-spec。

## Validation Strategy

- `openspec validate sync-post-3adf51a-doc-backfill --strict`
- `openspec validate --all --strict`
- `git diff --check`
- 手动检查 `git status --short`，确保未触碰 runtime code。

## Rollback

本 change 只新增/修改文档。若需要回滚，可删除 `openspec/changes/sync-post-3adf51a-doc-backfill/` 并还原本轮主 specs / Trellis specs / project snapshot diff。
