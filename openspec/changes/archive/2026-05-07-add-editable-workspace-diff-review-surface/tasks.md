## 1. OpenSpec And Shared Contract

- [x] 1.1 [P0][依赖:无][输入: proposal 与现有 `GitDiffViewer` / `FileViewPanel` / status/activity review 入口][输出: 完整 `design.md` 与 spec deltas][验证: `openspec validate add-editable-workspace-diff-review-surface --strict`] 补齐 change artifacts，锁定 editable eligibility、共享 shell 和 live refresh 边界。
- [x] 1.2 [P0][依赖:1.1][输入: 现有 diff/file editor contract][输出: feature-local shared review shell API 设计与落位决策][验证: 代码实现前可映射到单一组件入口] 明确由谁持有 selected file、mode、dirty guard 与 refresh callback。

## 2. Shared Editable Review Shell

- [x] 2.1 [P0][依赖:1.2][输入: `GitDiffViewer`、`FileViewPanel`、workspace path helpers][输出: 新的共享 editable diff review shell 组件与辅助 types/helpers][验证: focused component tests 覆盖 `diff -> edit -> diff` mode 切换] 组合现有 diff 审查和文件编辑能力，不复制保存链路。
- [x] 2.2 [P0][依赖:2.1][输入: `readWorkspaceFile` / `writeWorkspaceFile` / `getGitFileFullDiff` 与 diff stats helper][输出: save 后 live diff refresh、marker refresh 与 no-diff empty state][验证: focused tests 覆盖保存后 patch/markers/statistics 更新] 保证 review 面显示的是最新 workspace 状态，不是旧 snapshot。
- [x] 2.3 [P0][依赖:2.1][输入: render profile、file status、workspace mapping][输出: 统一 editable eligibility 与 read-only fallback][验证: tests 覆盖 deleted/binary/history/non-workspace target 不可写] 防止错误 surface 被误开放。

## 3. Surface Integration

- [x] 3.1 [P0][依赖:2.1-2.3][输入: 主 Git 面板 file preview modal][输出: Git panel 接入共享 editable review shell][验证: `npx vitest run src/features/git/components/GitDiffPanel.test.tsx`] 让 file-scoped live diff review 能直接进入编辑并在保存后刷新 Git panel 状态。
- [x] 3.2 [P0][依赖:2.1-2.3][输入: `CheckpointPanel` review diff modal][输出: Checkpoint review diff 接入共享 editable review shell][验证: `npx vitest run src/features/status-panel/components/StatusPanel.test.tsx`] 让底部结果面既保留 review，又能顺手改当前 workspace 文件。
- [x] 3.3 [P0][依赖:2.1-2.3][输入: `WorkspaceSessionActivityPanel` diff preview modal][输出: activity diff preview 接入共享 editable review shell][验证: `npx vitest run src/features/session-activity/components/WorkspaceSessionActivityPanel.test.tsx`] 让右侧 activity 文件改动复核也能在现场修补。

## 4. Verification And Cleanup

- [x] 4.1 [P0][依赖:3.1-3.3][输入: 全部实现与 touched tests][输出: focused regression coverage][验证: `npx vitest run src/features/git/components/GitDiffPanel.test.tsx src/features/status-panel/components/StatusPanel.test.tsx src/features/session-activity/components/WorkspaceSessionActivityPanel.test.tsx src/features/files/components/FileViewPanel.test.tsx`] 覆盖可编辑入口、保存刷新、只读退化和 dirty guard。
- [x] 4.2 [P0][依赖:4.1][输入: 全部代码改动][输出: 通过类型与静态检查的实现][验证: `npm run typecheck && npm run lint`] 做最终门禁，确保没有引入类型漂移或样式/交互回归。
