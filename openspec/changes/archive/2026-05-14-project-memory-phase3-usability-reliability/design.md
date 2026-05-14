## Context

Phase 2 已把 Project Memory 的事实模型校正为完整 Conversation Turn Memory：

```text
conversation_turn
  userInput
  assistantResponse
  assistantThinkingSummary?
  threadId / turnId / engine
  summary / detail / cleanText as projection
```

现在的问题转移到了使用面：

- Project Memory 弹窗仍像“调试型列表”，卡片高、标签多、详情占用重，缺少整理和健康状态。
- `@@` 手动引用弹层左侧直接展示过长内容，用户在选择前比较成本高；右侧详情虽然有价值，但左侧不应该承担完整阅读职责。
- `project-memory-consumption` 主规格曾经为了安全把自动注入固定关闭。Phase 3 需要恢复“记忆参与对话”的能力，但必须避免旧式静默自动注入。
- 用户希望在 Composer 底部显式开启“本次对话参考项目记忆”，并由一个子流程先查询相关记忆、总结后交给主会话。

因此 Phase 3 的设计核心是：

```text
Raw Turn Ledger      -> 完整保存事实
Curated Memory       -> 用户整理后的长期知识
Retrieval Pack/Brief -> 本次发送可控引用的摘要上下文
```

三者不能混用：完整 turn memory 是审计事实，Review Inbox 是治理入口，Memory Brief 是发送前的临时上下文包。

## Goals / Non-Goals

**Goals:**

- 提供高密度 Project Memory workbench，让用户能快速浏览、筛选、整理和诊断记忆。
- 优化 `@@` 候选左侧信息密度，保留右侧完整详情预览。
- 在 Composer 增加显式 Memory Reference toggle，默认关闭，仅本次发送生效。
- 引入只读 Memory Scout，生成结构化、可追踪、可降级的 Memory Brief。
- 给自动记忆增加健康状态、Review 状态和 reconcile 入口。
- 保持所有记忆能力 engine-agnostic，Codex / Claude Code 是强验证目标，Gemini 走共享 contract。
- 把 Heavy Test Noise 与 Large File Governance 纳入 Phase 3 完成门禁。
- 约束所有新增实现使用 Windows/macOS/Linux 兼容编码方式。

**Non-Goals:**

- 不做 embedding 或语义向量检索。
- 不引入后台常驻 agent。
- 不让 Scout 修改记忆或项目文件。
- 不把 Review Inbox 设计成复杂任务系统。
- 不改变 Phase 2 的 canonical `userInput/assistantResponse` 字段语义。
- 不把 Memory Reference 做成全局永久自动注入开关。
- 不新增通用子 agent 平台、后台常驻 worker 或跨 workspace 记忆扫描。
- 不让 Scout 执行 shell、读取项目文件、调用 Git 或访问 Project Memory 之外的数据源。
- 不新增 runtime dependency 来做 ranking/summarization；首期必须使用现有 Project Memory projection 和确定性摘要策略。

## Decisions

### Decision 1: 一个 Phase 3 change 覆盖 3A-3E，任务内分阶段执行

**选择：** 使用 `project-memory-phase3-usability-reliability` 一个 OpenSpec change，tasks 内按 3A-3E 分组。

**备选 A：拆成 3 个 change：surface / toggle / scout。**

- 优点：每个 change 范围小。
- 缺点：规格容易互相引用，尤其 `project-memory-consumption` 的“固定关闭”到“显式开启”会被拆散。

**备选 B：一个 change 覆盖全阶段。**

- 优点：用户工作流完整，能一次性定义“看、选、注入、治理”的闭环。
- 缺点：任务较多，需要明确优先级和 Exit gates。

**结论：** 采用备选 B，但实现时允许按 3A -> 3B -> 3C -> 3D -> 3E 顺序分批完成。

### Decision 2: `@@` 左侧只做 compact preview，右侧详情不动

**选择：** 左侧候选列表承担“比较和选择”，右侧详情承担“阅读和确认”。

左侧 compact preview 推荐结构：

```text
[radio/checkbox] title                         badge
summary line 1
summary line 2
kind · time · tag1 tag2 · engine
```

约束：

- title 1 行。
- summary 2-3 行 clamp。
- metadata 1 行。
- 不展示完整 `assistantResponse`。
- 选中态和键盘高亮不能改变。

**不采用：** 左右两侧都展示完整内容。它会把弹层变成双重长文阅读器。

### Decision 3: Memory Reference 是显式 one-shot，而不是恢复旧自动注入

**选择：** Composer 底部 Memory icon toggle 默认关闭，用户开启后只影响本次发送；发送完成后回到关闭或空闲状态。

状态机：

```text
off
  └─ user toggles on -> armed
armed
  ├─ send -> querying
  └─ user toggles off -> off
querying
  ├─ scout ok -> referenced
  ├─ scout empty -> no_match
  ├─ scout timeout/fail -> degraded
  └─ cancel/route change -> off
referenced/no_match/degraded
  └─ send settled -> off
```

**不采用：** localStorage 恢复旧全局自动注入开关。旧开关曾经导致上下文黑盒，Phase 3 不应回退。

### Decision 4: Memory Scout 是受限只读子流程，返回 Brief，不返回原始长文本堆叠

**选择：** Scout 作为受限只读子流程查询和归纳 Project Memory 后返回 `MemoryBrief`，主会话只消费 Brief。

“子 agent”在 Phase 3 中先被定义为 contract，而不是新的通用 agent runtime。实现可以先是 frontend-side deterministic service；如果后续接入真实 agent/session runner，也必须隐藏在同一个 `MemoryBrief` contract 后面，并遵守以下边界：

- 只读当前 workspace 的 Project Memory。
- 不读取项目文件、不执行 shell、不调用 Git、不写 Project Memory。
- 不跨 workspace 检索。
- 有硬超时、可取消、失败降级。
- 不输出 hidden reasoning，只输出可见 Brief 和来源引用。

建议 DTO：

```ts
type MemoryBrief = {
  status: "ok" | "empty" | "timeout" | "error";
  query: string;
  items: Array<{
    memoryId: string;
    title: string;
    recordKind: string;
    reason: string;
    summary: string;
    source: {
      threadId?: string | null;
      turnId?: string | null;
      engine?: string | null;
      updatedAt: number;
    };
  }>;
  conflicts: string[];
  truncated: boolean;
  elapsedMs: number;
};
```

主会话注入格式仍应使用可识别的 `<project-memory ...>` 包裹，但 `source` 应标记为 `memory-scout`，并只注入 Brief 内容。

**备选 A：直接注入 top-N 记忆详情。**

- 优点：实现简单。
- 缺点：容易吞掉上下文窗口，且用户难判断引用原因。

**备选 B：Scout 生成 Brief。**

- 优点：更短、更可控、可追踪来源。
- 缺点：需要多一步摘要逻辑和失败状态。

**结论：** 采用 Brief。

### Decision 5: Review Inbox 用轻状态，不引入复杂工作流引擎

**选择：** 在 memory record projection 或兼容字段中表达 Review 状态和 Health 状态，先提供筛选和操作，不引入任务系统。

建议状态：

```ts
type ProjectMemoryReviewState =
  | "unreviewed"
  | "kept"
  | "converted"
  | "obsolete"
  | "dismissed";

type ProjectMemoryHealthState =
  | "complete"
  | "input_only"
  | "assistant_only"
  | "pending_fusion"
  | "capture_failed";
```

Health 可由字段派生：

- `complete`: `userInput` 和 `assistantResponse` 都存在。
- `input_only`: 有 `userInput`，无 `assistantResponse`。
- `assistant_only`: 有 `assistantResponse`，无 `userInput`。
- `pending_fusion`: 最近创建但尚未完成融合。
- `capture_failed`: 失败标记或 reconcile 后仍无法补齐。

Review state 可持久化，Health state 可派生，避免不必要的数据冗余。

### Decision 6: CI 门禁和跨平台约束前置到任务定义

**选择：** Phase 3 的实现任务必须显式包含 Heavy Test Noise Sentry 与 Large File Governance Sentry 的本地等价命令，并在编码约束中默认兼容 Windows/macOS/Linux。

必须保留的本地等价命令：

```bash
node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
npm run check:heavy-test-noise
node --test scripts/check-large-files.test.mjs
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

跨平台编码约束：

- TypeScript 路径处理不得手写 `/` 或 `\` 拼接；需要路径语义时使用已有 path helper 或平台无关 API。
- Rust 文件路径、临时文件和 rename 行为必须继续沿用 `Path` / `PathBuf` 与现有 store helper。
- 测试不得依赖 macOS 特有路径、大小写敏感行为、shell quoting 或换行符。
- 前端布局不得依赖系统字体宽度或固定像素高度来隐藏 overflow；必须用 CSS clamp、min/max 和 scroll container 兜底。
- 所有新增日志和 sentry 输出不得打印完整记忆正文，避免 Heavy Test Noise 和隐私污染。

**备选：** 只在最终发布前跑 CI。

- 缺点：容易在实现后期才发现测试噪音和大文件债务，修复成本高。

**结论：** 门禁前置到 tasks，作为 Phase 3 的完成条件。

## Architecture

### Surface Layer

```text
ProjectMemoryPanel
  ProjectMemoryWorkbenchShell
  ProjectMemoryToolbar
  ProjectMemoryFacetRail
  ProjectMemoryCompactList
  ProjectMemoryDetailPane
  ProjectMemoryReviewActions
```

实现时可以先在 `ProjectMemoryPanel.tsx` 内部拆小组件，再根据文件体积决定是否落到独立文件。拆分必须服务可读性，不为了形式拆组件。

### Composer Layer

```text
Composer / ComposerInput / ChatInputBox
  MemoryReferenceToggle
  MemoryReferenceStatus
  manual @@ selection remains independent
```

手动选择和 Memory Reference 并存：

- `@@` 手动选择：用户指定具体记忆。
- Memory Reference toggle：Scout 自动查找相关记忆并总结。
- 若两者同时存在，主会话应同时注入：
  - `manual-selection`
  - `memory-scout`
  但 UI 必须显示两类来源，不能混成一个数量。

### Scout Layer

Phase 3 的 Scout 应先落实 `MemoryBrief` contract。实现可先是 frontend-side service；若接入真实 runtime 子 agent，也必须保持同一 contract 和只读边界：

```text
useThreadMessaging.send
  -> maybeBuildMemoryReferenceBrief(...)
      -> projectMemoryFacade.listSummary(...)
      -> optional getDetail(...)
      -> rank + summarize
  -> inject Memory Brief
  -> send to engine
```

如果后续接入真正的子 agent，也必须遵守同一 `MemoryBrief` contract。也就是说，UI 和主会话不依赖 Scout 的执行形态，只依赖 Brief。

Scout 明确禁止：

- 读取当前项目文件树或源代码。
- 执行 shell、Git、Tauri 文件写入命令。
- 修改 Project Memory。
- 读取其他 workspace 的 memory。
- 因 Scout 失败阻断主发送链路。

### Diagnostics Layer

```text
project_memory_diagnostics(workspaceId)
  -> counts by health/review state
  -> duplicate turn key groups
  -> bad json shard count
  -> pending/partial records

project_memory_reconcile(workspaceId, mode)
  -> dryRun first
  -> optional apply
```

首期可以只做前端可见的 health derivation 和轻量 diagnostics；真正修复历史数据时必须先支持 dry run。

## Risks / Trade-offs

- **Risk: Memory Reference 被误解为永久自动注入。** → UI copy 和状态必须强调“本次发送”，发送收敛后清空。
- **Risk: Scout 摘要遗漏关键上下文。** → Brief 必须带来源，用户可回到记忆详情核对。
- **Risk: `@@` compact preview 信息过少。** → 右侧详情保持完整预览，左侧只负责比较。
- **Risk: Review 状态引入额外字段后 legacy 数据混乱。** → Legacy 默认显示为 `unreviewed` + derived health，不做批量迁移。
- **Risk: 弹窗重构影响现有删除/复制/编辑。** → Phase 3A 必须以现有测试为回归基线，逐步替换布局，不删除能力。
- **Risk: Scout 查询慢阻塞发送。** → 设置硬超时；失败降级为无 scout brief 发送，并记录统计，不阻断主会话。
- **Risk: Phase 3 变成通用 agent 平台。** → Scout 只以 `MemoryBrief` 为输出 contract，不新增 agent 编排、工具调用和后台常驻能力。
- **Risk: UI/test 改动触发 Heavy Test Noise。** → 新测试必须确定性等待，不输出大段 DOM、记忆正文或非必要 console 日志。
- **Risk: Project Memory UI 继续膨胀成大文件。** → 大组件拆分以 large-file governance 为硬约束，优先抽取纯函数、子组件和测试 fixture。
- **Risk: Windows 路径或 shell 差异导致 CI 失败。** → 所有命令使用 npm/node/cargo 跨平台入口，路径处理使用平台无关 API。

## Migration Plan

1. 先实现 Project Memory workbench layout 和 `@@` compact preview，不改变发送链路。
2. 加入 Composer Memory Reference toggle，但默认关闭，先只完成 UI 状态和 no-op plumbing。
3. 实现 Memory Brief builder，并接入 `useThreadMessaging` 发送前流程。
4. 加入 Review Inbox 和 health derivation，优先前端筛选和基础操作。
5. 增加 diagnostics/reconcile backend command，先 dry run，再提供 apply 操作。
6. 补齐 Codex / Claude Code / Gemini smoke 测试。
7. 执行 Heavy Test Noise Sentry 与 Large File Governance Sentry 本地等价命令。
8. 执行 release gate。

Rollback:

- Surface 和 `@@` UI 可通过组件级回退恢复旧布局。
- Memory Reference toggle 默认关闭；若 Scout 失败或需临时停用，可保留 UI 但发送链路跳过 scout。
- Review/health 字段不应影响旧 list/get/delete/create 行为。

## Boundary Guardrails

Phase 3 实现期间必须拒绝以下扩散：

- 将 Memory Scout 扩展为通用“项目理解 agent”。
- 在 Scout 中读取 README、源码、OpenSpec、Trellis 或 Git 状态。
- 将 Memory Reference 做成默认开启或 workspace 永久自动注入。
- 引入 embedding、向量库、SQLite 迁移、云同步或跨设备同步。
- 在 Review Inbox 中引入完整任务管理、审批流或多用户协作。
- 为单一 engine 写专用 Project Memory API。

允许的最小能力：

- 当前 workspace 内 Project Memory 的 list/get/search。
- 基于已有 projection/canonical fields 的排序、摘要、来源引用。
- 对 Project Memory 自身记录的 review state、health state、diagnostics 和 reconcile。
- Composer 单次发送前的显式 Memory Reference。

## Open Questions

- Memory Reference toggle 是否需要 per-thread 记住上一次状态，还是严格每次发送后关闭？本提案默认严格 one-shot。
- Scout 首期是否必须是真正的 engine 子 agent，还是先使用本地 deterministic summarizer？本设计建议先以 `MemoryBrief` contract 固化，再替换执行形态。
- Review state 是否持久化到现有 JSON record，还是单独维护 sidecar metadata？实现前需要根据 Rust store 写入复杂度做最后取舍。
