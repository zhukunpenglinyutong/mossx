## Context

当前客户端已经存在多处与上下文相关的 UX 与实现碎片：

- `project memory`：手动选择并注入记忆。
- `composer source grouping`：在 UI 上按来源分组部分上下文入口。
- `dual view / tooltip`：展示 token usage 与 compaction 状态。
- `codex auto compaction`：自动压缩上下文，并在消息面上显示生命周期文案。

这些能力各自成立，但缺少一个统一的“effective context”解释层。结果是用户只能看到局部信号，无法回答：

- 当前这一轮到底由哪些 context pieces 组成？
- 哪些是自动注入，哪些是手工 pin 进去的？
- 哪些内容已经被 compaction 摘要化？
- token 占用为什么是这个数字？
- 三种主引擎看到的上下文结构是否一致？

本设计新增 `Context Ledger`，作为上下文解释与治理层。它不会替代现有发送协议，也不直接暴露全部 raw prompt，而是把当前线程“将被使用 / 刚刚被使用”的 effective context 投影成统一的账本模型。

约束：

- 必须优先支持 `Codex / Claude Code / Gemini`。
- 必须兼容现有 `project memory`、`composer tooltip`、`Codex compaction` 行为，不改变默认发送路径。
- 必须把 `CI gate` 与 `macOS / Windows` 兼容写法前置进设计，避免后续 attribution / path / file 行为只在单平台成立。

## Goals / Non-Goals

**Goals:**

- 定义统一的 `ContextBlock` model 与 `EffectiveContextProjection`。
- 为 `Codex / Claude Code / Gemini` 的 Phase 1 可观测来源提供一致的来源分类与参与状态语义。
- 让用户看到每类上下文块的大小估计、注入原因、来源和新鲜度。
- 把 `project memory`、resource/source grouping、compaction 状态映射到同一账本视图。
- 对当前拿不到稳定 signal 的 provider-only context 提供明确的 `degraded / shared` 表达，而不是伪精确拆分。
- 支持最小治理动作：`pin for next send`、`exclude from next send`、`open source detail`。
- 把 CI 门禁和跨平台 contract 作为实现硬约束。

**Non-Goals:**

- 不公开全部 provider internal prompt 原文。
- 不重做真正的 provider-side prompt assembler。
- 不在 Phase 1 引入新的 memory ranking / retrieval algorithm。
- 不保证所有 context block 都可任意编辑。

## Decisions

### 1. 采用统一 `ContextBlock` model，而不是继续拼接零散 tooltip / chips / memory flags

#### 决策

引入统一 block model，用于表达 effective context 中的每一块来源。

建议字段：

```ts
type ContextSourceKind =
  | 'recent_turns'
  | 'project_memory'
  | 'manual_memory'
  | 'attached_resource'
  | 'tool_output'
  | 'system_injected'
  | 'engine_injected'
  | 'compaction_summary'
  | 'workspace_context';

type ContextFreshness =
  | 'fresh'
  | 'stale'
  | 'pending_refresh'
  | 'derived';

type ContextMutability =
  | 'read_only'
  | 'pinnable'
  | 'excludable'
  | 'inspect_only';

type ContextParticipationState =
  | 'included'
  | 'pinned_next_send'
  | 'excluded_next_send'
  | 'compacted'
  | 'candidate_only';

type ContextBlock = {
  blockId: string;
  sourceKind: ContextSourceKind;
  label: string;
  tokenEstimate?: number;
  sizeBytesEstimate?: number;
  injectedReason: string;
  freshness: ContextFreshness;
  mutability: ContextMutability;
  participationState: ContextParticipationState;
  sourceRef?: {
    resourceId?: string;
    memoryId?: string;
    threadId?: string;
    messageId?: string;
  };
  updatedAt?: string;
  engineScope: 'codex' | 'claude_code' | 'gemini' | 'shared';
  attributionQuality: 'precise' | 'coarse' | 'degraded';
};
```

Phase 1 contract 补充：

- `recent_turns`、`manual_memory`、`attached_resource`、`compaction_summary`、`workspace_context` 等前端 / send-preparation 可见来源 MUST 显式建模。
- provider-only 的 `system_injected` / `engine_injected` 段若当前拿不到稳定 attribution signal，MAY 暂时折叠成 coarse summary block，但 MUST 带 `degraded` 语义，不能伪装成精确 block。

#### 原因

- 只有统一 block model，才能把 memory、tool output、compaction、recent turns 放进同一账本。
- 如果继续靠 tooltip 文案和局部 flag，后续任何新来源都会重复造 UI 与状态定义。

#### 备选方案

- 维持各模块各自的显示状态：实现简单，但无法形成统一解释层，不采用。

### 2. `Context Ledger` 基于 `EffectiveContextProjection`，不直接等同 raw prompt inspector

#### 决策

新增 `EffectiveContextProjection` 概念：

- 它表达“当前客户端可解释的实际参与上下文”
- 来源可以是发送前 projection，也可以是发送后最近一次实际 usage snapshot 的解释视图
- 它不是完整 raw prompt dump

建议结构：

```ts
type EffectiveContextProjection = {
  threadId: string;
  engine: 'codex' | 'claude_code' | 'gemini';
  snapshotAt: string;
  totalTokenEstimate?: number;
  totalWindowEstimate?: number;
  usagePercent?: number;
  blockGroups: Array<{
    sourceKind: ContextSourceKind;
    totalTokenEstimate?: number;
    blocks: ContextBlock[];
  }>;
  compactionState?: 'idle' | 'compacting' | 'compacted_pending_refresh' | 'compacted_synced';
};
```

#### 原因

- 直接暴露 raw prompt 风险高，也不符合普通用户的治理需求。
- projection 方式更适合跨引擎统一，因为不同 provider 的 prompt assembler 不同。

#### 备选方案

- 直接做 raw prompt inspector：调试价值高，但不适合当前 UX 层，不采用。

### 3. 统一来源分类，优先覆盖可观测来源，允许 attribution 精度差异，但不允许语义漂移

#### 决策

Phase 1 对 `Codex / Claude Code / Gemini` 统一来源分类：

- `recent_turns`
- `project_memory`
- `manual_memory`
- `attached_resource`
- `tool_output`
- `system_injected`
- `engine_injected`
- `compaction_summary`
- `workspace_context`

适配层约束：

- 同一类用户可感知且当前可观测的来源，在三引擎上必须归到相同 `sourceKind`
- 若某引擎无法给出精确 token numbers，可用 `sizeBytesEstimate` 或 coarse estimate 降级
- 若 provider-only context 暂时无法细拆，必须落到 explicit `degraded / shared` summary，而不是伪造为更具体的 memory / resource block
- 降级只能影响精度，不能改变用户看到的参与状态和来源分类

#### 原因

- 用户需要统一心智，而不是记住每个 provider 的不同术语。
- 若语义不统一，Context Ledger 就会沦为 provider-specific debug panel。

### 4. compaction 在账本里表示为“状态变化 + summary block”，而不是只保留历史消息文案

#### 决策

针对 `Codex` Phase 1 明确：

- compaction 发生时，ledger 中必须出现 `compaction_summary` block 或等价占位块
- 若 usage snapshot 尚未刷新，状态记为 `compacted_pending_refresh`
- 刷新完成后切换为 `compacted_synced`
- 历史消息中的 compaction 文案只作为 conversation surface，不作为当前账本真值来源

后续 `Claude Code / Gemini` 若具备 compaction / summarization 类能力，也沿用同一账本语义。

#### 原因

- 当前问题之一就是历史回写与实时状态混用，用户看不到“当前账本是否已刷新”。
- 账本必须表达状态机，而不是只依赖消息历史。

#### 备选方案

- 继续从 thread message surface 推导 compaction：状态容易残留，不采用。

### 5. `project memory` 与 ledger 双向映射，但 ledger 不改变现有发送协议

#### 决策

- `project memory` 手动选择结果在 ledger 中呈现为 `manual_memory` blocks
- 当前产品语义下，`project memory` Phase 1 仍以手动选择结果为真值；ledger SHALL NOT 为了补齐账本而重新引入隐藏的自动 project-memory retrieval
- 非手动的 project/workspace helper context，若前端当前可见，则呈现为 `workspace_context` 或 `system_injected`；若不可稳定归因，则降级为 shared / degraded summary
- 用户在 ledger 中执行 `pin for next send` / `exclude from next send` 时，映射到现有 composer send-preparation state
- 发送协议本身仍复用现有注入链路，不额外引入新的 prompt DSL

#### 原因

- 当前 change 的目标是解释与治理，而不是重写注入协议。
- 保持现有发送链路能显著降低 cross-layer 风险。

### 6. Composer tooltip / dual-view / ledger 共享同一 usage state source

#### 决策

后续实现必须保证：

- composer tooltip
- dual-view
- ledger summary

三者都读取同一个 usage / compaction state source，而不是各自推导。

最小共享字段包括：

- latest usage snapshot
- total/window estimate
- compaction state
- snapshot freshness

#### 原因

- 如果 tooltip 和 ledger 各自计算 token usage，很快会出现口径冲突。
- 当前用户对“百分比”和“压缩状态”不信任，本质就是状态来源不统一。

### 7. Ledger 治理动作只作用于“下一次发送准备态”，不立即重写历史

#### 决策

Phase 1 只支持有限治理动作：

- `pin for next send`
- `exclude from next send`
- `open source detail`

这些动作的语义：

- 作用于下一次 send-preparation state
- 不回写历史消息
- 不修改过去已发送 prompt 的审计含义

#### 原因

- 这是最小可控范围，能满足治理需求而不引入历史重演复杂度。
- 若允许立即修改历史账本，状态模型会大幅复杂化。

### 8. 把 `CI 门禁` 作为跨层实现前置条件

#### 决策

本 change 后续实现必须满足：

- `openspec validate --all --strict --no-interactive`
- `npm run lint`
- `npm run typecheck`
- `npm run test` 或 focused Vitest suites
- 涉及 composer / project-memory / context usage 交互时，至少覆盖：
  - ledger projection unit tests
  - composer state integration tests
  - compaction state regression tests
- 若新增 backend attribution / projection contract，执行：
  - `npm run check:runtime-contracts`
  - `npm run doctor:strict`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
- 涉及布局或大样式文件时，执行：
  - `npm run check:large-files`

CI 额外要求：

- 不得只验证 macOS 单平台路径
- attribution / path / storage normalization 如涉 OS 分支，必须有 Windows-safe contract test 或等价纯函数测试

#### 原因

- 这个 change 横跨 composer、memory、usage、compaction，多处状态很容易出现“修一个 surface，另一个 surface 漏掉”。
- 提前约束 CI，比实现后人工补回归更可靠。

### 9. Phase 1 必须使用 macOS / Windows 兼容写法

#### 决策

后续实现必须遵守以下跨平台规则：

- 任何与文件、资源、workspace path 相关的 block sourceRef，统一存 normalized / workspace-relative path，不暴露平台原始绝对路径作为主显示键。
- 前端不得解析平台相关 shell 输出以构建 ledger block。
- 对路径、文件名、来源 key 的排序与比较，必须避免依赖大小写敏感行为。
- 时间戳、数字、大小估计展示使用统一 formatter，不依赖 OS locale 默认值。
- 如果某引擎在 Windows 与 macOS 下返回不同的资源路径格式，必须先在 backend/service 层归一化，再进入 ledger attribution。
- snapshot / fixtures / tests 不得写死 `/Users/...` 或 `C:\\...` 为唯一合法样例。

#### 原因

- context source 经常携带路径和资源引用，是最容易悄悄引入平台差异的地方。
- 如果这一步不提前约束，Windows 兼容问题会在 UI 与状态层蔓延。

## Risks / Trade-offs

- [Risk] attribution 数据不足，导致部分 block 只能粗粒度显示
  → Mitigation：允许用 coarse estimate 降级，但统一保留来源分类和 participation state。

- [Risk] ledger 与 tooltip 双写状态，出现数字不一致
  → Mitigation：强制三者共用同一 usage state source，禁止各自重新计算。

- [Risk] compaction 完成但 usage 未刷新时，用户误以为压缩失败
  → Mitigation：引入 `compacted_pending_refresh` 显式状态，并在 ledger 中展示 freshness。

- [Risk] `pin/exclude` 语义与现有 manual memory selection 冲突
  → Mitigation：在 send-preparation state 中统一归并，明确“本次发送临时治理”优先级。

- [Risk] 三引擎来源分类映射不完全
  → Mitigation：Phase 1 只承诺统一用户态 sourceKind，不强求相同底层字段。

- [Risk] 账本 surface 增加 UI 密度
  → Mitigation：默认展示 group summary，详情按需展开，不把所有 block 平铺到 composer 主区。

## Migration Plan

1. 定义 `ContextBlock` 与 `EffectiveContextProjection` contract。
2. 统一 composer tooltip / dual-view / compaction usage state source。
3. 为 `project memory`、manual selection、resource grouping 接入 block attribution，并补齐 provider-only attribution gap 的 degraded / shared marker。
4. 为 `Codex / Claude Code / Gemini` 建立 engine adapter，把现有可观测上下文来源投影到统一 source kinds。
5. 新增 `Context Ledger` surface，并接入最小治理动作。
6. 为 compaction 增加 `pending_refresh` 与 `synced` 账本状态。
7. 补齐 focused tests、Windows-safe normalization tests、cross-layer verification。

回滚策略：

- 若 ledger UI 不稳定，可先隐藏独立入口，但保留 shared usage source 与 attribution 纯函数。
- 若 attribution 不准确，可暂时只展示 group-level summary，不开放 block-level 治理动作。

## Open Questions

- `Claude Code` 与 `Gemini` 当前能否稳定暴露 enough signal 来把 `tool_output` 与 provider-only `engine_injected` summary 分开，而不是全部落到 degraded bucket？
- `project memory` 之外的 `workspace_context` 是否需要独立来源分类，还是初期并入 `system_injected`？
- ledger 的 `pin for next send` 是否需要和 composer 已选 memory 区做显式联动 UI？
- 是否需要为未来的 non-desktop channel 保留 projection schema version 字段？
