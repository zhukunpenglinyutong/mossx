## Context

mossx 是多引擎桌面应用，Claude Code、Codex、Gemini、OpenCode 在同一 conversation surface 上被统一展示。这个统一投影层带来一个结构性风险：不同 engine 的 control-plane protocol、runtime synthetic message、history restore payload 和真实用户对话被压成同一种 `ConversationItem` 或类似中间结构后，下游 renderer 很难再判断它是不是“真实对话”。

已知现象包括：

- Codex app-server `initialize` / `developer_instructions` / `app-server` payload 进入 Claude JSONL。
- Claude local command wrapper 如 `<local-command-stdout>` 被显示成普通聊天文本。
- Claude continuation / compaction summary 如 `This session is being continued from a previous conversation...` 被显示成 user bubble。
- control-plane-only transcript 生成伪会话或空白历史。

这些问题不应继续按单点字符串修补处理。正确边界是：任何记录进入 user-visible conversation surface 前，必须先确定 engine provenance 与 transcript channel；无法证明为 dialogue 的记录不得以 dialogue 身份出现。

## Goals / Non-Goals

**Goals:**

- 为每个 engine transcript record 建立 `engine`, `source`, `channel`, `projection` 的最小 contract。
- 在 backend history scan/load 阶段先执行权威分类，frontend 保留兼容兜底。
- 让 unknown / cross-engine / synthetic continuation payload 默认 fail closed。
- 保留真实对话和用户可理解的 control event，但必须通过 non-dialogue identity 展示。
- 用测试矩阵覆盖“污染输入 + 正常关键词文本”，避免过滤。

**Non-Goals:**

- 不重写全部 engine adapter。
- 不强制立即替换所有现有 `ConversationItem` 类型。
- 不修改外部 engine 生成的原始 transcript。
- 不提供用户手动开关绕过隔离。

## Decisions

### Decision 1: 使用 channel taxonomy，而不是 keyword blacklist

选择：定义统一 channel taxonomy：`dialogue.user`、`dialogue.assistant`、`reasoning`、`tool`、`control-plane`、`synthetic-runtime`、`diagnostic`、`quarantine`。

理由：污染样本会持续变化，关键词过滤必然追不上；channel taxonomy 让系统按来源和结构判断，而不是按文本猜测。

替代方案：

- 关键词 blacklist：止血快，但误删和漏删不可控。
- 每 engine 独立过滤：短期低耦合，但长期 drift 高。

### Decision 2: Backend 权威，Frontend 兜底

选择：backend history scan/load 必须在产生 session summary、message count、first message 前分类；frontend loader 仅处理旧缓存、旧后端 payload、remote payload 或测试注入数据。

理由：如果污染已经进入 session list，前端只隐藏消息无法解决伪会话、错标题、空白历史。

替代方案：

- 只在 renderer 隐藏：太晚，assembler/reducer 已经被污染。
- 只在 backend 过滤：旧缓存和兼容 payload 仍可能穿透。

### Decision 3: Unknown channel 默认 quarantine

选择：跨引擎来源不一致、synthetic continuation summary、缺失 role 但带控制面结构的记录，默认进入 quarantine，不作为普通 dialogue 展示。quarantine 可以用于开发诊断，但不进入普通 conversation surface。

理由：这是安全边界，不是内容美化。用户看不到一条真实消息，代价小于把控制面 prompt 当用户输入继续执行。

替代方案：

- 默认展示 unknown：兼容性好，但会继续污染。
- 默认删除 unknown：破坏性强，不利于调试和用户信任。

### Decision 4: Displayable control event 必须使用 non-dialogue identity

选择：`/resume failed`、`model changed`、`interrupted` 等用户可理解事件可以显示，但必须是 tool/status/event item，不得是 user / assistant bubble。

理由：这些事件解释历史状态，但不是用户正文，也不是模型答复。错误身份会影响 final answer、empty-state、assistant status、history replay 和 fork/rewind。

### Decision 5: 新 engine 接入必须声明 projection policy

选择：后续 engine adapter 在接入 history/realtime 前必须明确哪些 runtime events 可以进入 dialogue，哪些只能进入 tool/status，哪些必须 quarantine。

理由：引擎隔离不是 Claude/Codex 特例，而是 shared runtime architecture 的入口合同。

## Risks / Trade-offs

- [Risk] 分类器过严导致少量合法历史不可见。Mitigation: quarantine 保留诊断证据，mixed transcript 保留真实消息，测试覆盖正常关键词文本。
- [Risk] 前后端分类 drift。Mitigation: 用同一污染矩阵覆盖 Rust 与 Vitest，命名和场景保持一致。
- [Risk] 现有 renderer 缺少合适 non-dialogue event surface。Mitigation: 优先复用现有 tool/status item；若新增 kind，必须补 assembler 与 renderer fallback。
- [Risk] 旧 transcript 中没有明确 metadata。Mitigation: 对高置信结构做隔离；低置信自然语言不按关键词删除。
- [Risk] Windows 白屏仍有 WebView2 或 renderer 性能因素。Mitigation: 本 change 只解决确定性输入污染；若过滤后仍复现，再拆 render-layer change。

## Migration Plan

1. 抽象 shared contamination fixture matrix，覆盖 continuation summary、Codex app-server payload、developer instructions、Claude local command wrapper、synthetic no-response、normal keyword text。
2. Backend 增加或收敛 engine transcript classifier，先应用到 Claude history scan/load，再评估 Codex/Gemini/OpenCode history path。
3. Frontend loader 增加 fallback classifier，并确保 assembler / renderer 不把 non-dialogue event 当 user / assistant。
4. 对 session list、first message、message count、load result 分别补回归测试。
5. 运行 focused Rust / Vitest / typecheck / runtime-contract / OpenSpec strict validation。

Rollback 策略：如果 non-dialogue event 展示风险过高，临时把 displayable control event 降级为隐藏或诊断 quarantine；但不得恢复为普通 dialogue。

## Open Questions

- 是否需要新增 shared Rust/TypeScript fixture 文件，还是在两端测试中手工保持矩阵一致。
- Codex history 是否已有独立 transcript loader，需要在本 change 首轮实现时一并纳入。
- quarantine 诊断是否仅保留日志，还是后续提供开发者模式查看入口。
