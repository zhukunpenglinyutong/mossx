## 1. OpenSpec capability definition（P0）

- [x] 1.1 [依赖: 无] 为 `git-file-preview-affordance` 创建 delta spec，定义主 Git 面板 file row 的 inline preview / modal preview explicit action contract（输入：用户需求与现有 row click / double-click 行为；输出：capability spec；验证：OpenSpec 文本覆盖 tree / flat、button 位置与行为一致性）。

## 2. Main git panel file-row affordance implementation（P0）

- [x] 2.1 [依赖: 1.1] 在 `GitDiffPanel` 中抽出显式 inline preview action callback，复用现有 row 单击后的中间区域预览语义（输入：现有 `handleFileClick` 与 `onSelectFile`；输出：可供 row action button 调用的 callback；验证：点击 preview button 可选中并切到中间 diff）。
- [x] 2.2 [依赖: 2.1] 在 `GitDiffPanelFileSections.tsx` 的 file row action 区中新增两个 preview buttons，并放在 `+ / - / 回退` 前（输入：preview callbacks；输出：新的行尾 action layout；验证：tree / flat 都可见且位置正确）。
- [x] 2.3 [依赖: 2.2] 保持现有 row 单击 / 双击语义不变，并确保 preview button click 不会冒泡成 row click / double-click 重复触发（输入：现有 row handlers；输出：稳定事件行为；验证：button click 只触发对应 preview 行为一次）。

## 3. UX copy and styling（P0）

- [x] 3.1 [依赖: 2.2] 为新增 preview buttons 补充 `zh/en` i18n 文案、tooltip 与 aria label（输入：新 button 语义；输出：locale keys；验证：测试环境与真实 UI 不出现硬编码 copy）。
- [x] 3.2 [依赖: 2.2] 在 `src/styles/diff.css` 中收口 preview action button 样式，保证与现有 row action 同层级但不压过 mutation actions（输入：现有 `diff-row-action` 样式体系；输出：新样式；验证：无明显布局挤压或 hover 错位）。

## 4. Regression coverage and finish（P0）

- [x] 4.1 [依赖: 2.3,3.1] 更新 `GitDiffPanel.test.tsx`，覆盖 preview buttons 的可见性、位置语义、inline preview 触发与 modal preview 触发（输入：Vitest fixture；输出：主面板回归测试；验证：Vitest 通过）。
- [x] 4.2 [依赖: 4.1] 执行最小验证门禁（输入：本次前端改动；输出：通过的验证结果；验证：`npm exec vitest run src/features/git/components/GitDiffPanel.test.tsx`、`npm run typecheck` 通过）。
- [x] 4.3 [依赖: 4.2] 同步主 specs 并回读 OpenSpec artifacts，确认 capability、实现与验证一致（输入：最终代码与 change artifacts；输出：可进入 verify / archive 的完成态；验证：`openspec validate \"expose-git-file-preview-actions\" --strict` 通过）。
