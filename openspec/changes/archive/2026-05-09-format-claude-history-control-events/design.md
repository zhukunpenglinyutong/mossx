## Context

Claude Code JSONL transcript 会记录真实对话，也会记录 CLI local command、permission mode、snapshot、queue、MCP instructions、skill listing、hook summary 等控制面事件。当前 macOS 本地导入问题样本可以打开，说明 JSONL 文件本身不是必然损坏；但 raw `<command-name>`、`<local-command-stdout>` 和 synthetic `No response requested.` 仍会穿透到可见对话，Windows 用户则更容易在 history restore / WebView2 / 旧缓存组合下看到空白或异常。

现有 `fix-claude-control-plane-session-contamination` 已经处理 Codex / GUI control-plane 污染，如 `initialize`、`clientInfo=ccgui`、`developer_instructions` 和 Codex `app-server`。这次不是重新打开跨引擎 fallback，而是在 Claude-local transcript 内补一层“用户可理解事件格式化 + 内部记录过滤”的分类 contract。

## Goals / Non-Goals

**Goals:**

- 不再把 Claude CLI local command wrapper 文本当普通聊天气泡展示。
- 将 `/resume` 失败、model switch、interruption marker 等用户可理解事件格式化为 non-dialogue event row / status tag。
- 隐藏 permission-mode、snapshot、MCP instructions、skill listing、queue bookkeeping、hook summary、turn duration、synthetic no-response 等内部记录。
- 保持 backend loader 与 frontend fallback loader 行为一致。
- 用用户提供的两类样本抽象出稳定测试矩阵，覆盖 Windows 主要触发形态但不写 Windows-only 分支。

**Non-Goals:**

- 不修改 Claude JSONL 原文件。
- 不改变正常 Claude realtime 发送协议。
- 不重构完整 `ConversationItem` 类型系统，除非实现阶段确认现有 item 无法表达 compact event。
- 不把所有内部控制面记录展示为 debug 面板。

## Decisions

### Decision 1: 使用分类器，而不是单一过滤器

选择：引入 Claude history local-control classifier，把记录分成 `hidden internal record`、`displayable local event`、`normal conversation row`。

原因：全部过滤会丢掉 `/resume` 失败和 model switch 这类用户理解历史时需要的信息；全部展示又会让 `skill_listing`、MCP instructions 和 queue bookkeeping 污染会话阅读面。

替代方案：

- 全部过滤：最安全但历史断层。
- 全部展示为卡片：debug 友好但普通用户噪声过高。

### Decision 2: Displayable local events 使用 non-dialogue identity

选择：格式化后的事件不能继续是普通 user / assistant message。实现可以优先复用现有 conversation item 中适合表达 status/tool event 的结构；如果现有结构会污染 assistant/user 语义，再增加最小字段或最小 item kind。

原因：这类事件不是用户正文，也不是模型答复。把它们继续挂在 user/assistant 会影响 reducer、empty-state、assistant final 判断、thinking visibility 以及后续 history replay 等逻辑。

实现约束：

- 事件 title / label 要短，如 `Resume failed`、`Model changed`、`Interrupted`。
- detail 可以保留 sanitized message，如 `Session 1778306483383 was not found.`。
- 禁止保留 raw `<local-command-stdout>` wrapper。

### Decision 3: Backend 是权威，Frontend 是兼容兜底

选择：后端 `claude_history.rs` 在 scan/load 阶段先做分类；前端 `claudeHistoryLoader.ts` 保留同语义 fallback，用于旧后端、remote/cached payload 或测试注入数据。

原因：session list、first message、message count、load result 都由 backend 影响；只在前端处理不能解决伪会话或空白列表。前端兜底仍必要，因为历史 payload 可能来自旧缓存或远端服务。

### Decision 4: 高置信结构匹配，不做关键词过滤

选择：只匹配明确结构：

- `message.content` 以 `<command-name>`、`<command-message>`、`<command-args>`、`<local-command-stdout>`、`<local-command-stderr>`、`<local-command-caveat>` 开头。
- entry `type` / `subtype` 明确为内部控制面，如 `permission-mode`、`file-history-snapshot`、`queue-operation`、`attachment`、`system.local_command`。
- assistant `model=<synthetic>` 且文本为 `No response requested.`。
- 明确 interruption marker。

普通自然语言提到 `resume`、`stdout`、`local-command`、`app-server` 不触发过滤或格式化。

### Decision 5: 跨平台行为统一，路径只作为归属信号

选择：Claude local-control 分类器只依赖 JSONL 结构、message role、entry type/subtype、wrapper tag 和 synthetic model signal，不依赖当前 OS、路径分隔符或用户 home 目录格式。

实现约束：

- Rust 侧路径处理继续使用 `Path` / `PathBuf` / 现有 workspace path matching，不手写 `/` 或 `\` 分割逻辑。
- JSONL 读取必须兼容 LF 与 CRLF；只 trim 行边界，不能因为 Windows 换行或路径反斜杠改变内容分类。
- 测试样本需要同时包含 macOS 风格 cwd（如 `/Users/...`）和 Windows 风格 cwd（如 `C:\Users\...\project`），并验证可见消息语义一致。
- 前端 fallback 不解析本地文件路径来决定是否过滤控制面记录；只使用 payload 结构和 wrapper tag。

### Decision 6: CI 门禁优先复用现有流水线，缺口才补新 gate

选择：本 change 的 regression coverage 应进入现有 CI 可执行路径，而不是只保留本地手工命令。

现有 CI 已有：

- Rust backend suite：`.github/workflows/ci.yml` 的 `test-tauri` job 执行 `cargo test`。
- Frontend suite：`test-js` job 执行 `npm run test`。
- Windows smoke/integration：`test-windows` job 执行 `npm run doctor:win` 和 `node scripts/test-batched.mjs`。
- Type/runtime contract：`typecheck` job 执行 `npm run check:runtime-contracts` 与 `npm run typecheck`。

实现约束：

- 新增 Rust tests 必须能被 `cargo test --manifest-path src-tauri/Cargo.toml engine::claude_history` 和 CI 的 `cargo test` 覆盖。
- 新增 Vitest tests 必须能被 focused command 与 CI 的 `npm run test` 覆盖；如果测试文件被 batch 脚本排除，必须调整脚本或 CI。
- 本地交付至少运行 focused Rust、focused Vitest、`npm run typecheck`、`npm run check:runtime-contracts`、OpenSpec strict validation；若全量 CI 无法本地等价运行，最终说明 residual risk。

### Decision 7: `0.4.10` 线索作为回归窗口，不作为回退目标

侧查显示 `v0.4.10` 已有 summary-only filter，但缺少 load/parser 层的 local-control 分类。`v0.4.10..v0.4.14` 又引入了历史恢复、幕布 assembly、message rows、thread reducer/action 的大规模改动；用户感知“0.4.10 前没有现象”很可能来自渲染链路对同一类脏输入的容忍度变化。

实现含义：

- 不把修复做成版本判断或 data migration。
- 不假设大模型返回是根因；JSONL 中的 control-plane/local-command rows 是确定性输入污染，幕布白屏是下游放大效应。
- Regression tests 要覆盖“污染存在但有真实对话”的 mixed transcript，防止后续幕布重构再次把污染当成空白或普通消息。

## Risks / Trade-offs

- [Risk] 新的 formatted event item 与现有 renderer 不兼容，导致需要额外 UI 适配。  
  Mitigation: 实现优先复用现有 tool/status card 能力；如新增 item kind，必须补 renderer fallback 和 tests。

- [Risk] 分类器前后端 drift。  
  Mitigation: Rust 和 Vitest 使用同一组语义样本覆盖 `/resume`、model switch、synthetic no-response、internal metadata、normal keyword text。

- [Risk] 过度过滤真实用户消息。  
  Mitigation: 只使用结构化 wrapper 和 metadata signals，不按普通关键词过滤。

- [Risk] Windows 白屏还有 CSS/WebView2 因素。  
  Mitigation: 本 change 先移除确定性脏输入；若过滤后 Windows 仍白屏，再单独进入 render-safe 或 WebView2 层调查。

- [Risk] macOS 本地样本正常打开导致误判为无需修复。  
  Mitigation: 验证标准不以“能打开”为唯一指标，而以 raw wrapper 不进入普通消息、formatted event 稳定、CI/Windows runner 可覆盖为准。

## Migration Plan

1. 在 backend Claude history 中加入 local-control classifier。
2. 调整 session summary scan：internal-only rows 不计入 message count；displayable event 不作为 first user message，但可帮助避免把 mixed transcript 判为空。
3. 调整 load path：隐藏 internal-only rows；把 displayable events 转成 non-dialogue item payload。
4. 在 frontend loader fallback 中加入同语义分类，保证旧 payload 不显示 raw wrappers。
5. 补 Rust / Vitest tests，样本同时覆盖 macOS cwd、Windows cwd、LF/CRLF 行结尾与 `v0.4.10` 之前已潜伏的 wrapper 形态。
6. 运行 focused tests、type/runtime contract gates 与 OpenSpec strict validation，并确认测试被现有 CI jobs 覆盖。

Rollback 策略：若 formatted event 适配风险过高，可临时降级为隐藏 displayable local events，但不得恢复 raw wrapper 作为普通聊天气泡。

## Open Questions

- 实现阶段优先复用哪个现有 `ConversationItem` 类型表达 compact control event，需要通过现有 renderer 和 type 定义确认。
- 是否需要为 formatted local event 增加 i18n key，还是复用已有 status/tool copy。实现阶段应避免硬编码 UI 文案。
