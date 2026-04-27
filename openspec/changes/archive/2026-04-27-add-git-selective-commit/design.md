## Context

当前右侧 Git 面板已经具备两套重要基础：

- UI 上，`GitDiffPanel` 已有 `staged / unstaged` 双区、`flat / tree` 双视图、文件级 `Stage` / `Unstage` / `Discard` 操作。
- 行为上，commit 仍沿用“如果没有 staged files，但有 unstaged files，就自动 `stageGitAll`”的兜底链路。

issue `#415` 暴露的问题不在于“无法提交”，而在于“提交范围没有被显式建模”。用户希望像 IDEA 一样通过可见的分级 checkbox 决定哪些文件进入本次 commit，而不是把“是否提交”隐藏在右键菜单和隐式 `stage all` 里。

这个问题的约束也很明确：

- 本轮只做 file-level selective commit，不做 hunk / line 级选择。
- 当前 backend 已有 `stage_git_file`、`unstage_git_file`、`commit_git`，优先复用现有 Git index 语义。
- `git status` 允许同一路径同时出现在 `stagedFiles` 与 `unstagedFiles`，因此 design 不能把“文件是否提交”简化成单一 path-level bool。

## Goals / Non-Goals

**Goals**

- 为 Git 面板提供显式、可见的 commit inclusion controls。
- 用最小改动复用现有 Git actions / backend contract，并在前端维护一次仅影响本次提交的 commit scope 状态。
- 移除 commit 时的隐式 `stageGitAll`，让“提交哪些文件”只由显式选择决定。
- 保持 `flat / tree` 视图、文件 diff 浏览、`Stage` / `Unstage` / `Discard` 等现有能力继续稳定可用。
- 让复用同一 commit contract 的其他 surface 也遵守 no-auto-stage 语义，避免一处显式选择、一处静默全提。

**Non-Goals**

- 不实现 hunk-level / line-level partial commit。
- 不新增 `commit_git(paths)` 一类新的 backend commit payload。
- 不把现有 Git 面板重写成新的状态管理架构。
- 不消化所有 Git status edge cases，只保证当前 `staged / unstaged` 双区模型下的行为一致性。

## Decisions

### Decision 1: checkbox 维护独立 commit-scope 状态，但不替换现有 stage/unstage 动作

**Decision**

- Git 面板中的 checkbox 只表达“该 row 当前是否纳入本次 commit scope”。
- 原有 `Stage` / `Unstage` / `Discard` 文件动作继续保留，checkbox MUST NOT 直接替代这些动作。
- commit summary 与 commit button 的 enablement 基于当前 commit scope，而不是直接等价于 staged section。
- commit 执行前允许为 staged-only / unstaged-only 文件做最小的临时 staging orchestration；提交完成后需要尽量恢复原 staged truth。

**Why**

- 用户明确要求“原有 add 加入缓存区的效果不要拿走”，所以 checkbox 不能吃掉已有 stage/unstage 交互。
- 只在 commit 前做临时 orchestration，可以保住现有 backend contract，同时避免把 checkbox 直接绑死在 Git index 上。
- 这样可以让“旧能力保留”和“显式选择本次提交范围”同时成立。

**Alternatives considered**

- 让 checkbox 直接调用 `stageGitFile` / `unstageGitFile`：被拒绝，因为会覆盖掉用户原本对 stage/unstage 的操作心智。
- 新增 `commit_git(paths)`：被拒绝，因为会把一次 UI 增强升级为 backend contract 重构。

### Decision 2: selective commit 采用 section-scoped 语义，不跨 `staged / unstaged` 合并重复路径

**Decision**

- 同一路径如果同时存在于 `staged` 与 `unstaged`，UI 继续保留两条 row，各自代表不同的 Git state。
- checkbox 的含义按 section 解释：
  - `staged` 区勾选 = 该路径当前 staged 部分仍纳入本次 commit
  - `unstaged` 区勾选 = 该路径的 unstaged-only 改动纳入本次 commit scope
- tree 模式的父级 tri-state 和批量勾选只在当前 section 内生效，不跨 section 合并。

**Why**

- `git status` 的 staged / unstaged 双存在通常意味着 partial staged；如果强行合成单一路径 checkbox，会丢掉这一层语义。
- section-scoped 规则能让“已有 partial staged 语义不被 UI checkbox 覆盖”保持自然成立。

**Alternatives considered**

- 把重复路径折叠成单一路径节点：被拒绝，因为会掩盖 partial staged 状态。
- 父级 checkbox 跨 section 同步：被拒绝，因为会让 tree 的勾选副作用难以预测。

### Decision 3: tree tri-state 采用派生状态，而不是持久化目录选择状态

**Decision**

- folder checkbox 的 `none / partial / all` 由当前 section 的 descendant file staged 状态派生。
- 目录节点本身不持久化独立“已选择”字段；切换 `flat / tree` 时只读取当前文件集合重新计算。

**Why**

- 目录不是 Git 实体，持久化目录选择状态会引入额外同步问题。
- 视图切换后重算可直接继承 staged/unstaged 真值，避免 flat/tree 两套状态不一致。

**Alternatives considered**

- 持久化 folder selection map：被拒绝，因为会与文件级真实状态重复。

### Decision 4: commit controller 移除隐式 `stageGitAll`，并允许按 commit scope 做临时准备

**Decision**

- `useGitCommitController` 与 `GitHistoryWorktreePanel` 的 commit 入口统一移除 auto-stage-all fallback。
- 主 Git 面板允许基于 commit scope 选择 staged-only / unstaged-only 文件，并在提交前做最小临时准备。
- 次级 worktree commit surface 仍保持“没有 staged files 就 disabled”的更保守语义，但 MUST NOT 再静默 `stageGitAll`。

**Why**

- issue 的核心就是去掉“用户没有明确选择，但系统帮你全提”的危险默认行为。
- 主面板需要支持“checkbox 只影响 commit”，因此 controller 不能继续假设 commit scope 等于 staged section。
- 共享 surface 至少要统一到“不自动 stage 全部改动”这一底线。

**Alternatives considered**

- 保留 auto-stage-all 作为 fallback：被拒绝，因为仍会制造误提交。
- 在 commit 时弹确认框提示“将提交全部改动”：被拒绝，因为仍然是把 commit scope 放到最后一步才暴露。

### Decision 5: 复用现有 file actions，并为批量勾选保留非破坏性扩展空间

**Decision**

- 单文件 `Stage` / `Unstage` / `Discard` 继续走现有 action。
- checkbox 与 folder / section bulk toggle 只维护 commit scope，不直接替代这些 action。
- commit controller 在真正提交前按 scope 做最小临时 orchestration；如果后续发现这条链路性能不足，再补 additive helper，但本轮 design 不要求新增 backend contract。

**Why**

- 这能最小化 backend 影响面，把本轮工作聚焦在 UI 与 commit gating。
- 当前 staged/unstaged 文件数量通常有限，先用现有动作加最小 orchestration 验证交互最稳。

## Risks / Trade-offs

- [Risk] 批量勾选通过多次 `stage/unstage` 调用完成，可能在大变更集下带来可感知延迟
  - Mitigation: 首轮允许顺序调用；若性能不够，再补批量 helper，但不先引入额外复杂度。

- [Risk] 同一路径同时出现在 `staged` 与 `unstaged` 时，用户可能一开始不理解双 row 语义
  - Mitigation: 保留 section 标签和状态色，并在 spec 中明确 partial staged contract；必要时补轻量提示文案。

- [Risk] 不同 commit surface 只改一处会造成语义漂移
  - Mitigation: 统一把 no-auto-stage contract 写入 spec，并要求共享 surface 同步收敛。

- [Trade-off] 这次不会得到 hunk-level 的细粒度提交体验
  - 这是有意取舍。本轮目标是先把“按文件选择提交”补完整，而不是把 Git 客户端能力一步做满。

## Migration Plan

1. 先在 OpenSpec 中固定 no-auto-stage selective commit contract。
2. 前端为 `GitDiffPanel` 增加 file / folder / section 级 checkbox，并保留现有 stage/unstage actions。
3. 同步收紧 commit controller，移除 auto-stage-all fallback，并补临时 commit-scope orchestration。
4. 对共享 worktree commit surface 做语义对齐，避免旧入口残留“静默全提”。
5. 用 targeted tests + 基础质量门禁验证 flat/tree、partial staged、commit gating 三类关键路径。

本变更不涉及持久化 schema 迁移，也不涉及 backend data migration。回滚策略也简单：若新交互存在回归，可先回退 checkbox surface，同时保留 no-auto-stage gate 或分步回退。

## Open Questions

- 是否需要在同一路径同时出现在 `staged` 与 `unstaged` 时增加明确的 `Partially staged` 辅助提示？
- section / folder bulk toggle 若命中文件数很多，是否需要 loading/progress 反馈以避免用户误判为未响应？
