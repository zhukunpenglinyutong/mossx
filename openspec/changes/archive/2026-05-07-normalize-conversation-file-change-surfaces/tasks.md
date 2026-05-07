## 0. 执行约束与完成定义（DoD）

- 范围约束：仅允许修改 conversation file-change 相关 frontend selector / adapter / panel / tests，不改 Tauri Git command、conversation storage schema、历史持久化结构。
- 兼容约束：`filePath` 继续作为 canonical identity；`onOpenDiffPath` 继续作为底层 diff 打开链路；editor maximize 必须复用既有 `isEditorFileMaximized` contract。
- 交互约束：右侧主点击与 diff icon 次按钮必须职责分离，禁止一个入口同时承担两套语义。
- 回归约束：消息幕布、Git History、外部 spec root 路由、历史 reopening / replay 不得因本变更回退。

### 统一 DoD

- [x] 三个 surface 对同一 file-change fact 的文件数量一致。
- [x] 三个 surface 对同一 file-change fact 的 `status / additions / deletions` 一致。
- [x] 右侧主点击完成“打开文件 + 最大化”或安全 fallback。
- [x] 右侧 diff icon 能打开 diff 预览窗体且不抢占主布局。
- [x] focused tests、lint、typecheck 通过；若触达大样式文件，额外通过 `npm run check:large-files`。

## 1. Spec And Contract Alignment

- [x] 1.1 补齐 proposal / design / delta specs，明确 canonical file-entry、文件数与 `+/-` 统一、右侧点击最大化、diff icon 弹窗。输入：用户反馈、现有 activity/status/tool-card 代码路径；输出：完整 OpenSpec artifacts；验证：人工审阅 `openspec/changes/normalize-conversation-file-change-surfaces/`
- [x] 1.2 校对门禁约束与兼容性写法，明确不改 conversation storage schema、不破坏路径路由。输入：proposal 中 Gate Constraints / Compatibility Guards；输出：design 与 spec delta 对齐；验证：人工比对 proposal/design/spec 术语一致

## 2. Shared File-Change Presentation Model

- [x] 2.1 在共享层抽取 canonical file-entry adapter，统一文件列表、单文件 `+/-` 与事件级聚合统计。输入：`item.changes[]`、历史 replay file-change facts、现有 `summarizeFileChangeItem(...)` / `extractFileChangeSummaries(...)`；输出：共享 pure function / selector；验证：unit tests 覆盖多文件、rename/delete、稀疏历史 payload
- [x] 2.2 让 `workspace session activity` 改为消费 canonical entries，而不是 primary-file summary。输入：共享 canonical adapter；输出：完整文件列表 view model；验证：`buildWorkspaceSessionActivity` / `WorkspaceSessionActivityPanel` focused tests
- [x] 2.3 让 `status panel` 改为消费同一 canonical contract，归一 `Edits` tab 文件数与 `+/-` 汇总。输入：共享 canonical adapter；输出：对齐后的 `useStatusPanelData` / `FileChangesList` 数据；验证：status-panel focused tests
- [x] 2.4 审计消息幕布 `File changes` 卡片 header / aggregate 统计，必要时对齐到共享聚合口径，但不重做卡片视觉结构。输入：`GenericToolBlock.tsx` / `EditToolGroupBlock.tsx`；输出：一致的文件数与 `+/-` 展示；验证：tool-card focused tests

## 3. Session Activity File Affordances

- [x] 3.1 右侧 activity panel 文件事件展开后展示全部文件条目，并保留 turn / session summary。输入：activity panel 现有 event group UI；输出：完整 file rows；验证：component tests 覆盖多文件事件默认展示
- [x] 3.2 为右侧文件主点击接入“打开文件并最大化”编排，maximize 不可用时回退到既有打开路径。输入：`useAppShellSections.ts`、`useAppShellLayoutNodesSection.tsx` 现有 open/maximize 能力；输出：稳定主点击行为；验证：focused tests 覆盖 maximize 成功与 fallback
- [x] 3.3 为右侧文件条目新增独立 diff icon 按钮，点击后打开 diff 预览窗体并保持主布局上下文。输入：现有 diff modal / preview 链路；输出：次级快捷入口；验证：component tests 覆盖 icon click、主点击分离、关闭弹窗后上下文保持

## 4. Validation

- [x] 4.1 补 canonical adapter 与 surface parity 单测。输入：共享 adapter 与三个 surface 数据流；输出：新增/更新 unit tests；验证：`npx vitest run src/features/operation-facts/operationFacts.test.ts src/features/session-activity/adapters/buildWorkspaceSessionActivity.test.ts src/features/status-panel/components/StatusPanel.test.tsx`
- [x] 4.2 补历史 reopening / replay regression，锁定历史载荷不丢文件、不漂统计。输入：Codex 历史恢复场景与现有 replay fixtures；输出：regression tests；验证：相关 `session-activity` / `status-panel` focused tests
- [x] 4.3 运行质量门禁。输入：完成后的 frontend 改动；输出：通过的 lint / typecheck / test 结果；验证：`npm run lint && npm run typecheck && npm run test`
- [x] 4.4 若触达大样式文件或大组件文件，追加大文件门禁。输入：变更后的样式/组件文件；输出：large-file 检查结果；验证：`npm run check:large-files`
