## 0. Baseline and Contract Freeze

- [x] 0.1 [P0][输入:`project-memory-refactor` 已完成实现][输出: Phase 3 实施 baseline 清单][验证:`git status --short` + `openspec status --change project-memory-phase3-usability-reliability`][依赖:无] 确认 Phase 3 只在 Phase 2 完整 turn memory 之上做易用性、注入和治理增强，不回退 canonical `userInput/assistantResponse` 语义。
- [x] 0.2 [P0][输入:`openspec/specs/project-memory-ui/spec.md`,`project-memory-consumption/spec.md`,`composer-manual-memory-reference/spec.md`][输出: 现有行为冲突清单][验证:`rg -n "contextInjectionEnabled|@@|Memory Reference|conversation_turn" openspec/specs openspec/changes/project-memory-phase3-usability-reliability`][依赖:0.1] 明确历史自动注入固定关闭与 Phase 3 one-shot Memory Reference 的规格差异。
- [x] 0.3 [P0][输入:`.github/workflows/heavy-test-noise-sentry.yml`,`.github/workflows/large-file-governance.yml`][输出: Phase 3 门禁矩阵][验证:`node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` + `node --test scripts/check-large-files.test.mjs`][依赖:0.1] 明确本地等价 CI 命令、Node 20 跨平台要求和不得输出大段记忆正文的日志约束。
- [x] 0.4 [P0][输入: proposal/design/specs][输出: 功能边界清单][验证:`rg -n "不读取项目文件|不执行|不新增|不得|SHALL NOT" openspec/changes/project-memory-phase3-usability-reliability`][依赖:0.1-0.3] 确认 Phase 3 不扩散到 embedding、通用 agent 平台、跨 workspace 扫描、项目文件读取或静默自动注入。
- [x] 0.Exit [依赖:0.1-0.4][验证:`openspec validate project-memory-phase3-usability-reliability --strict --no-interactive`][输出: 设计可进入实现][完成定义: OpenSpec artifact 严格校验通过]

## 1. Phase 3A: Project Memory Workbench Surface

- [x] 1.1 [P0][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/styles/project-memory.css`][输出: workbench shell][验证:`pnpm vitest run src/features/project-memory/components/ProjectMemoryPanel.test.tsx`][依赖:0.Exit] 将弹窗布局整理为顶部工具栏、左侧列表、右侧详情、底部分页/批量操作的稳定结构。
- [x] 1.2 [P0][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx` 或拆分组件][输出: compact memory list item][验证: UI 测试断言长 `assistantResponse` 不直接进入列表正文][依赖:1.1] 左侧列表项限制 title/summary/metadata 行数，显示 record kind、engine、importance、health/review 占位信息。
- [x] 1.3 [P1][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/styles/project-memory.css`][输出: quick tags 折叠/更多][验证: 组件测试覆盖 quick tags 超量时默认收起][依赖:1.1] 避免大量标签挤占弹窗主要工作区。
- [x] 1.4 [P1][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/features/project-memory/utils/projectMemoryDisplay.ts`][输出: 原对话定位入口][验证: 组件测试覆盖有/无 threadId+turnId 的状态][依赖:1.1] 在详情区暴露跳回原 thread/turn 的入口或不可用状态。
- [x] 1.5 [P1][文件:`src/features/project-memory/components/ProjectMemoryPanel.test.tsx`,`src/styles/project-memory.css`][输出: responsive/overflow guard][验证: Playwright 或组件断言覆盖 100 条列表、长文本、不重叠][依赖:1.2] 确保列表、详情、分页在常见窗口尺寸下不相互遮挡，并兼容 Windows/macOS 滚动条和字体差异。
- [x] 1.Exit [依赖:1.1-1.5][验证:`pnpm vitest run src/features/project-memory` + `npm run typecheck`][输出: Project Memory 弹窗可用性第一阶段完成][完成定义: 现有删除、复制、筛选、manual note 编辑和 turn 只读详情不回归]

## 2. Phase 3B: `@@` Manual Memory Compact Picker

- [x] 2.1 [P0][文件:`src/features/composer/components/ComposerInput.tsx`,`src/features/composer/components/ChatInputBox/ChatInputBox.tsx`][输出: manual memory compact candidate renderer][验证:`pnpm vitest run src/features/composer`][依赖:0.Exit] 将 `@@` 候选左侧改为 compact preview，标题 1 行、摘要 2-3 行、metadata 1 行。
- [x] 2.2 [P0][文件:`src/features/composer/components/ComposerInput.tsx` 或相关 dropdown 组件][输出: 右侧详情保持完整][验证: 测试覆盖右侧仍显示完整 conversation turn 用户输入和 AI 回复][依赖:2.1] 保持右侧展开详情不受左侧截断影响。
- [x] 2.3 [P1][文件:`src/features/composer/components/ComposerInput.tsx`,`src/styles/*`][输出: 键盘/hover/selected 兼容][验证: 测试覆盖上下键高亮、Enter/Space 选择、取消选择][依赖:2.1] 确保 compact 改造不破坏现有多选交互。
- [x] 2.4 [P1][文件:`src/features/composer/components/ChatInputBox/*`][输出: ChatInputBox `@@` provider parity][验证:`pnpm vitest run src/features/composer/components/ChatInputBox`][依赖:2.1] 确保新版 ChatInputBox 路径和旧 ComposerInput 路径行为一致。
- [x] 2.Exit [依赖:2.1-2.4][验证:`pnpm vitest run src/features/composer src/features/project-memory`][输出: `@@` 引用候选密度优化完成][完成定义: 左侧长内容不撑爆，同屏可比较多条候选，右侧详情完整]

## 3. Phase 3C: Composer Memory Reference Toggle

- [x] 3.1 [P0][文件:`src/features/composer/components/Composer.tsx`,`src/features/composer/components/ComposerInput.tsx`,`src/features/composer/components/ChatInputBox/ChatInputBox.tsx`][输出: Memory Reference icon toggle UI][验证: 组件测试覆盖默认关闭、点击开启、再次关闭][依赖:0.Exit] 在 Composer 底部工具区增加可访问的 Memory Reference icon button。
- [x] 3.2 [P0][文件:`src/features/composer/**`][输出: one-shot state model][验证: 测试覆盖发送完成后状态清空、切换 thread/workspace 清空][依赖:3.1] 状态只作用于本次发送，不恢复旧 localStorage 全局自动注入。
- [x] 3.3 [P0][文件:`src/features/threads/hooks/useThreadMessaging.ts`,`src/features/project-memory/utils/memoryContextInjection.ts`][输出: no-op plumbing][验证:`pnpm vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][依赖:3.2] 将 toggle 状态传入发送链路，但在 Scout 未接入前不改变发送文本。
- [x] 3.4 [P1][文件:`src/i18n/locales/zh.part*.ts`,`src/i18n/locales/en.part*.ts`,`src/styles/*`][输出: 状态 copy 和视觉样式][验证:`npm run typecheck`][依赖:3.1] 增加关闭、已开启、查询中、已参考、失败降级的中英文文案。
- [x] 3.Exit [依赖:3.1-3.4][验证:`pnpm vitest run src/features/composer src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: Memory Reference UI 和状态接入完成][完成定义: 默认不注入，开启状态可进入发送链路]

## 4. Phase 3D: Memory Scout and Memory Brief

- [x] 4.1 [P0][文件:`src/features/project-memory/utils/memoryScout.ts` 或等价文件][输出: `MemoryBrief` 类型和 builder][验证: 新增 unit tests 覆盖 ok/empty/truncated/conflicts][依赖:3.Exit] 定义 Memory Brief contract，按来源记忆生成短摘要、选择理由和来源引用；不得读取项目文件、执行 shell/Git 或写入 Project Memory。
- [x] 4.2 [P0][文件:`src/features/project-memory/services/projectMemoryFacade.ts`,`src/features/project-memory/utils/memoryScout.ts`][输出: 当前 workspace 只读查询][验证: 测试覆盖只查询 workspaceId、不写入记忆][依赖:4.1] Scout 只读 list/get Project Memory，不修改 store。
- [x] 4.3 [P0][文件:`src/features/project-memory/utils/memoryContextInjection.ts`,`src/features/threads/hooks/useThreadMessaging.ts`][输出: `memory-scout` 注入块][验证:`pnpm vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][依赖:4.1-4.2] 将 Brief 以可识别 `<project-memory source="memory-scout">` 块注入主会话。
- [x] 4.4 [P0][文件:`src/features/threads/hooks/useThreadMessaging.ts`][输出: 超时/失败降级][验证: 测试覆盖 Scout reject/timeout/empty 时主消息继续发送][依赖:4.3] Scout 失败不阻断 Claude Code、Codex、Gemini 发送路径；超时/取消逻辑必须使用跨平台 JS/Rust API，不依赖 shell。
- [x] 4.5 [P1][文件:`src/features/composer/**`,`src/features/messages/**`][输出: Memory Reference 结果可见性][验证: UI 测试覆盖已参考 N 条、来源标题、失败状态][依赖:4.3] 在 Composer 或消息上下文中显示 Scout 引用数量和来源。
- [x] 4.6 [P1][文件:`src/features/project-memory/utils/memoryScout.test.ts`,`src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: 引擎覆盖矩阵][验证: Codex/Claude Code 强覆盖，Gemini smoke][依赖:4.4] 确保 Memory Brief contract 与引擎无关。
- [x] 4.Exit [依赖:4.1-4.6][验证:`pnpm vitest run src/features/project-memory src/features/composer src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx` + `npm run typecheck`][输出: 显式记忆参考闭环完成][完成定义: 开启 toggle 后可生成可追踪 Brief，失败可降级]

## 5. Phase 3E: Health, Review Inbox, Diagnostics

- [x] 5.1 [P0][文件:`src/features/project-memory/utils/projectMemoryHealth.ts` 或等价文件][输出: health state derivation][验证: unit tests 覆盖 complete/input_only/assistant_only/pending_fusion/capture_failed][依赖:0.Exit] 从 canonical 字段派生健康状态，避免冗余真值。
- [x] 5.2 [P0][文件:`src/services/tauri/projectMemory.ts`,`src-tauri/src/project_memory/model.rs`,`src-tauri/src/project_memory/commands.rs`][输出: review state DTO 和 update 支持][验证:`cargo test --manifest-path src-tauri/Cargo.toml project_memory` + TS tests][依赖:5.1] 支持 `unreviewed/kept/converted/obsolete/dismissed` 状态持久化或兼容 metadata。
- [x] 5.3 [P0][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/features/project-memory/hooks/useProjectMemory.ts`][输出: Review Inbox filters/actions][验证: 组件测试覆盖保留、转 note、标记过期、删除/忽略][依赖:5.1-5.2] 提供待整理视图和基础治理操作。
- [x] 5.4 [P1][文件:`src-tauri/src/project_memory/commands.rs`,`src-tauri/src/project_memory/store.rs`,`src-tauri/src/project_memory/tests.rs`][输出: diagnostics dry run][验证:`cargo test --manifest-path src-tauri/Cargo.toml project_memory`][依赖:5.2] 返回 health counts、重复 turn key、坏文件/分片统计，不修改文件；路径处理使用 `Path`/`PathBuf`，不硬编码分隔符。
- [x] 5.5 [P1][文件:`src-tauri/src/project_memory/commands.rs`,`src-tauri/src/project_memory/store.rs`][输出: reconcile apply][验证: Rust tests 覆盖可修复半截记录与冲突跳过][依赖:5.4] 提供用户确认后的安全修复，必须先支持 dry run。
- [x] 5.6 [P1][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/styles/project-memory.css`][输出: diagnostics UI][验证: UI 测试覆盖统计展示、dry run、apply confirm][依赖:5.4] 在 Project Memory workbench 中展示诊断和修复入口。
- [x] 5.Exit [依赖:5.1-5.6][验证:`pnpm vitest run src/features/project-memory` + `cargo test --manifest-path src-tauri/Cargo.toml project_memory`][输出: 记忆治理和可靠性增强完成][完成定义: 用户能识别、整理、过期和修复记忆]

## 6. Cross-Cutting Verification and Governance

- [x] 6.1 [P0][验证:`openspec validate project-memory-phase3-usability-reliability --strict --no-interactive`][输出: OpenSpec strict pass][依赖:1.Exit-5.Exit] 变更 specs/tasks/design/proposal 严格通过。
- [x] 6.2 [P0][验证:`npm run typecheck`][输出: TS 类型门禁通过][依赖:1.Exit-5.Exit] Phase 3 前端类型全绿。
- [x] 6.3 [P0][验证:`pnpm vitest run src/features/project-memory src/features/composer src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: 前端关键回归通过][依赖:1.Exit-5.Exit] 覆盖 workbench、`@@`、Memory Reference、Scout 和 Review Inbox。
- [x] 6.4 [P0][验证:`cargo test --manifest-path src-tauri/Cargo.toml project_memory`][输出: Rust Project Memory 后端测试通过][依赖:5.Exit] 覆盖 review state、diagnostics、reconcile 和 store 兼容。
- [x] 6.5 [P0][验证:`node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` + `npm run check:heavy-test-noise`][输出: Heavy Test Noise Sentry 本地等价门禁通过][依赖:6.1-6.4] 与 `.github/workflows/heavy-test-noise-sentry.yml` 的 Ubuntu/macOS/Windows 命令保持一致，新增测试不得输出大段 DOM、记忆正文或不稳定日志。
- [x] 6.6 [P0][验证:`node --test scripts/check-large-files.test.mjs` + `npm run check:large-files:near-threshold` + `npm run check:large-files:gate`][输出: Large File Governance Sentry 本地等价门禁通过][依赖:6.1-6.5] 与 `.github/workflows/large-file-governance.yml` 的 Ubuntu/macOS/Windows 命令保持一致，Phase 3 组件、测试、fixture 不制造大文件债务。
- [x] 6.7 [P1][验证:`npm run lint && npm run build`][输出: 发布候选 lint/build 通过][依赖:6.1-6.6] 前端 lint/build 通过。
- [x] 6.8 [P1][验证:`rg -n "path.join|\\\\\\\\|/[A-Za-z0-9_.-]+/" src/features/project-memory src/features/composer src-tauri/src/project_memory` 人工复核命中项][输出: Win/mac/Linux 兼容性复核][依赖:6.1-6.7] 复核新增路径、换行、临时文件、滚动容器和测试命令无平台专用假设。
- [x] 6.9 [P0][文件:`src/features/messages/components/MessagesRows.tsx`,`src/features/messages/components/Messages.test.tsx`][验证:`pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts` + `npm run typecheck`][输出: Claude/Codex Project Memory 关联资源展示一致][依赖:6.8] 将 `@@` 与 Memory Reference 产生的 Project Memory 引用作为独立关联资源卡片展示，不与用户输入气泡混排。
- [x] 6.10 [P0][文件:`src/features/threads/loaders/codexHistoryLoader.ts`,`src/features/threads/loaders/codexSessionHistory.ts`,`src/features/threads/loaders/historyLoaders.test.ts`][验证:`pnpm vitest run src/features/threads/loaders/historyLoaders.test.ts src/features/messages/components/Messages.test.tsx` + `npm run typecheck`][输出: Codex 历史 Project Memory 关联资源回放一致][依赖:6.9] 保留 Codex remote/local history 中的 `<project-memory>` 注入块供渲染层生成独立关联资源，同时用户气泡只显示真实输入。
- [x] 6.Exit [依赖:6.1-6.10][输出: Phase 3 可归档][完成定义: 所有任务完成，用户人工验证 Project Memory 管理、`@@` 引用和 Memory Reference 主路径可用]
