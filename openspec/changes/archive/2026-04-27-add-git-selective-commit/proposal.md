## Why

issue `#415` 反映的不是“Git 面板缺少提交能力”，而是提交范围不够可控。当前项目主区右侧 Git 面板虽然已经支持 `stage/unstage`，但用户想按文件挑选本次 commit 内容时，仍然缺少像 IDEA 那样直观的 checkbox 分层选择体验。

更关键的是，当前 commit 主链路在“没有 staged files、但存在 unstaged files”时会自动执行 `stageGitAll`，导致 `Commit` 在很多场景下实际等价于“把所有改动一起提交”。这会让“本次到底提交哪些文件”变成隐式行为，增加误提交风险，也与用户对 IDE Git 面板的预期不一致。因此需要把“选择提交范围”从隐藏前置动作升级为显式产品能力。

## 代码核对状态（2026-04-24）

- `src/features/git/components/GitDiffPanel.tsx` 已具备 staged / unstaged 双区展示、tree / flat 两种列表模式，以及文件级 `Stage` / `Unstage` / `Discard` 操作。
- `GitDiffPanel` 已有多选基础（`Cmd/Ctrl` / `Shift` 选择、context menu 批量操作），但这些选择当前服务于 diff 浏览和右键动作，不直接定义 commit scope。
- `src/features/app/hooks/useGitCommitController.ts` 的 `ensureStagedForCommit()` 与 `src/features/git-history/components/GitHistoryWorktreePanel.tsx` 的 `handleCommit()` 都会在“无 staged、有 unstaged”时调用 `stageGitAll()`，把 commit 自动降格为“提交全部改动”。
- 代码库内未看到与“checkbox 选择提交文件”“父子级半选状态”“按所选文件提交”对应的现有 contract，因此这仍是明确缺失的产品能力，而不是单纯文案或样式问题。

## 目标与边界

### 目标

- 为项目主区右侧 Git 面板补齐显式的“本次提交包含哪些文件”交互，让用户无需依赖隐式 staging 心智也能安全提交。
- 提供类似 IDEA 的分级 checkbox 体验：文件可单选/多选，目录节点可反映 `none / partial / all` 状态，并能批量切换后代文件。
- 让 commit 行为变得可预测：只有明确纳入本次提交范围的文件才会被提交，不再因为用户点击 `Commit` 就静默 `stage all`。
- 保持现有 diff 浏览、tree/flat 切换、文件级 stage/unstage/discard 能力继续可用，不因选择提交范围而回退已有 Git 操作能力。

### 边界

- 本轮只解决“按文件选择提交”，不进入 hunk / line 级 partial commit。
- 本轮优先复用现有 `stage_git_file` / `unstage_git_file` / `commit_git` 语义，通过前端 commit-scope 状态与提交前临时 orchestration 来实现“只影响本次提交”，而不是立刻引入新的按路径 commit backend contract。
- 主目标是项目主区右侧 Git 面板；若仓库内其他 commit surface 复用同一套 commit contract，则应保持语义一致，但不强制本轮重做整个 Git History 工作区结构。
- 本轮不改 push / pull / sync / revert / cherry-pick 等其他 Git 写操作。

## 非目标

- 不实现 chunk-level 或 line-level staging。
- 不重做提交信息生成（AI commit message）流程。
- 不把当前 Git 多选逻辑整体替换成一套全新的 selection framework。
- 不新增 backend `commit_git(paths)` 一类新的提交 payload，也不把现有 Git 面板重写成全新的状态管理架构。

## What Changes

- 在右侧 Git diff 面板中新增显式 commit-scope checkbox：
  - 文件行提供“是否纳入本次提交”的可见切换控件。
  - tree 模式下目录节点提供分级 checkbox，并反映 `none / partial / all` 三态。
  - section / group 头部提供快速全选、清空或批量纳入本区文件的能力。
  - 原有 `Stage` / `Unstage` / `Discard` 文件动作继续保留，checkbox 只影响当前 commit scope。
- 调整 commit 执行语义：
  - `Commit` 只针对用户明确纳入范围的文件。
  - 当没有任何文件被纳入提交范围时，commit 按钮 MUST disabled，并给出明确提示，而不是静默提交全部改动。
  - 当前“无 staged 时自动 `stageGitAll`”的兜底逻辑需要退出主链路，避免用户在未确认范围时一次性提交全部改动。
- 明确 UI 反馈：
  - commit 区域需要显示本次将提交多少文件，降低“看不出当前 commit scope”的认知负担。
  - flat / tree 模式切换后，纳入提交范围的状态必须保持一致，不能因为展示模式切换丢失或错乱。
- 对复用同一提交语义的次级面板保持一致性：
  - 若 `GitHistoryWorktreePanel` 等 surface 继续复用“当前工作区提交未提交改动”的 contract，则其 commit gating 也不能保留“静默 stage all”语义。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 保留当前 implicit `stage all`，只补文案提示或 tooltip | 改动最小 | 没有真正解决“无法明确选择提交哪些文件”，误提交风险仍在 | 不采用 |
| B | 新增显式 checkbox 选择交互，但保留现有 `stage/unstage` 文件动作，并在 commit 前做最小临时 orchestration | 后端改动最小，旧能力不回退，checkbox 只影响 commit，用户心智更稳定 | 需要额外处理 staged-only / unstaged-only / partial staged 三类文件的前端编排 | **采用** |
| C | 新增 backend `commit_git(paths)` 或临时 index 机制，彻底绕过现有 staged/unstaged 模型 | 能提供更自由的 commit-scope 抽象 | contract 变更更大，验证面更广，容易把一个 UI 增强做成 Git 提交语义重构 | 本轮不采用 |

## Capabilities

### New Capabilities

- `git-selective-commit`: 定义 Git 面板按文件选择提交的显式交互、分级 checkbox、commit gating 与“只提交纳入范围文件”的行为契约。

### Modified Capabilities

- `git-panel-diff-view`: 变更文件列表除了 diff 浏览与 stage/unstage 操作外，还必须承载 commit-scope 选择语义，并在 flat/tree 两种视图下保持一致。

## 验收标准

- 用户在项目主区右侧 Git 面板中 MUST 能明确看到每个文件是否会被纳入本次提交，而不是靠猜测 staged/unstaged 或点击后才发现结果。
- tree 模式下，目录节点 MUST 支持 `none / partial / all` 三态反映；父节点切换 MUST 正确联动其后代文件。
- flat 模式下，文件行 MUST 提供直接的纳入/排除提交切换，不要求用户必须进入右键菜单才能完成本次提交范围选择。
- 当没有任何文件被纳入提交范围时：
  - `Commit` MUST disabled
  - UI MUST 提示需要先选择要提交的文件
  - 系统 MUST NOT 因为存在 unstaged files 就自动 `stageGitAll`
- 当用户只纳入部分文件时，commit 完成后：
  - 被纳入的文件 MUST 完成本次提交
  - 未纳入的文件 MUST 保持未提交状态，不能被顺带提交
- 现有 diff 浏览、tree/flat 列表切换、文件级 `Stage` / `Unstage` / `Discard` 能力 MUST 继续工作。
- 若次级 worktree commit surface 复用相同 commit contract，则其行为 MUST 与主 Git 面板一致，不得一处显式选择、一处静默全提。

## Impact

- Frontend:
  - `src/features/git/components/GitDiffPanel.tsx`
  - `src/features/app/hooks/useGitCommitController.ts`
  - `src/features/git/hooks/useGitActions.ts`
  - `src/styles/diff.css`
  - i18n locale files
- Possible shared commit surfaces:
  - `src/features/git-history/components/GitHistoryWorktreePanel.tsx`
- Backend / service contract:
  - 预期可继续复用 `src/services/tauri.ts` 现有 `stageGitFile` / `unstageGitFile` / `commitGit`
  - 若前端批量联动需要更高效 staging orchestration，可能补充非破坏性 helper，但本提案默认不要求新增 commit payload
- Specs:
  - new `git-selective-commit`
  - modified `git-panel-diff-view`
