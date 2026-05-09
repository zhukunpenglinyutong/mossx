## Why

用户反馈 Claude Code 对话里出现 `This session is being continued from a previous conversation...` 这类 continuation summary，说明 engine runtime 的控制面数据已经穿透到普通对话层。现有修复主要针对单点污染样本，如 Codex `app-server` payload、Claude local command wrapper；但根问题是跨引擎系统缺少统一的 transcript channel firewall，导致 control-plane、synthetic runtime event、history restore payload 和 user dialogue 共享同一条投影路径。

本提案把问题从“过滤某几个脏字符串”升级为“引擎隔离 contract”：任何 engine-specific control-plane 或 synthetic continuation 事件都必须带有来源和通道语义，未通过来源校验的记录只能被隔离、格式化为 non-dialogue event，或进入诊断 quarantine，绝不能作为 user / assistant 正文进入会话。

## 目标与边界

- 建立跨 Claude / Codex / Gemini / OpenCode 的 transcript channel isolation 规则。
- 明确 control-plane、synthetic runtime event、history restore payload、user dialogue 的来源边界。
- 阻止 continuation summary、Codex app-server initialize、developer instructions、Claude local command XML-like wrapper 等记录被投影为普通聊天气泡。
- 保持非破坏性：不删除、不重写用户原始 JSONL 或外部 engine transcript。
- 让 backend loader 成为权威过滤点，frontend loader / renderer 作为兼容兜底。
- 让后续新 engine 接入必须声明 channel taxonomy 和 contamination gates。

## 非目标

- 不在本 change 里实现完整代码修复。
- 不迁移或清洗用户已有 Claude / Codex 历史文件。
- 不把所有控制面事件都暴露成 debug UI。
- 不改变 Claude Code、Codex CLI、Gemini、OpenCode 的原生协议。
- 不为每一种脏文本维护无限增长的 keyword blacklist。

## 技术方案对比

### 方案 A：继续补关键词过滤

- 做法：在 Claude history loader 里追加 `This session is being continued...`、`Summary:`、`developer_instructions=` 等字符串过滤。
- 优点：实现快，能快速止血已知样本。
- 缺点：每次 engine runtime 增加新 synthetic prompt 都会漏；误删正常用户文本的风险持续上升；无法约束 Codex / Gemini / OpenCode 后续接入。

### 方案 B：按 engine 分散实现过滤器

- 做法：Claude loader、Codex loader、Gemini loader 各自维护自己的污染分类器。
- 优点：保留 engine-specific 语义，局部改动较小。
- 缺点：容易 drift；跨引擎误路由和 shared renderer 仍可能绕过单个 loader；无法形成统一质量门禁。

### 方案 C：统一 transcript channel firewall（选中）

- 做法：在 engine boundary 定义通道分类和来源证明：`dialogue`、`reasoning`、`tool`、`control-plane`、`synthetic-runtime`、`diagnostic`、`quarantine`。任何进入 user-visible conversation surface 的记录必须通过 channel projection policy；未知或跨引擎来源不一致记录默认 fail closed。
- 优点：从结构上防止控制面污染；兼容现有 Claude/Codex 专项修复；后续 engine 接入有明确 contract；测试可以用统一污染矩阵覆盖。
- 缺点：需要补设计和多层验证矩阵，实现比字符串过滤更重。

## What Changes

- 新增跨引擎 transcript channel taxonomy：区分 user dialogue、assistant dialogue、reasoning、tool event、control-plane、synthetic runtime event、diagnostic event、quarantine record。
- 修改 `engine-control-plane-isolation`：要求 runtime launch、history scan、history load、frontend fallback 都执行来源与通道校验。
- 修改 `claude-history-transcript-visibility`：明确 Claude continuation / compaction summary 不能作为普通 user message、session title 或 assistant answer 展示。
- 要求 backend 对 session list / first message / message count 进行污染前置分类，control-only transcript 不进入普通会话列表。
- 要求 frontend 对旧后端、缓存 payload、测试注入 payload 做兜底 channel classification。
- 要求 CI 增加 cross-engine contamination matrix，覆盖 continuation summary、Codex app-server payload、developer instructions、Claude local command wrapper、normal keyword text。

## 边界约束

- **Engine identity boundary**：Codex、Claude、Gemini、OpenCode 的 runtime identity 必须先于 payload 发送完成确认；任何 engine-specific control-plane payload 不得发送到未证明 capability 的 runtime。
- **Transcript channel boundary**：`control-plane`、`synthetic-runtime`、`diagnostic`、`quarantine` 记录不得降级为 `dialogue.user` 或 `dialogue.assistant`。
- **Projection boundary**：session list、first message、message count、conversation assembler、renderer 都必须消费已分类后的 record；禁止在 renderer 层才临时隐藏污染文本作为唯一修复。
- **Persistence boundary**：本提案不删除、不修改、不迁移用户原始 Claude / Codex JSONL；隔离发生在 read / restore / projection 阶段。
- **Keyword boundary**：禁止把修复做成无限增长的关键词黑名单；正常用户文本提到 `app-server`、`developer`、`summary`、`previous conversation`、`resume` 等词必须保留。
- **Ownership boundary**：backend classifier 是权威来源；frontend fallback 只能补旧 payload / cache / remote 兼容，不得成为唯一 gate。
- **Scope boundary**：本 change 聚焦跨引擎 transcript channel isolation，不顺手重构完整 conversation item 类型系统、renderer 架构或外部 engine 协议。

## macOS / Windows 兼容性约束

- macOS、Windows、Linux 对同一类 JSONL / runtime event 输入必须产生等价的 visible transcript semantics；不得用 Windows-only 或 macOS-only 分支掩盖 classifier 缺口。
- Windows `.cmd` / `.bat` wrapper、PATH proxy、custom binary 只影响 launch mechanics，不影响 engine identity gate；wrapper 可执行不等于 capability 通过。
- macOS / Linux direct binary 也必须执行 capability gate；不得因为没有 wrapper 层就跳过 engine identity 校验。
- Windows CRLF、macOS/Linux LF 行结尾都必须被 JSONL reader 等价处理；trim 行边界不得改变 message content 分类。
- Windows path 如 `C:\Users\...\project` 与 macOS path 如 `/Users/.../project` 只能用于 workspace attribution，不得用于判断某条 record 是否为 dialogue / control-plane / synthetic-runtime。
- CI 或本地 focused tests 必须包含至少一组 Windows-style cwd / CRLF fixture 和一组 macOS-style cwd / LF fixture，并验证分类结果一致。
- 如果真实 Windows runner 暂不可用，必须在交付说明中记录缺口，并用 platform-neutral fixture tests 覆盖协议层行为；不得声称已完成 Windows 端到端验证。

## CI 门禁

- **OpenSpec gate**：`openspec validate harden-engine-transcript-channel-isolation --strict --no-interactive` 必须通过。
- **Backend focused gate**：`cargo test --manifest-path src-tauri/Cargo.toml engine::claude_history` 必须覆盖 continuation summary、Codex app-server payload、developer instructions、control-only transcript、mixed transcript、normal lookalike text。
- **Frontend focused gate**：`pnpm vitest run src/features/threads/loaders/claudeHistoryLoader.test.ts` 必须覆盖 legacy/cached payload fallback、non-dialogue event identity、normal lookalike text。
- **Contract/type gate**：`npm run check:runtime-contracts` 与 `npm run typecheck` 必须通过，确保新增/调整的 projection identity 不破坏 shared contracts。
- **CI reachability gate**：新增 regression tests 必须能被现有 CI 的 backend/frontend test jobs 执行；如果现有 batch 脚本排除相关文件，必须同步调整 CI 或脚本。
- **Platform matrix gate**：测试矩阵必须标注 macOS-style LF fixture、Windows-style CRLF fixture、wrapper/proxy misroute fixture；缺少真实平台 runner 时必须记录 residual risk。
- **No-regression gate**：测试必须同时证明污染记录被隔离，以及正常用户自然语言 lookalike 文本未被误删。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `engine-control-plane-isolation`: 扩展为跨引擎 transcript channel firewall，要求所有 control-plane / synthetic runtime payload 必须通过来源和通道校验后才能投影。
- `claude-history-transcript-visibility`: 扩展 Claude history 可见性规则，禁止 continuation / compaction summary 作为普通用户对话展示，并要求 mixed transcript 保留真实消息。

## Impact

- Backend:
  - `src-tauri/src/engine/claude_history.rs`
  - `src-tauri/src/engine/claude_history_entries.rs`
  - Codex / shared engine runtime launch 与 history projection 相关模块
- Frontend:
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - shared history loader / conversation assembler / renderer projection path
- Specs:
  - `openspec/specs/engine-control-plane-isolation/spec.md`
  - `openspec/specs/claude-history-transcript-visibility/spec.md`
- No new external dependency, database migration, or destructive transcript rewrite.

## 验收标准

- Claude continuation summary 不得作为 user bubble、assistant answer、session title 或 first message 出现。
- Codex app-server control-plane payload 不得进入 Claude transcript 可见会话。
- control-plane-only transcript 不得生成普通会话卡片。
- mixed transcript 必须保留真实 user / assistant 消息，只隔离污染记录。
- 普通用户自然语言提到 `app-server`、`summary`、`previous conversation`、`developer` 等词时不得被关键词误删。
- macOS-style LF fixture 与 Windows-style CRLF fixture 必须得到等价可见结果。
- wrapper / PATH proxy / custom binary 场景必须遵守 capability gate，不能因可执行或可启动就跨引擎发送 payload。
- focused Rust / Vitest regression tests 覆盖污染矩阵，并能被现有 CI 或明确新增 gate 执行。
- `openspec validate harden-engine-transcript-channel-isolation --strict --no-interactive`、focused Rust、focused Vitest、`npm run check:runtime-contracts`、`npm run typecheck` 通过，或在交付中明确记录阻塞原因。
