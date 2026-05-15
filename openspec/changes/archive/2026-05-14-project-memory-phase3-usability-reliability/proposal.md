## Why

Project Memory Phase 2 已经解决“完整保存一轮用户输入 + AI 回复”的底座问题，但日常使用仍然暴露出三个新的瓶颈：管理弹窗像调试面板、`@@` 引用候选左侧信息密度失控、记忆注入仍缺少用户可控的显式入口。

Phase 3 的目标不是马上做更复杂的智能检索，而是把 Project Memory 推进到可用、可控、可验真的工作流：用户能快速整理记忆，能在 Composer 中低成本选择或开启记忆参考，也能知道本次对话到底参考了什么。

## 目标与边界

### 目标

- Phase 3A：重构 Project Memory 弹窗布局，把它从“长卡片列表 + 大详情”升级为可浏览、可整理、可诊断的记忆工作台。
- Phase 3B：优化 `@@` 手动引用候选左侧列表，采用 compact preview，右侧展开详情保持现有完整展示能力。
- Phase 3C：在 Composer 底部工具区增加 Memory Reference icon toggle，用户显式开启后，本次发送才会参考项目记忆。
- Phase 3D：引入只读 Memory Scout 流程，按当前 workspace 和用户输入查询相关记忆，生成可追踪的 Memory Brief 给主会话使用。
- Phase 3E：引入 Review Inbox、记忆健康状态和 reconcile/diagnostics，帮助用户治理自动记忆的质量。
- 保持 Phase 2 的 canonical turn memory 原则：`userInput` / `assistantResponse` 仍是事实源，Phase 3 只改变管理、选择、检索和注入体验。
- 将 Heavy Test Noise Sentry 与 Large File Governance Sentry 纳入 Phase 3 发布门禁，确保新增 UI、测试、诊断逻辑不会制造测试噪音或大文件债务。
- 所有新增路径、文件 I/O、测试命令、超时和取消逻辑必须使用 Windows/macOS/Linux 兼容写法。

### 非目标

- 不引入 embedding、向量数据库、云同步或跨设备同步。
- 不保存 hidden chain-of-thought；Memory Scout 只返回可见记忆的摘要和来源。
- 不恢复旧的静默自动注入；Phase 3 的记忆参考必须由用户在 Composer 中显式开启。
- 不改变右侧 `@@` 详情预览的完整展开能力。
- 不为 Claude Code、Codex、Gemini 设计三套记忆系统；记忆检索和注入仍走通用 Project Memory contract。
- 不把 Project Memory 弹窗改成营销式大页面；它必须保持高密度、工具化、可快速扫描。
- 不在 Phase 3 内建设通用子 agent 编排平台；Memory Scout 只是 Project Memory 的受限只读检索/摘要流程。
- 不让 Memory Scout 读取项目文件、执行 shell 命令或访问 Project Memory 之外的数据源。
- 不为了排序、摘要或模糊检索引入新依赖；若后续确实需要，必须另开设计决策并通过依赖必要性评审。
- 不新增 OS-specific 脚本、路径分隔符拼接或只在 macOS 可运行的测试流程。

## 技术方案选项

| 选项 | 描述 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 继续强化手动 `@@` 注入 | 只优化候选列表和手动选择，不增加 Composer toggle | 实现最小，风险低 | 用户仍然需要逐条选择，无法表达“本轮帮我参考相关记忆” | 只覆盖 Phase 3B，不足以形成闭环 |
| B. 恢复旧自动注入开关 | 使用设置项全局开启相关性检索注入 | 表面自动化程度高 | 容易黑盒、污染上下文，和现有“自动注入固定关闭”规格冲突 | 不采用 |
| C. 显式 Memory Reference + Memory Scout | Composer 提供本次发送的记忆参考开关，Scout 只读查询并生成 Brief | 用户可控、主会话输入更干净、来源可追踪、失败可降级 | 需要新增状态、查询摘要和可观测性 | 采用 |

## What Changes

- Project Memory 弹窗改为 workbench layout：
  - 紧凑列表、折叠 quick tags、清晰详情区、健康/待整理入口。
  - Conversation Turn / Manual Note / Legacy 继续分型展示。
  - 详情仍完整展示用户输入、AI 回复和元信息。
- `@@` 手动记忆引用候选左侧改为 compact list：
  - 标题 1 行，摘要 2-3 行，metadata 1 行。
  - 长内容不撑高左侧列表；右侧详情保持完整展开能力。
- Composer 底部工具区新增 Memory Reference icon toggle：
  - 默认关闭。
  - 用户开启后仅作用于本次发送。
  - 显示查询中、已引用 N 条、失败降级等状态。
- 新增 Memory Scout 流程：
  - 只读当前 workspace Project Memory。
  - 根据用户输入和当前上下文生成 Memory Brief。
  - Brief 包含摘要、来源 memory id/title/type/time、冲突或不确定项。
  - Scout 超时或失败不阻断主会话发送。
- 新增 Review Inbox 与健康治理：
  - 自动 turn memory 支持待整理/已整理/过期/异常视图。
  - 记忆显示健康状态：完整、仅用户输入、仅 AI 回复、等待融合、捕获失败。
  - 提供 reconcile/diagnostics 入口，扫描半截记忆和重复 turn key。
- 新增工程治理约束：
  - 本地等价执行 `.github/workflows/heavy-test-noise-sentry.yml` 中的 parser tests 与 gate。
  - 本地等价执行 `.github/workflows/large-file-governance.yml` 中的 parser tests、near-threshold watch 与 hard gate。
  - Phase 3 实现必须避免平台专用路径、换行、shell 语法和临时文件假设。

## Capabilities

### New Capabilities

- `project-memory-health-review`: 覆盖记忆健康状态、Review Inbox、reconcile/diagnostics、批量治理和状态筛选。
- `project-memory-scout-agent`: 覆盖 Memory Scout 的只读检索、Memory Brief 生成、来源追踪、超时降级和主会话注入契约。

### Modified Capabilities

- `project-memory-ui`: Project Memory 弹窗从当前列表/详情弹窗升级为高密度 workbench layout，并加入健康/待整理入口。
- `composer-manual-memory-reference`: `@@` 候选左侧列表改为 compact preview，右侧详情预览保持完整展开。
- `project-memory-consumption`: 将“自动注入固定关闭”升级为“默认关闭 + 用户显式开启本次 Memory Reference”，并由 Memory Scout 生成可追踪 Brief。

## Impact

- Frontend:
  - `src/features/project-memory/components/ProjectMemoryPanel.tsx`
  - `src/features/project-memory/hooks/useProjectMemory.ts`
  - `src/features/project-memory/utils/projectMemoryDisplay.ts`
  - `src/features/composer/components/ComposerInput.tsx`
  - `src/features/composer/components/ChatInputBox/*`
  - `src/features/threads/hooks/useThreadMessaging.ts`
- Backend:
  - `src-tauri/src/project_memory/commands.rs`
  - `src-tauri/src/project_memory/store.rs`
  - `src-tauri/src/project_memory/search.rs`
  - `src-tauri/src/project_memory/model.rs`
- Specs:
  - Existing Project Memory UI / consumption / `@@` reference specs will receive delta requirements.
  - New health review and scout agent specs will define Phase 3 behavior.
- No new dependency is required for Phase 3. If later implementation needs fuzzy search or ranking libraries, that must be justified in the implementation design before adding dependencies.
- CI/Governance:
  - `.github/workflows/heavy-test-noise-sentry.yml`
  - `.github/workflows/large-file-governance.yml`
  - Local equivalent commands must remain runnable on Node 20 across Ubuntu/macOS/Windows.

## Acceptance Criteria

- Project Memory 弹窗在 100 条记忆下仍能快速扫描，左侧列表不会被长内容撑爆。
- `@@` 候选左侧同屏至少可稳定展示 5-8 条候选，右侧详情仍可完整阅读。
- Composer Memory Reference toggle 默认关闭；开启后仅本次发送触发 Memory Scout。
- Memory Scout 返回的 Brief 必须带来源引用，不允许返回无法追踪的笼统结论。
- Scout 查询失败、超时或无结果时，主会话仍正常发送原始用户输入。
- 自动记忆可以按健康状态和 Review 状态筛选，用户能清理、保留、转手动 note 或标记过期。
- 所有新增行为必须覆盖 Codex 与 Claude Code 主发送路径；Gemini 至少保持共享 contract smoke 验证。
- 严格通过 `openspec validate project-memory-phase3-usability-reliability --strict --no-interactive`。
- 发布候选必须通过 Heavy Test Noise Sentry 本地等价命令：
  - `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
  - `npm run check:heavy-test-noise`
- 发布候选必须通过 Large File Governance Sentry 本地等价命令：
  - `node --test scripts/check-large-files.test.mjs`
  - `npm run check:large-files:near-threshold`
  - `npm run check:large-files:gate`
- Windows/macOS/Linux 兼容性必须在实现中显式验证：不得使用硬编码 `/` 或 `\` 路径拼接，不得依赖 POSIX-only shell 语法，不得使用大小写敏感文件名假设。
