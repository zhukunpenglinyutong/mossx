## 1. Commit Contract Alignment

- [x] 1.1 [P0][depends:none][I: 当前 `useGitCommitController`、`GitHistoryWorktreePanel` 中的 auto-stage-all 兜底][O: staged-only commit gate][V: targeted tests 覆盖“仅有 unstaged 时 commit disabled，且不会触发 `stageGitAll`”] 收紧所有共享 commit 入口，只允许 staged files 进入本次提交。
- [x] 1.2 [P0][depends:1.1][I: 主 Git 面板与次级 worktree commit surface 的提示/disable 条件][O: 一致的显式选择语义][V: Vitest 断言主面板与次级 surface 在无 staged files 时给出一致反馈] 对齐共享 commit surface 的用户提示与启用条件。

## 2. Git Panel Inclusion Controls

- [x] 2.1 [P0][depends:1.1][I: `GitDiffPanel.tsx` 现有 staged/unstaged row actions][O: 文件级 checkbox inclusion controls][V: 组件测试覆盖 checkbox 仅影响 commit selection，且原有 stage/unstage action 仍可用] 在 flat 模式补齐文件级显式勾选交互，并保留现有 stage/unstage actions。
- [x] 2.2 [P0][depends:2.1][I: tree 构建逻辑与目录节点渲染][O: folder tri-state + section bulk toggle][V: 组件测试覆盖 `none/partial/all`、folder 批量切换仅影响当前 section descendants] 在 tree 模式补齐分级 checkbox 与批量 commit selection 交互。
- [x] 2.3 [P1][depends:2.1,2.2][I: commit 区域 summary + i18n + `diff.css`][O: 可见的 commit scope 反馈][V: 测试覆盖 selected count 文案与无 selection 提示；必要样式检查通过] 在 commit 区显示本次将提交的文件数量，并补齐相关文案与样式。

## 3. Verification

- [x] 3.1 [P0][depends:2.3][I: `GitDiffPanel`、commit controller、worktree panel 受影响测试][O: selective commit regression coverage][V: `npm run test -- GitDiffPanel`、`npm run test -- useGitCommitController`、`npm run test -- GitHistoryWorktreePanel` 通过] 补齐 selective commit 关键路径回归测试。
- [x] 3.2 [P1][depends:3.1][I: 前端受影响模块][O: 质量门禁结果][V: `npm run lint`、`npm run typecheck`、`npm run test` 通过；如涉及大文件阈值则补跑 `npm run check:large-files`] 运行基础质量门禁并确认没有引入行为回退。
