# Design: Project Memory Conversation Turn Rebuild

## Context

推翻旧 Phase 2 时，代码已经具备一条粗糙的自动记忆链路：

```text
useThreadMessaging.ts
  -> projectMemoryCaptureAuto(visibleUserText, threadId, turnId)
  -> onInputMemoryCaptured(...)

useThreads.ts
  -> handleAgentMessageCompletedForMemory(...)
  -> buildAssistantOutputDigest(...)
  -> projectMemoryUpdate/create(summary, detail)

src/services/tauri/projectMemory.ts
  -> invoke(project_memory_*)

src-tauri/src/project_memory.rs
  -> JSON workspace/date store
```

问题不在“没有链路”，而在“链路的真值模型错了”。它把完整对话轮次压缩成 `summary/detail`，导致 Project Memory 无法成为可复盘的长期记忆。

截至当前实现，Rust 后端已经拆分到 `src-tauri/src/project_memory/*`，上述单文件路径只表示重写前的基线入口，不再表示目标结构。

新的设计把 Project Memory 分成两层：

1. **Canonical turn memory**：完整用户输入和完整 AI 回复，是唯一事实源。
2. **Compatibility projection**：为了旧 UI、Context Ledger、manual injection、搜索和列表继续工作而派生出的 `summary/detail/cleanText`。

## Design Principles

- **Full text first**：完整问答正文优先级高于摘要、标签、操作记录和 UI 筛选。
- **Current-code first**：按当前文件和调用图设计，不再沿用旧 Phase 2 的过期路径。
- **No long-term dual commands**：不新增 `_v2` 平行命令族；升级现有 `project_memory_*` 契约。
- **Projection is not truth**：`summary/detail/cleanText` 是派生读模型，不允许反向覆盖 `userInput/assistantResponse`。
- **Manual note and turn memory are different things**：手动 note 可编辑，自动 turn 记忆默认结构化只读。
- **Engine-agnostic memory core**：Claude Code、Codex、Gemini 只能在 adapter/normalizer 层存在差异，Project Memory store、facade、projection 和 UI 不得按引擎分叉。
- **Cross-platform by construction**：路径、临时文件、测试命令和文件治理逻辑必须在 macOS/Windows/Linux 上使用同一语义。

## Data Model

### Canonical Types

```ts
type ProjectMemorySchemaVersion = 1 | 2;

type ProjectMemoryRecordKind =
  | "conversation_turn"
  | "manual_note"
  | "legacy";

type ConversationTurnMemory = {
  id: string;
  schemaVersion: 2;
  recordKind: "conversation_turn";
  workspaceId: string;
  threadId: string;
  turnId: string;
  assistantMessageId?: string | null;
  engine?: string | null;
  source: "conversation_turn";
  title: string;
  summary: string;
  detail: string;
  cleanText: string;
  kind: string;
  importance: string;
  tags: string[];
  fingerprint: string;
  userInput: string;
  assistantResponse: string;
  assistantThinkingSummary?: string | null;
  createdAt: number;
  updatedAt: number;
};
```

`summary/detail/cleanText` 继续存在，但含义改变：

- `summary`: 由 `assistantResponse` 或 `userInput` 派生的短摘要，用于列表和 Context Ledger。
- `detail`: 兼容展示文本，推荐格式为 `用户输入\n\nAI 回复`，不是存储真值。
- `cleanText`: 搜索索引文本，可由 `userInput + assistantResponse + assistantThinkingSummary` 生成。

### Manual Note Compatibility

手动创建的记忆不强制包含 `turnId/userInput/assistantResponse`。它应标记为 `recordKind="manual_note"`，继续允许用户编辑标题、摘要、详情和标签。

### Legacy Compatibility

旧记录没有 `schemaVersion` 或缺少 canonical fields 时视为 `legacy`。读取层可以继续展示，但不得把 legacy detail 当成新 turn fields 自动伪造事实，除非格式能可靠解析。

## Architecture

### Target Module Shape

Rust 后端从单文件拆分为：

```text
src-tauri/src/project_memory/
  mod.rs
  model.rs          // canonical + legacy DTO
  commands.rs       // tauri commands
  compat.rs         // legacy/turn compatibility predicates
  store.rs          // workspace/date JSON read/write
  projection.rs     // summary/detail/cleanText/list projection
  classification.rs // kind/importance/tags
  search.rs         // list filtering/search entry projection
  settings.rs       // settings interpretation
  tests.rs
```

TS 前端保持当前分层，但收紧职责：

```text
src/services/tauri/projectMemory.ts
  // IPC DTO 与 invoke 包装

src/features/project-memory/services/projectMemoryFacade.ts
  // UI/threads/composer 唯一 memory facade

src/features/threads/hooks/useThreadMessaging.ts
  // 用户发送侧 capture

src/features/threads/hooks/useThreads.ts
  // assistant completed 侧 fusion，调用 engine adapter/normalizer 后进入通用 memory facade

src/features/project-memory/hooks/useProjectMemory.ts
  // list/detail 状态

src/features/project-memory/components/*
  // list/detail/manual-note UI
```

### Engine Adapter Boundary

Project Memory 不直接关心 Claude Code、Codex 或 Gemini 的内部事件形状。引擎层只允许输出统一 turn payload：

```ts
type NormalizedConversationTurnPayload = {
  workspaceId: string;
  threadId: string;
  turnId: string;
  engine: "claude-code" | "codex" | "gemini" | string;
  userInput?: string;
  assistantResponse?: string;
  assistantMessageId?: string | null;
  completedAt?: number;
};
```

约束：

- Codex 与 Claude Code 是 P0 强保障：必须覆盖 capture、completed、重复 completed、乱序 fusion、详情回看。
- Gemini 是 P0 contract participant、P1 深覆盖：必须复用 normalized payload 与 canonical model；若事件质量暂弱，测试至少覆盖 smoke path 与无独立存储分支。
- `engine` 字段只用于 metadata、筛选和诊断，不能影响 `ConversationTurnMemory` 的字段定义、文件格式或 CRUD 命令。
- adapter 可以丢弃引擎私有噪声，但不得截断 `userInput` 或 `assistantResponse`。

## Core Flows

### Flow A: User Capture

1. 用户发送消息。
2. `useThreadMessaging.ts` 已拿到 `visibleUserText`、`workspaceId`、`threadId`、`turnId`、`engine`。
3. 调用 memory facade 的 `captureTurnInput(...)`。
4. 后端创建 provisional turn 记录或返回已存在记录。
5. 记录必须保存完整 `userInput`。

关键变化：

- capture 阶段可以继续做噪声过滤和 fingerprint。
- 但 canonical `userInput` 必须来自 `visibleUserText` 原文。
- 不能用脱敏/normalize 结果覆盖 canonical 字段。

### Flow B: Assistant Fusion

1. assistant completed 事件到达 `useThreads.ts`。
2. 事件 payload 至少包含 `workspaceId/threadId/assistantMessageId/text`。
3. fusion resolver 用 pending capture 找到 `turnId`。
4. 写入完整 `assistantResponse = payload.text`。
5. 生成投影字段：
   - `summary`: 短摘要。
   - `detail`: 兼容文本。
   - `cleanText`: 搜索文本。
6. 以 `workspaceId/threadId/turnId` 做 upsert，保证幂等。

关键变化：

- `buildAssistantOutputDigest` 可以继续用于生成 `summary/title`。
- 但它不能决定 `assistantResponse` 的持久化内容。
- `MAX_ASSISTANT_DETAIL_LENGTH` 不能作用于 canonical `assistantResponse`。

### Flow C: List and Detail

列表：

- 返回 `ProjectMemoryListProjection[]`。
- 不返回完整 `userInput/assistantResponse` 大字段。
- 继续支持 query/kind/importance/tag/page/pageSize。

详情：

- `project_memory_get` 返回完整 canonical record。
- 自动 turn 详情按 `用户输入 -> AI 回复 -> 可选 thinking summary` 展示。
- 旧 note/legacy 继续按兼容 detail 展示。

### Flow D: Manual Injection and Context Ledger

现有 manual memory injection 和 Context Ledger 先消费 projection：

- summary mode 使用 `summary`。
- detail mode 使用 `detail`。
- 对 conversation turn，`detail` 必须包含完整用户输入和完整 AI 回复，必要时由 detail hydration 提供。

后续可以增加“引用完整 turn”模式，但不作为 P0。

## API Design

### TS DTO

```ts
type ProjectMemoryItem = {
  id: string;
  workspaceId: string;
  schemaVersion?: number;
  recordKind?: "conversation_turn" | "manual_note" | "legacy";
  title: string;
  summary: string;
  detail?: string | null;
  cleanText: string;
  rawText?: string | null;
  kind: string;
  importance: string;
  tags: string[];
  threadId?: string | null;
  turnId?: string | null;
  messageId?: string | null;
  assistantMessageId?: string | null;
  userInput?: string | null;
  assistantResponse?: string | null;
  assistantThinkingSummary?: string | null;
  source: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null; // legacy only
};
```

### Command Strategy

- Keep command names: `project_memory_list/get/create/update/delete/capture_auto`.
- Add typed object wrappers in `src/services/tauri/projectMemory.ts`.
- Rust can support old flat payload during transition if needed, but frontend should move to one facade shape.
- Remove `hardDelete` from frontend facade after Rust delete semantics are settled.

## Storage Design

### P0 Storage

- Continue workspace/date JSON files.
- Add `schemaVersion`, `recordKind`, `turnId`, `userInput`, `assistantResponse`, `assistantThinkingSummary`.
- Upsert by `workspaceId/threadId/turnId`.
- Preserve old files and old fields.

### P1/P2 Storage

- Split Rust module.
- Atomic write via temp file + rename.
- Blocking worker for large JSON scan/write.
- Optional same-day shard when file size crosses threshold.
- Corrupt file isolation.

### Platform Compatibility

- Node scripts and tests SHOULD use `path.join`, `path.resolve`, `fs.mkdtemp`, `os.tmpdir`, and explicit UTF-8 I/O instead of hard-coded `/tmp` or POSIX separators.
- Rust store code SHOULD use `PathBuf`, `std::fs`/Tokio path APIs, atomic temp files in the destination directory, and rename behavior that is valid on Windows and macOS.
- Tests MUST NOT assume case-sensitive filesystems, POSIX shell availability, or LF-only fixture behavior unless the fixture explicitly tests normalization.
- CI governance commands are part of the release candidate gate because both workflows run on `ubuntu-latest`, `macos-latest`, and `windows-latest`.

## UI Design

### Conversation Turn Detail

Default sections:

1. 用户输入
2. AI 回复
3. 思考摘要（仅当存在）
4. 元数据（threadId/turnId/engine/createdAt）

首期可以不做 operation timeline。不要让 operationTrail 抢占 P0。

### Manual Note Detail

保留编辑能力，但 UI 必须明确它是 manual note，不是自动对话轮次。

### List Item

- Title fallback: `assistantResponse first line -> userInput first line -> summary -> Untitled Memory`
- Badge: `Turn` / `Note` / `Legacy`
- Metadata: engine, updatedAt, kind

## Migration and Compatibility

- 不批量迁移旧数据。
- 读取旧数据时按 legacy 展示。
- 对符合旧 `用户输入：...\n助手输出摘要：...\n助手输出：...` 格式的 detail，可在详情中解析为兼容 section，但不能标记为 schemaVersion 2。
- Context Ledger 继续通过 `summary/detail` 工作。

## Testing Strategy

### Unit

- projection generation: full input/response -> summary/detail/cleanText。
- upsert idempotency: same `workspaceId/threadId/turnId` does not duplicate。
- legacy parser: old detail format remains readable。

### Integration

- Codex send capture + assistant completed writes full user input and full assistant response。
- Claude Code send capture + assistant completed writes full user input and full assistant response。
- Gemini normalized adapter smoke writes through the same memory facade and canonical fields。
- assistant response longer than 12k chars is preserved in canonical field。
- manual memory injection still works in summary/detail mode。
- Context Ledger still renders selected manual memories。
- cross-platform governance commands remain green:
  - `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
  - `npm run check:heavy-test-noise`
  - `node --test scripts/check-large-files.test.mjs`
  - `npm run check:large-files:near-threshold`
  - `npm run check:large-files:gate`

### Rust

- serde round-trip for schema v2 record。
- workspace/date store reads mixed legacy + v2 records。
- update by turn key。
- old soft-deleted records remain hidden during compatibility period。

## Rollout

1. Contract and model first.
2. Capture/fusion full text persistence.
3. Projection/detail split.
4. UI turn viewer.
5. Rust module split and store hardening.
6. Delete semantics cleanup and old field deprecation.

Rollback is version-level. There is no runtime feature flag in this proposal.
