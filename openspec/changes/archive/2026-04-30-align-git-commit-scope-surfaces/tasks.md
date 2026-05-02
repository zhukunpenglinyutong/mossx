## 1. Cross-layer commit scope contract（P0）

- [x] 1.1 [依赖: 无] 扩展 frontend `src/services/tauri.ts` 的 commit message generation service contract，增加 optional `selectedPaths` payload（输入：OpenSpec design/specs；输出：`getCommitMessagePrompt` / `generateCommitMessage` / `generateCommitMessageWithEngine` 新签名；验证：TS 类型通过且旧调用面无需强制改参）。
- [x] 1.2 [依赖: 1.1] 扩展 `src-tauri/src/codex/mod.rs` 中 `get_commit_message_prompt` 与 `generate_commit_message` command payload，支持 optional `selected_paths`（输入：frontend payload contract；输出：Tauri command 参数与 invoke mapping 一致；验证：command registry 与 payload 字段名对齐）。
- [x] 1.3 [依赖: 1.2] 在 Rust git helper 层新增 scope-aware diff 入口，保留旧 workspace-wide diff helper 兼容路径（输入：selected paths + repo status；输出：可供 commit message generation 复用的新 helper；验证：无显式 scope 时保持旧 baseline 行为）。

## 2. Scope-aware diff semantics（P0）

- [x] 2.1 [依赖: 1.3] 实现 staged-only / unstaged-only / hybrid path 的 source-aware scope plan（输入：repo status 与 optional `selectedPaths`；输出：`index paths` / `worktree-only paths` 的有效集合；验证：partial staged path 只贡献 staged diff，selected unstaged-only path 可进入生成范围）。
- [x] 2.2 [依赖: 2.1] 让 commit message generation 使用新 scope-aware diff helper，而不是直接读取全量 workspace diff（输入：Codex 与 non-Codex generation chain；输出：所有引擎共享同一 scope contract；验证：显式选中部分文件时未选 diff 不会进入 prompt）。
- [x] 2.3 [依赖: 2.1] 固化 Win/mac 路径归一化约束，确保 `\\` / `/` 写法在 diff targeting 中等价（输入：selected path payload 与 repo file paths；输出：统一 normalize contract；验证：Windows 风格路径与 POSIX 风格路径命中同一 diff 条目）。

## 3. Shared commit scope utilities（P0）

- [x] 3.1 [依赖: 1.1] 抽取 frontend 侧 commit scope / path normalization pure helper，避免主 Git 面板、Git History/HUB 与 service mapping 各自复制逻辑（输入：`useGitCommitController` 与现有 inclusion utils；输出：feature-local shared helper；验证：主面板现有行为不回退）。
- [x] 3.2 [依赖: 3.1] 让主 Git 面板在触发 AI 提交信息生成时透传当前 `selectedCommitPaths`（输入：`GitDiffPanel` 当前 commit scope 状态；输出：主面板 generation 请求带 scope；验证：现有引擎/语言菜单测试保持通过并新增 scope 断言）。
- [x] 3.3 [依赖: 3.1] 保持主 Git 面板“无显式选择时 staged-first / unstaged-fallback”的 quick-generate baseline（输入：当前 `selectedCommitCount` 与 staged/unstaged 状态；输出：兼容旧心智的 generation fallback；验证：无显式勾选时行为与现有 tooltip/copy 一致）。

## 4. Git History/HUB 提交区归一化（P0）

- [x] 4.1 [依赖: 3.1] 在 `GitHistoryWorktreePanel` 中接入与主 Git 面板一致的 `useGitCommitSelection` / `InclusionToggle` / `CommitButton` contract（输入：worktree staged/unstaged file list；输出：file/folder/section inclusion control；验证：不会替代现有 stage/unstage/discard 动作）。
- [x] 4.2 [依赖: 4.1] 让 Git History/HUB 提交区的 commit hint、button enablement 与 partial staged guardrail 对齐主面板语义（输入：selected files + staged/unstaged 状态；输出：同一 scope hint 与阻断逻辑；验证：空 scope 阻断、partial staged 锁定与主面板一致）。
- [x] 4.3 [依赖: 4.1,4.2] 让 Git History/HUB 提交区的 AI commit message generation 复用同一 engine/language menu 语义，并按当前 scope 生成（输入：worktree surface selected paths；输出：scope-aware generation parity；验证：相同 scope 下主面板与 worktree 面板生成范围一致）。
- [x] 4.4 [依赖: 4.1,4.2,4.3] 审核并修正 Git History/HUB tree 模式下的 Win/mac 路径归一化、folder descendants 判断与 row selection 行为（输入：Windows/POSIX 风格 path fixture；输出：同一 normalize 结果；验证：folder toggle 与 file toggle 跨平台一致）。

## 5. Automated regression coverage（P0）

- [x] 5.1 [依赖: 2.1,2.2,2.3] 增加 Rust 侧测试，覆盖 scoped generation 的 staged-only、selected unstaged-only、hybrid path 与 Windows 风格路径场景（输入：repo fixture；输出：scope-aware diff helper 断言；验证：`cargo test --manifest-path src-tauri/Cargo.toml` 相关用例通过）。
- [x] 5.2 [依赖: 3.2,3.3] 更新 `GitDiffPanel.test.tsx` / `useGitCommitController.test.tsx`，覆盖主面板 generation 请求携带 selected scope、无显式选择 fallback 与 path normalization（输入：Vitest fixture；输出：主面板 contract 回归测试；验证：Vitest 通过）。
- [x] 5.3 [依赖: 4.1,4.2,4.3,4.4] 更新 `GitHistoryWorktreePanel.test.tsx`，覆盖 inclusion control、commit hint parity、scope-aware generation 与 Windows 路径行为（输入：Vitest fixture；输出：HUB/worktree 提交区归一化测试；验证：Vitest 通过）。
- [x] 5.4 [依赖: 5.1,5.2,5.3] 审核新增/修改测试的输出体量，避免引入快照噪音或重日志（输入：本次测试改动；输出：无 heavy test noise 回归；验证：`npm run check:heavy-test-noise` 通过）。

## 6. Quality gates and finish（P0）

- [x] 6.1 [依赖: 5.1,5.2,5.3] 执行最小质量门禁（输入：本次代码改动；输出：通过的 lint/type/test 结果；验证：`npm run lint`、`npm run typecheck`、目标 `vitest`、`cargo test --manifest-path src-tauri/Cargo.toml` 通过）。
- [x] 6.2 [依赖: 6.1] 执行 runtime / bridge contract 验证（输入：扩展后的 tauri payload mapping；输出：无 cross-layer contract 回归；验证：`npm run check:runtime-contracts` 通过）。
- [x] 6.3 [依赖: 4.1,5.3,6.1] 对触碰的大文件执行治理门禁（输入：`GitHistoryWorktreePanel` / `GitDiffPanel` / tests / Rust git files；输出：无 near-threshold 或 gate 失败；验证：`npm run check:large-files:near-threshold` 与 `npm run check:large-files:gate` 通过）。
- [x] 6.4 [依赖: 6.1,6.2,6.3] 回读 OpenSpec tasks/specs/design 与最终实现，对照验收标准确认 scope-aware generation、surface parity、Win/mac 路径一致性全部落地（输入：最终代码与测试结果；输出：可进入 verify/archive 的完成态；验证：OpenSpec verify 无关键缺口）。
- [x] 6.5 [依赖: 4.1,4.2,4.4,6.1] 修复右侧 Git / Git His 大面板的 render performance regression：为 tree node 预聚合 descendant paths，并将 commit selection 派生收敛为单轮计算（输入：用户复现的卡死路径；输出：打开大面板不再因重复全树遍历卡死；验证：目标 Vitest、`npm run typecheck` 与人工打开面板自测通过）。
