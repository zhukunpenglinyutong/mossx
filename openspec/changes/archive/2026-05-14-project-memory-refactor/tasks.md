# Tasks: Project Memory Conversation Turn Rebuild

## 0. Reset Baseline

- [x] 0.1 [P0][文件:`openspec/changes/project-memory-refactor/**`][目标: 作废旧 Phase 2 执行计划][完成定义: proposal/design/tasks/specs 均以当前代码为事实基线，不再引用过期路径或“已完成但代码未实现”的契约冻结结论] 本次重写不保留旧 Batch A-G 的任务编号作为执行事实。
- [x] 0.2 [P0][验证:`rg -n "ProjectMemoryItemV2|MemoryListProjection|MemoryDetailPayload|OperationTrailEntry|hardDelete|deletedAt" src src-tauri openspec/changes/project-memory-refactor`][目标: 建立真实漂移清单][完成定义: 明确哪些符号不存在、哪些 V1 语义仍在代码主路径] 这是后续所有实现的 baseline。

## 1. Contract: Full Turn Memory First

- [x] 1.1 [P0][文件:`src/services/tauri/projectMemory.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`,`src-tauri/src/project_memory/*`][目标: 定义可落地的 `ConversationTurnMemory` 字段][完成定义: TS/Rust 均包含 `schemaVersion/recordKind/turnId/userInput/assistantResponse/assistantThinkingSummary`，旧字段仍作为兼容字段保留] 先扩字段，不先改 UI。
- [x] 1.2 [P0][文件:`src/services/tauri/projectMemory.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`][目标: 在 facade 中新增 turn capture/fusion 语义入口][完成定义: 前端调用方不再直接围绕 `summary/detail` 组织自动记忆真值] 建议 API 形态为 `captureTurnInput` 与 `completeTurnMemory`，底层可暂时复用现有 command。
- [x] 1.3 [P0][文件:`src-tauri/src/project_memory/*`][目标: 后端写入支持 schema v2 字段][完成定义: create/update/capture_auto 可保存完整 `userInput` 与 `assistantResponse`，且序列化后不丢字段] 这一步先扩字段，再做模块边界收敛。
- [x] 1.4 [P0][文件:`src-tauri/src/project_memory/*`,`src/features/project-memory/utils/outputDigest.ts`][目标: 明确摘要器只生成 projection][完成定义: `buildAssistantOutputDigest` 不再参与 canonical `assistantResponse` 截断；任何固定长度常量只作用于 `summary/title/detail projection`] 这是本提案最大短板的止血点。
- [x] 1.5 [P0][文件:`src/features/project-memory/services/projectMemoryFacade.ts`,`src/features/threads/**`][目标: 定义 engine-agnostic turn payload][完成定义: Claude Code、Codex、Gemini 均归一化到同一 `workspaceId/threadId/turnId/engine/userInput/assistantResponse` contract；Project Memory facade 不暴露引擎专用 create/update API] Codex/Claude Code 为强保障，Gemini 先保证共享 contract。
- [x] 1.Exit [依赖:1.1-1.5][验证:`npm run typecheck` + `cargo test --manifest-path src-tauri/Cargo.toml project_memory`][目标: 契约阶段可编译][完成定义: 新字段编译通过，旧消费面未被硬切断]

## 2. Capture/Fusion: Preserve Full User Input and AI Response

- [x] 2.1 [P0][文件:`src/features/threads/hooks/useThreadMessaging.ts`][目标: 发送侧保存完整用户可见输入][完成定义: Claude Code 与 Codex capture payload 明确传递完整 `visibleUserText` 到 canonical `userInput`，不被脱敏/normalize 覆盖；Gemini capture 复用同一 contract 或显式记录降级原因] 当前入口已存在，重点是改语义。
- [x] 2.2 [P0][文件:`src/features/threads/hooks/useThreads.ts`,`src/features/threads/hooks/threadMemoryCaptureHelpers.ts`][目标: pending key 从 thread-only 提升到 turn-key][完成定义: Claude Code 与 Codex pending capture/completion 以 `workspaceId + threadId + turnId` 作为主键，支持 capture/completed 乱序合并；Gemini 不引入独立 pending store] 避免同线程多轮互相污染。
- [x] 2.3 [P0][文件:`src/features/threads/hooks/useThreads.ts`][目标: assistant completed 写入完整 AI 回复][完成定义: Claude Code 与 Codex 的 `payload.text` 原文进入 canonical `assistantResponse`，不经过 `MAX_ASSISTANT_DETAIL_LENGTH` 截断，不被 `OutputDigest.detail` 替代；Gemini adapter smoke 证明同一字段路径可用] 这是核心交付点。
- [x] 2.4 [P0][文件:`src/features/threads/hooks/useThreads.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`][目标: fusion upsert 幂等][完成定义: 同一 `workspaceId/threadId/turnId` 重复 completed 只更新同一条记忆，不创建重复项] 允许 update-first/create-fallback，但最终必须 turn-key 幂等。
- [x] 2.5 [P1][文件:`src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`][目标: 覆盖 capture/completed 乱序和重复事件][完成定义: Codex 与 Claude Code 至少覆盖 completed 先到、capture 先到、重复 completed、线程 rename 四类用例；Gemini 至少覆盖 normalized adapter smoke]
- [x] 2.6 [P0][文件:`src/features/threads/hooks/threadMemoryCaptureHelpers.ts`,`src/features/threads/hooks/useThreads.ts`,`src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`][目标: 修复 Codex 同一 turn 多段 assistant completed 只保存第一段的问题][完成定义: Codex 初始说明段与最终答复段会聚合并 upsert 到同一条 `workspaceId/threadId/turnId` memory，且 completed-before-capture 乱序路径也覆盖]
- [x] 2.Exit [依赖:2.1-2.6][验证:`pnpm vitest run src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`][目标: 自动记忆主链路可验证][完成定义: 测试证明用户输入全文和 AI 回复全文进入写入 payload]

## 3. Rust Store: Mixed Legacy + V2 Records

- [x] 3.1 [P0][文件:`src-tauri/src/project_memory/*`][目标: 兼容读取 legacy 与 schema v2][完成定义: list/get 能同时读取旧 `ProjectMemoryItem` 和新 turn record；旧 soft-deleted 数据继续隐藏] 不做批量迁移。
- [x] 3.2 [P0][文件:`src-tauri/src/project_memory/*`][目标: upsert by turn key][完成定义: 后端可按 `workspaceId/threadId/turnId` 找到并更新同一条 turn memory] 不能只靠前端 pending ref 防重。
- [x] 3.3 [P0][文件:`src-tauri/src/project_memory/*`][目标: projection 生成][完成定义: 后端由 `userInput/assistantResponse` 派生 `title/summary/detail/cleanText/fingerprint`，旧消费面仍可用] `detail` 应能完整表达本轮问答，不再是 800 字片段。
- [x] 3.4 [P1][文件:`src-tauri/src/project_memory/*`][目标: 写入原子性增强][完成定义: 日期 JSON 写入使用 temp file + rename，失败不破坏原文件]
- [x] 3.5 [P1][文件:`src-tauri/src/project_memory/*`][目标: 大字段读写不阻塞主链路的设计落点][完成定义: 明确哪些 command 先迁入 blocking worker，至少为后续模块拆分留下函数边界]
- [x] 3.Exit [依赖:3.1-3.5][验证:`cargo test --manifest-path src-tauri/Cargo.toml project_memory`][目标: 后端存储支持完整 turn][完成定义: Rust 测试覆盖 v2 serde、legacy read、turn upsert、projection]

## 4. Read Model and Consumer Compatibility

- [x] 4.1 [P0][文件:`src/services/tauri/projectMemory.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`][目标: list/detail 语义分离][完成定义: facade 能表达轻量列表与完整详情；即使底层命令暂同名，类型层也不再假设 list 必然含完整正文]
- [x] 4.2 [P0][文件:`src/features/composer/hooks/useComposerAutocompleteState.ts`,`src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`,`src/features/project-memory/utils/memoryContextInjection.ts`][目标: manual memory injection 兼容新 projection][完成定义: summary/detail 模式继续工作，turn memory detail mode 可拿到完整问答文本]
- [x] 4.3 [P0][文件:`src/features/context-ledger/utils/contextLedgerProjection.ts`][目标: Context Ledger 兼容 turn projection][完成定义: selected manual memories 或 turn memories 仍能投影为 ledger block，不因字段变更崩溃]
- [x] 4.4 [P1][文件:`src/features/project-memory/hooks/useProjectMemory.ts`][目标: hook 改为 selected detail hydration][完成定义: 列表状态和详情状态分离，打开详情时加载完整 item]
- [x] 4.Exit [依赖:4.1-4.4][验证:`pnpm vitest run src/features/project-memory src/features/composer src/features/context-ledger`][目标: 消费面不回归][完成定义: manual injection 和 Context Ledger 相关测试通过]

## 5. Project Memory UI Rebuild

- [x] 5.1 [P0][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx` 或拆分后的 `components/list/*`,`components/detail/*`][目标: 区分 Conversation Turn / Manual Note / Legacy][完成定义: 列表项能显示类型 badge，详情按类型选择渲染方式]
- [x] 5.2 [P0][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/features/project-memory/hooks/useProjectMemory.ts`][目标: conversation turn 详情完整展示][完成定义: 详情明确展示完整“用户输入”和完整“AI 回复”，不再只展示旧 detail 草稿]
- [x] 5.3 [P0][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`][目标: 复制整轮内容][完成定义: 对 conversation turn，复制结果包含完整用户输入、完整 AI 回复、threadId、turnId]
- [x] 5.4 [P1][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx` 或拆分组件][目标: 手动 note 保留编辑，turn memory 默认只读][完成定义: 自动 turn 不显示自由编辑 detail 的保存入口；manual note 可继续编辑]
- [x] 5.5 [P1][文件:`src/features/project-memory/components/ProjectMemoryPanel.test.tsx`,`src/features/project-memory/hooks/useProjectMemory.test.tsx`][目标: UI 回归测试][完成定义: 覆盖 turn 详情、legacy 展示、manual note 编辑、复制整轮]
- [x] 5.Exit [依赖:5.1-5.5][验证:`pnpm vitest run src/features/project-memory`][目标: 用户可见体验完成][完成定义: 用户能从 UI 完整回看一轮问答]

## 6. Rust Module Split and Store Hardening

- [x] 6.1 [P1][文件:`src-tauri/src/project_memory.rs` -> `src-tauri/src/project_memory/*`,`src-tauri/src/lib.rs`,`src-tauri/src/command_registry.rs`][目标: 拆分 Rust Project Memory 单文件][完成定义: `model/store/commands/projection/settings/classification/compat` 边界清晰，命令注册不变]
- [x] 6.2 [P1][文件:`src-tauri/src/project_memory/store.rs`][目标: blocking worker 迁移][完成定义: 大体量 list/get/search/write 不直接阻塞 Tauri command 主执行路径；文件路径、临时文件和 rename 流程兼容 macOS/Windows/Linux]
- [x] 6.3 [P2][文件:`src-tauri/src/project_memory/store.rs`][目标: 日期分片与坏文件隔离][完成定义: 单日大文件可分片，单个坏 JSON 不拖垮整个 workspace 读取]
- [x] 6.4 [P2][文件:`src-tauri/src/project_memory/search.rs` 或等价文件][目标: 搜索索引优化][完成定义: 1k 条规模搜索不需要每次完整重建所有 projection]
- [x] 6.Exit [依赖:6.1-6.4][验证:`cargo test --manifest-path src-tauri/Cargo.toml project_memory` + `npm run check:large-files:gate`][目标: 后端可维护性达标][完成定义: 文件拆分后大文件门禁通过]

## 7. Delete Semantics Cleanup

- [x] 7.1 [P1][文件:`src/services/tauri/projectMemory.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`,`src-tauri/src/project_memory*`][目标: 移除 frontend `hardDelete` 开关][完成定义: facade 删除 API 不再暴露 `hardDelete?: boolean`]
- [x] 7.2 [P1][文件:`src-tauri/src/project_memory*`][目标: 明确 turn memory 删除语义][完成定义: conversation turn 删除为物理删除；legacy soft-deleted 兼容读取仍隐藏]
- [x] 7.3 [P2][文件:`src/features/project-memory/components/*`,`src/features/project-memory/hooks/useProjectMemory.ts`][目标: 删除后缓存一致性][完成定义: 删除后列表、详情、搜索均不残留旧内容]

## 8. Verification Gate

- [x] 8.1 [P0][验证:`rg -n "MAX_ASSISTANT_DETAIL_LENGTH|OutputDigest.detail|slice\\(0, MAX_ASSISTANT_DETAIL_LENGTH\\)" src/features/threads src/features/project-memory`][目标: 截断回流哨兵][完成定义: canonical `assistantResponse` 主路径不再命中截断逻辑]
- [x] 8.2 [P0][验证:`pnpm vitest run src/features/threads/hooks/useThreads.memory-race.integration.test.tsx src/features/project-memory src/features/composer src/features/context-ledger`][目标: 前端最小回归][完成定义: 自动记忆、项目记忆 UI、手动注入、Context Ledger 关键用例通过]
- [x] 8.3 [P0][验证:`cargo test --manifest-path src-tauri/Cargo.toml project_memory`][目标: 后端最小回归][完成定义: Project Memory 存储和模型测试通过]
- [x] 8.4 [P0][验证:`npm run typecheck`][目标: 类型门禁][完成定义: TS 类型全绿]
- [x] 8.5 [P0][验证:`node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` + `npm run check:heavy-test-noise`][目标: Heavy Test Noise Sentry 本地等价门禁][完成定义: 与 `.github/workflows/heavy-test-noise-sentry.yml` 中 Ubuntu/macOS/Windows 执行命令一致且通过]
- [x] 8.6 [P0][验证:`node --test scripts/check-large-files.test.mjs` + `npm run check:large-files:near-threshold` + `npm run check:large-files:gate`][目标: Large File Governance Sentry 本地等价门禁][完成定义: 与 `.github/workflows/large-file-governance.yml` 中 Ubuntu/macOS/Windows 执行命令一致且通过]
- [x] 8.7 [P0][验证:`pnpm vitest run src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`][目标: 引擎覆盖矩阵][完成定义: Codex 与 Claude Code 覆盖 full `userInput + assistantResponse` 主链路；Gemini 至少覆盖 normalized adapter smoke，且无 engine-specific Project Memory store/API]
- [x] 8.8 [P1][验证:`npm run lint && npm run build`][目标: 发布候选门禁][完成定义: lint/build 通过]

## 9. Composer Memory Reference Entry

- [x] 9.1 [P1][文件:`src/features/composer/components/ChatInputBox/ButtonArea.tsx`,`src/styles/composer.part2.css`,`src/i18n/locales/*`][目标: 将单次记忆引用入口放入发送按钮旁][完成定义: 工具栏只保留记忆 icon，不常驻说明文本；未开启时点击 icon 弹出二次确认]
- [x] 9.2 [P1][文件:`src/features/composer/components/ChatInputBox/ButtonArea.tsx`,`src/styles/composer.part2.css`][目标: 确认弹窗保持紧凑][完成定义: 弹窗使用标题、状态、一句说明和确认/取消按钮，不出现两段以上长提示或大面积留白]
- [x] 9.3 [P1][文件:`src/features/composer/components/ChatInputBox/ButtonArea.test.tsx`,`src/features/composer/components/Composer.memory-reference.test.tsx`][目标: 覆盖单次启用/自动关闭路径][完成定义: 未开启时需确认才启用；开启后点击 icon 直接关闭；发送或上下文重置后恢复关闭]

## Parallelization Notes

- `1.x` 必须先完成，不能和 UI 大改并行。
- `2.x` 与 `3.x` 可由前后端分别推进，但必须共享同一 DTO。
- `4.x` 必须在 `1.x` 之后、`5.x` 之前完成，避免 UI 写到错误读模型上。
- `6.x` 是 hardening，不得阻塞 P0 全文记忆落地。
