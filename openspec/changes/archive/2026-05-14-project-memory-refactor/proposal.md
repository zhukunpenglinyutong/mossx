# Proposal: Project Memory Conversation Turn Rebuild

## Why

当前 Project Memory 最大短板不是 UI 不够丰富，也不是缺少 `operationTrail`，而是最基础的记忆事实不完整：

- 用户在对话幕布中输入的完整内容没有作为一等字段稳定保存。
- AI 最终回复被压缩成摘要与片段，当前主链路存在 `MAX_ASSISTANT_DETAIL_LENGTH = 12000`、`OutputDigest.detail = 800` 等截断/摘要策略，导致无法回看完整问答。
- 现有融合逻辑以 `summary/detail/cleanText` 为真值，写入结果更像“回复摘要卡片”，不是“对话轮次记录”。
- 当前 OpenSpec Phase 2 文档已经把若干设计当成已冻结事实，但代码里没有 `ProjectMemoryItemV2`、`MemoryListProjection`、`MemoryDetailPayload`、`OperationTrailEntry` 等实现；继续沿用旧提案会制造更多漂移。

因此本变更推翻旧 Phase 2 任务和设计，以当前代码为事实基线，重构一份可执行的 Project Memory 提案。新的核心目标是：**完整、可靠、可回看的 Conversation Turn Memory**。

## Rewrite Baseline and Landed State

本提案推翻旧 Phase 2 时的代码基线如下；截至当前实现，关键结构已经按本提案落地：

- TS Tauri bridge 已拆到 `src/services/tauri/projectMemory.ts`，不再是旧提案描述的 `src/services/tauri.ts` 单点实现。
- Rust 后端已从 `src-tauri/src/project_memory.rs` 单文件收敛到 `src-tauri/src/project_memory/*` 模块目录，模型、存储、分类、投影、搜索、设置与命令边界独立。
- 存储模型仍复用 `ProjectMemoryItem` 作为兼容 DTO，但已经扩展 `schemaVersion/recordKind/turnId/userInput/assistantResponse/assistantThinkingSummary/engine`；`summary/detail/rawText/cleanText/deletedAt` 是兼容字段，不再是自动 turn 记忆的事实源。
- 删除语义已由后端 record kind 决定；frontend facade 不再暴露 `hardDelete?: boolean`。
- `project_memory_capture_auto` 仍保留旧 auto capture 入口；当带 `threadId + turnId` 时进入 `conversation_turn` 路径，保存完整 `userInput`。
- 用户发送后的自动采集入口在 `src/features/threads/hooks/useThreadMessaging.ts`，使用 `visibleUserText`、`turnId` 和 normalized engine metadata。
- AI 完成后的融合逻辑在 `src/features/threads/hooks/useThreads.ts`，以 `workspaceId + threadId + turnId` upsert 完整 `assistantResponse`；`buildAssistantOutputDigest` 只参与标题/摘要 projection。
- `ProjectMemoryPanel.tsx` 已区分 Conversation Turn、Manual Note、Legacy；turn 详情只读展示完整用户输入和 AI 回复，manual note 保留编辑。
- Context Ledger 和 composer manual memory 继续消费 `summary/detail/cleanText` projection，避免字段切换造成回归。

## Problem Statement

Project Memory 当前不是“项目长期记忆”，而是“对话摘要碎片”。这会导致三类高价值场景失败：

1. **复盘失败**：用户无法回看当时完整问了什么，AI 完整答了什么。
2. **续接失败**：后续会话只能注入片面摘要，缺失原始上下文。
3. **审计失败**：出现错误或决策分歧时，无法基于完整问答判断信息是如何形成的。

旧提案把 `operationTrail`、渐进渲染、分片、删除细粒度、索引预热等能力全部拉进 P0，导致主目标被稀释。新的排序必须反过来：**先让每一轮问答完整落库，再谈增强能力**。

## Goals

### P0: Full Turn Persistence

- 将 Project Memory 的最小自动记忆单元定义为 `ConversationTurnMemory`。
- 每条自动记忆 MUST 保存完整 `userInput` 与完整 `assistantResponse`。
- `userInput` 与 `assistantResponse` MUST 按对话幕布可见文本保存，不做摘要替代，不做长度截断。
- 自动融合 MUST 基于 `workspaceId + threadId + turnId` 幂等写入，避免同一轮重复记忆。
- 现有 `summary/detail/cleanText` 只能作为兼容投影和搜索字段，不能作为 turn 记忆真值。
- Project Memory MUST 是通用对话记忆能力，不得绑定到单一引擎实现。
- Codex 与 Claude Code MUST 作为 P0 强保障引擎，完整覆盖 capture/fusion/read/detail 的主链路验证。
- Gemini SHOULD 复用同一 canonical model 与 adapter contract，并至少通过共享契约 smoke 验证；其边缘事件覆盖可弱于 Codex/Claude Code。
- 实现与测试 MUST 使用 Win/mac/Linux 兼容写法，避免 shell-only path、平台特定分隔符、大小写敏感假设和不可移植临时文件策略。

### P1: Read Model and UI Rebuild

- 列表返回轻量 projection，避免列表首屏传输完整大字段。
- 详情按需加载完整 turn 字段。
- Project Memory 面板从自由编辑 detail 改成结构化 turn viewer。
- 手动记忆与自动 turn 记忆分型展示，避免把用户手写 note 强行套成对话轮次。

### P2: Store Hardening and Governance

- 将 Rust 单文件拆为 `model/store/commands/search/compat` 等小模块。
- 大字段 JSON I/O 进入 blocking worker，避免 Tauri 命令主链路阻塞。
- 引入坏文件隔离、原子写、必要时的日期分片。
- 删除、索引、Context Ledger 消费与手动注入逐步切到新读模型。

## Non-Goals

- 本轮不引入向量数据库、embedding、云同步或跨设备同步。
- 本轮不保存 hidden chain-of-thought。若 UI 有可见 thinking summary，只能保存摘要或可见摘要字段。
- 本轮不把工具原始输出全文写进记忆正文。工具信息可后续作为可选 `operationTrail` 摘要。
- 本轮不做历史旧数据批量迁移。旧数据走兼容读取。
- 本轮不要求一次性实现所有高级筛选、渐进渲染、细粒度删除和性能指标；这些必须排在全文落库之后。
- 本轮不为 Claude Code、Codex、Gemini 分别设计三套 Project Memory 存储或 API；引擎差异只能存在于 adapter/normalizer 层。

## What Changes

### 1. Canonical Model

新增自动记忆主模型概念：

```text
ConversationTurnMemory
- id
- workspaceId
- threadId
- turnId
- assistantMessageId?
- engine?
- source = "conversation_turn"
- title
- kind
- importance
- tags[]
- userInput
- assistantResponse
- assistantThinkingSummary?
- createdAt
- updatedAt
- fingerprint
- schemaVersion
```

关键约束：

- `userInput` 是用户发送到对话幕布的可见文本。
- `assistantResponse` 是 AI 最终可见回复全文。
- `engine` 是来源元信息，不得决定 Project Memory 的存储模型或 CRUD API。
- `title/summary/detail/cleanText` 是兼容/投影字段，可由 canonical fields 派生。
- 自动记忆不得再以 `buildAssistantOutputDigest().detail` 或 `MAX_ASSISTANT_DETAIL_LENGTH` 的结果作为正文真值。

### 2. Capture/Fusion Flow

当前发送侧已经能拿到 `visibleUserText + workspaceId + threadId + turnId`，应保留这个入口，但改变职责：

1. 发送成功后创建或记录 pending turn capture。
2. capture 阶段保存完整 `userInput`，允许先创建 provisional 记录。
3. assistant completed 到达后，以同一 `workspaceId/threadId/turnId` 查找 pending。
4. 写入完整 `assistantResponse`。
5. 若 completed 先到或 capture 后到，仍通过 pending refs 和短期缓存完成融合。
6. 若 fusion 失败，不能影响对话发送和 UI 交互。

引擎接入约束：

- Claude Code 与 Codex 的 capture/fusion MUST 使用同一 Project Memory facade 与同一 turn-key upsert contract。
- Gemini 接入 SHOULD 走同一 facade；若某些事件字段暂时缺失，adapter MUST 显式降级而不是创建 Gemini 专用存储路径。
- 各引擎只负责把自身事件归一化为 `workspaceId/threadId/turnId/engine/userInput/assistantResponse`，不得把摘要逻辑或持久化策略下沉到引擎分支。

### 3. API and Compatibility

- 继续使用 `project_memory_*` 命令族，避免引入平行 `_v2` 命令造成长期双轨。
- TS bridge 以 `src/services/tauri/projectMemory.ts` 为契约入口。
- Rust 可在保持命令名的前提下升级 payload 和返回模型。
- 旧字段保留只读兼容期：
  - `summary`: 从 `assistantResponse` 派生短摘要。
  - `detail`: 兼容视图，可组合 `用户输入 + AI 回复`。
  - `cleanText`: 搜索索引用字段。
  - `rawText`: 旧数据兼容字段。

### 4. UI

Project Memory 面板拆成两类体验：

- 自动 turn 记忆：结构化回看，显示用户输入、AI 回复、可选 thinking summary。
- 手动 note 记忆：保留轻量创建/编辑能力，但不污染 turn 记忆模型。
- Composer 输入区提供单次“记忆引用”入口：入口位于发送按钮旁，默认关闭；开启前必须通过紧凑确认弹窗二次确认；弹窗只说明本次发送会只读检索 Project Memory、生成 Memory Brief，并在发送或上下文清空后自动关闭。

首期 UI 重点：

- 列表可以看到这条记忆来自哪一轮对话。
- 详情必须能完整回看 `userInput` 和 `assistantResponse`。
- 复制整轮内容必须复制完整用户输入与完整 AI 回复。
- Composer 记忆引用入口不得常驻长文提示，避免占用输入区工具栏空间。

### 5. Storage

- 短期可沿用 workspace/date JSON 结构，但必须支持新字段。
- 大字段写入必须保证原子性。
- Rust store 需要从单文件拆分，否则后续继续修改会突破可维护边界。
- 分片、索引预热、坏文件隔离是 P2 hardening，不再抢占 P0。

## Acceptance Criteria

- 自动保存的一条 Project Memory 能完整展示用户本轮输入全文。
- 同一条 Project Memory 能完整展示 AI 本轮最终回复全文。
- 对于超长 AI 回复，不得因为摘要器或固定长度常量导致正文丢失。
- 同一 `workspaceId/threadId/turnId` 重复完成事件不会产生重复记忆。
- 列表不强制加载所有大字段；详情打开时可以拿到完整字段。
- 旧 `summary/detail/cleanText` 消费面在兼容期不崩溃。
- Context Ledger 和 manual memory injection 不因字段切换回归。
- 新 OpenSpec tasks 与当前代码文件路径一致，不再引用已经过期的执行路径。
- Codex 与 Claude Code 均有覆盖完整 `userInput + assistantResponse` 的自动记忆验证。
- Gemini 至少通过共享 adapter contract 或 smoke 测试，证明其不会走独立存储模型。
- 发布候选必须通过跨平台治理门禁：`Heavy Test Noise Sentry` 与 `Large File Governance Sentry` 在 Ubuntu/macOS/Windows 的命令集合保持可运行。
- 本变更新增或修改的 Node/Rust 文件路径、临时文件、换行与命令调用必须按 Win/mac/Linux 兼容方式实现。

## Risks

- 完整保存大字段会增加 JSON 文件体积。
  - Mitigation: 先做 projection/detail 分离，再做 blocking worker 与分片。
- 旧 `detail` 编辑语义与新 turn 只读语义冲突。
  - Mitigation: 区分 `manual_note` 与 `conversation_turn`。
- assistant completed 事件与 capture 时序仍可能乱序。
  - Mitigation: 以 `turnId` 为幂等键，保留 pending capture/completion 双向合并。
- Context Ledger 依赖旧字段。
  - Mitigation: 兼容投影继续提供 `summary/detail/cleanText`，但由 canonical fields 派生。
