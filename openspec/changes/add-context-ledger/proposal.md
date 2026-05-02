## Why

当前客户端已经开始提供 `context usage`、`project memory`、`manual memory selection`、`Codex compaction` 与 `composer context` 相关能力，但用户仍无法回答一个最基本的问题：当前这一轮上下文到底由什么组成、谁占了多少、哪部分是自动进来的、压缩后到底丢了什么。

这导致两个直接后果：第一，用户只能在 token 接近上限时被动看到一个百分比，而无法主动治理上下文；第二，系统即使加入 memory / compaction / source grouping，也很难建立真正的信任，因为用户看不见“上下文账本”。当前已经有 `project-memory-*`、`composer-context-*` 与 Codex compaction 相关能力，正是把它们统一收口成 `Context Ledger` 的最好时机。

## 目标与边界

### 目标

- 新增独立的 `Context Ledger` surface，把当前会话上下文拆成可理解、可审计、可操作的结构化账本。
- Phase 1 优先适配 `Codex`、`Claude Code` 与 `Gemini` 三类主引擎，让账本能力先覆盖当前最重要的多引擎对话路径。
- 让用户显式看到每轮上下文由哪些来源组成；Phase 1 以前端 / send-preparation 已可观测来源为主，例如：
  - recent turns
  - manually pinned memories
  - attached resources / files
  - tool outputs
  - workspace / helper context
  - compaction summaries
- 展示每个上下文块的 token 占用、来源、注入原因、最近更新时间与是否可移除/可固定。
- 在 compaction / memory injection / manual selection 之后提供前后变化可解释性，避免“系统偷偷改了上下文”。
- 保持现有消息发送与 memory/compaction 语义兼容；Context Ledger 是解释与治理层，不是新的发送协议分叉。

### 边界

- Phase 1 优先覆盖 frontend 已能观测到的上下文来源，不要求一次性做到所有 engine 的 100% 精确 token attribution。
- Phase 1 首批 MUST 以 `Codex / Claude Code / Gemini` 为优先适配对象；其他引擎可以在 block attribution 模型稳定后追加。
- 对 provider-only 的 `system / engine injected` 段，若当前缺少稳定 signal，Phase 1 允许先以 shared / degraded summary 明示，而不是伪装成精确 attribution。
- Phase 1 不重做模型服务端真实 prompt 拼接器；允许先做 client-visible effective context projection。
- Phase 1 不把 ledger 做成全文 prompt inspector，不直接暴露所有内部系统 prompt 原文。
- Phase 1 不引入新的自动检索 memory 策略；先解释现有 consumption / manual selection / compaction 结果。
- Phase 1 不重启隐藏的 `project memory` 自动检索注入；当前 project-memory 账本真值仍以手动选择结果为准。
- Phase 1 不承诺所有 context block 都可编辑；允许先支持 inspect + pin/unpin + exclude 等有限操作。

## 非目标

- 不做类似 LangSmith 的底层 tracing 平台。
- 不在 Phase 1 公开所有 provider 的完整 raw prompt 内容。
- 不把 Context Ledger 做成单独的知识库产品。
- 不在本期引入新的记忆排名算法或新的 compaction 算法。

## What Changes

- 新增 `Context Ledger` surface，用于展示当前线程 effective context 的分块账本。
- 为上下文块建立统一的 block model，至少包含：
  - blockId
  - source kind
  - label
  - token estimate / size
  - injected reason
  - freshness
  - mutability
  - participation state
- 首批 block attribution 与 compaction / memory 映射优先覆盖 `Codex / Claude Code / Gemini` 的 Phase 1 可观测来源，确保三类主引擎在 ledger 中具备一致的用户可解释结构。
- 对当前无法稳定拆分的 provider-only 上下文，新增 explicit degraded / shared marker，避免把粗粒度结果误显示成精确来源分解。
- 支持按来源分组查看上下文组成，并提供总量与分项占用。
- 支持标记哪些块是：
  - auto included
  - manually selected
  - pinned
  - compacted summary
  - stale / waiting refresh
- 在 Codex compaction 场景中，补充“压缩前后账本变化”说明，让用户看到哪些 segment 被摘要化。
- 将现有 `project-memory` 手动选择、context grouping、resource discovery 等前台上下文入口统一映射到同一账本模型。
- 为后续治理动作预留最小控制能力：
  - exclude from next send
  - pin for next send
  - open source detail

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续保留现在的 token ring + tooltip + 零散 memory/source chips，只补更多文案 | 改动最小 | 无法建立可解释账本，用户仍看不见上下文构成与 compaction 影响 | 不采用 |
| B | 新增独立 `Context Ledger`，基于 client-visible effective context projection 做分块解释与治理 | UX 价值高，能统一 memory / compaction / source grouping 心智 | 需要新增 block model 与 attribution layer | **采用** |
| C | 直接暴露完整 raw prompt inspector，包括所有 internal prompt 内容 | 调试能力最强 | 高风险，容易泄漏实现细节，也不适合作为普通 UX 默认层 | 本期不采用 |

## Capabilities

### New Capabilities

- `context-ledger-surface`: 上下文账本的 surface、分组、总量、过滤与治理动作。
- `context-ledger-attribution`: effective context block attribution 模型与跨来源聚合规则。

### Modified Capabilities

- `project-memory-consumption`: 需要把手动选择 / 注入结果映射到可解释的 context ledger block，而不只是发送前文本注入。
- `project-memory-ui`: 需要支持从记忆管理与 ledger 之间互相跳转、定位来源与 pin/exclude 语义。
- `composer-context-source-grouping`: 需要升级为 ledger 分组来源的一部分，而不是仅在 composer 上做轻量聚合展示。
- `composer-context-dual-view`: 需要与 ledger 共用上下文占用与 compaction freshness 的状态来源，避免两套口径。
- `codex-context-auto-compaction`: 需要补充 compaction summary / pending sync 在 ledger 中的解释语义。

## 验收标准

- 用户 MUST 能看到当前线程 effective context 的结构化来源分解，而不只是一个总体百分比。
- `Codex`、`Claude Code` 与 `Gemini` MUST 在 Phase 1 提供可用的 ledger 视图；即使 attribution 精度存在差异，也 MUST 保持一致的来源分类和状态语义。
- 对当前不可精确归因的 provider-only context，ledger MUST 以 degraded / shared marker 明示，而不是伪装成已经精确拆分的 block。
- 每个 context block MUST 至少展示来源类别、标签与大小估计。
- 用户 MUST 能区分哪些内容是手动选择、自动注入、摘要压缩或待刷新状态。
- Codex compaction 完成后，ledger MUST 能解释当前可见状态是“已摘要化”还是“等待 usage refresh”。
- `project-memory` 手动选择结果 MUST 在 ledger 中可见且可回溯到来源。
- ledger 与 composer tooltip / dual-view 的占用口径 MUST 保持一致，不得出现两套互相矛盾的数值来源。
- 未打开 ledger 的普通发送路径 MUST 保持兼容，不得因为新增账本而改变默认发送行为。
- 质量门禁至少覆盖：
  - `openspec validate --all --strict --no-interactive`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test` 或相关 focused Vitest suites
  - 若新增 backend context attribution contract，执行 `cargo test --manifest-path src-tauri/Cargo.toml`

## Impact

- Frontend:
  - `src/features/composer/**`
  - `src/features/project-memory/**`
  - 可能新增 `src/features/context-ledger/**`
  - `src/features/threads/**`
- State / contracts:
  - context block attribution model
  - effective context projection for current thread
  - degraded/shared attribution marker for provider-only gaps
  - compaction summary / freshness projection
- Existing UX:
  - composer tooltip
  - memory selection flow
  - resource discovery / source grouping
- Specs:
  - new `context-ledger-surface`
  - new `context-ledger-attribution`
  - modified `project-memory-consumption`
  - modified `project-memory-ui`
  - modified `composer-context-source-grouping`
  - modified `composer-context-dual-view`
  - modified `codex-context-auto-compaction`
