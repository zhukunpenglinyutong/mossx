# Harness Governance Layer — mossx 战略架构文档

> **状态**：v1.6（实施约束加固版）
> **作者**：陈湘宁 × AI Co-Architect
> **日期**：2026-05-17
> **类型**：架构战略文档（Strategic Architecture）
> **关联文档**：`docs/architecture/`、`.trellis/workflow.md`、`openspec/project.md`、`openspec/changes/stabilize-core-runtime-and-realtime-contracts/`

---

## TL;DR（结论先行）

### 战略结论

1. **Harness engineering** 是包裹 LLM 的运行时框架；模型决定上限，harness 决定下限。
2. **mossx 的战略空地是"Harness 治理层（Meta-Harness）"** —— 不与 Claude Code/Codex 竞争内核，而是做"agent 的 control plane"。
3. **mossx 已经走了 60%** —— 治理层的物理骨架已存在，缺的不是代码，是"治理"语言的显式化与几处关键重构。

### 现状校准结论（v1.6）

4. **引擎数量被低估**：实际已支持 **4 个引擎**（claude / codex / gemini / opencode），而非"双引擎"。EAL 雏形已落在 `src/features/threads/contracts/`、`src/features/threads/adapters/`、`src/features/engine/` 与 `src-tauri/src/engine/`，**不需要新建，需要显式化**。
5. **治理资产已经分散落地**：`context-ledger`（上下文/成本治理雏形）+ `session-activity`（审计投影）+ `Checkpoint`（SLA 判决）+ `SpecHub`（spec-as-policy）+ `engine-control-plane-isolation` spec —— **治理语言已经在用，只是没有统一旗帜**。
6. **最大的拦路虎不是设计，是 `app-shell.tsx` 82KB 的超大型协调器** —— 治理层任何全局抽象都被它阻挡。团队已有 `.trellis/tasks/04-22-split-app-shell-orchestration` trellis 任务，**治理战略必须接续这条主线，而不是另开战场**。
7. **下一步最高 ROI 的动作不是建 EventBus**，而是 ① 把现有 `RealtimeAdapter / HistoryLoader / NormalizedThreadEvent` 上升为治理契约 ② 建 `engine-capability-matrix` spec ③ 给 `context-ledger` 加入跨引擎成本视图 ④ 把 `Checkpoint` 升级为 Policy Chain 宿主。

> 💡 **核心洞察**：mossx 不需要"启动一个治理层项目"，而是需要"给已有的治理资产一个统一的叙事和正式化的接口"。
>
> **v1.6 收口结论**：治理层设计已经完成第一轮闭环。下一步不再继续扩写战略，而是按 OpenSpec change 进入实施队列：先 contract/legal layer，再治理能力，再 substrate 风险切片。所有治理实现必须通过 heavy-test-noise、large-file governance 与 Win/macOS/Linux 三平台约束。

---

## 目录

- [零、现状校准 Review（v1.6 必读）](#零现状校准-reviewv16-必读)

- [一、Harness Engineering 基础原理](#一harness-engineering-基础原理)
- [二、开源生态全景（2025-2026）](#二开源生态全景2025-2026)
- [三、mossx 战略定位：Harness 治理层](#三mossx-战略定位harness-治理层)
- [四、当前客户端落地路径](#四当前客户端落地路径)
- [五、关键设计决策](#五关键设计决策)
- [六、演进路线与时间线](#六演进路线与时间线)
- [七、北极星图景](#七北极星图景)
- [八、风险清单](#八风险清单)
- [附录 A：术语表](#附录-a术语表)
- [附录 B：参考资料](#附录-b参考资料)

---

## 零、现状校准 Review（v1.6 必读）

> 本章基于对 `src/` 全量代码、`openspec/changes`、`openspec/specs`、`docs/architecture` 的事实扫描。每个结论都附带文件证据。**这是"治理层在 mossx 当前阶段应该怎么做"的回答。**

### 0.1 一句话定调

> **mossx 不是"要建治理层"，而是"治理层已经长出来了，需要正式化"。** 当前阶段的最大风险不是抽象不够，而是 ① 现有治理资产没有统一旗帜，分散在 5-6 个 feature 里 ② `app-shell.tsx` 等超大协调器阻挡了全局接缝 ③ adapter/loader/parser 的 contract 没有被提升为治理法律，加引擎成本仍会线性增长。

### 0.2 ✅ 走在正确方向上（保留 + 强化）

| # | 资产 | 文件证据 | 治理层身份 | 强化方向 |
|---|------|---------|---------|--------|
| 1 | `EngineType` 联合类型 | `src/types.ts`（claude/codex/gemini/opencode） | EAL 类型基础 | 与 Rust `EngineFeatures` 对齐为 capability matrix |
| 2 | 4 个引擎 adapter + shared mapper | `src/features/threads/adapters/{claude,codex,gemini,opencode}RealtimeAdapter.ts` + `sharedRealtimeAdapter.ts` | 引擎隔离已实现，公共 mapper 已集中 | 将现有 `RealtimeAdapter` 从幕布 contract 上升为治理 contract |
| 3 | 4 个引擎 loader + shared session loader | `src/features/threads/loaders/{claude,codex,gemini,opencode,shared}HistoryLoader.ts` | Session 抽象雏形 | 将现有 `HistoryLoader` 正式纳入 Context Bridge contract |
| 4 | Checkpoint 判决引擎 | `src/features/status-panel/utils/checkpoint.ts`（`buildCheckpointViewModel` / `resolveVerdict`） | Agent SLA 状态机 | 扩展为 Policy Chain 宿主 |
| 5 | `context-ledger` | `src/features/context-ledger/` | **上下文账本已立；成本治理需要补 pricing / budget 层** | 升级为 Cost/Context Ledger + Token Budget Dashboard |
| 6 | `session-activity` | `src/features/session-activity/` | Audit Trail 雏形 | 先补 `AgentDomainEvent` schema；消费迁移与导出能力留后续 change |
| 7 | `SpecHub` + OpenSpec 集成 | `src/features/spec/SpecHub.tsx` | Spec-as-Policy 落地 | 治理策略可发布为 spec |
| 8 | `engine-control-plane-isolation` spec | `openspec/specs/engine-control-plane-isolation/` | **"control plane" 语言已正式化** | 扩展为完整 capability matrix spec |
| 9 | `architecture-ci-governance` spec | `openspec/specs/architecture-ci-governance/` | 质量门禁治理 | 增加治理层契约的 CI 验证 |
| 10 | `engine-control-plane` 抽象层（Rust） | `src-tauri/src/engine/`（40+ `.rs`） | 后端引擎管理已分层 | 与前端 EAL 形成 IPC 契约 |

> 🎯 **关键洞察**：前 3 项说明 EAL 不是"待建项"而是"待显式化项"。第 5、6 项说明"成本/审计"已经物理落地，缺的是统一的领域语言和跨引擎视图。

### 0.3 ⚠️ 方向偏差（小调整 / 文档语言校准）

| # | v1.0 表述 | 应校准为 | 原因 |
|---|---------|--------|----|
| 1 | "双引擎（Codex + Claude Code）" | "多引擎（claude / codex / gemini / opencode + 可扩展）" | 已支持 4 个，第 5 个的接入压力会暴露抽象问题 |
| 2 | "新建 `src/governance/` 目录" | "**重组**现有 `engine/` + `context-ledger/` + `session-activity/` 形成 governance 视图" | 资产已存在，新建会割裂演进路径 |
| 3 | "先实现后归纳" | "**显式化已有抽象**" —— adapter/loader 已是事实抽象，差一层 contract | 抽象已经长出来了，是"立法"而不是"探索" |
| 4 | Quick Win 顺序：EventBus → EAL → Policy Gate | **新顺序见 0.5 节** | EAL 显式化最容易，应先做 |
| 5 | "建 src/governance/events/ 事件总线" | "**先做事件 _契约_（contract），再考虑总线**" | 状态在 reducer 内分散，先定 schema 比建 bus 重要 |
| 6 | "Cost Tracker 是第一个消费者" | "**`context-ledger` 升级为 Cost/Context Ledger**" | 已有物理基础，不要另起炉灶 |

### 0.4 🔴 重点优化（必须重构 / 拉齐 —— 这是治理层落地的真正瓶颈）

#### R1：`app-shell.tsx` 82KB 拆解 —— **治理层的最大前置依赖**

- **现状**：`src/app-shell.tsx` 约 82KB，集成 28+ hooks，承载启动 / 路由 / 全局事件 / lifecycle 编排
- **影响**：任何全局治理切面（domain event schema、policy 注入、cost 聚合）都需要在 shell 层接入，但 shell 已无可读性
- **现有抓手**：trellis 任务 `.trellis/tasks/04-22-split-app-shell-orchestration` 已立项
- **治理战略动作**：**不另开战场**，而是把"治理切面注入点"作为 shell 拆分的设计目标之一，让 shell 拆完即治理基础设施

#### R2：现有 Adapter / Loader contract 上升为治理契约 —— **EAL 立法**

- **现状**：`RealtimeAdapter` / `HistoryLoader` / `NormalizedThreadEvent` 已存在于 `src/features/threads/contracts/conversationCurtainContracts.ts`，4 个引擎 adapter 很薄，复杂度主要集中在 `sharedRealtimeAdapter.ts` 和各引擎 history parser。
- **OpenSpec 关联**：`stabilize-core-runtime-and-realtime-contracts` 已完成主干稳定化，提供了 canonical realtime event matrix、frontend normalization tests、runtime lifecycle evidence。
- **治理战略动作**：**不要重新抽接口**，而是发起后续 OpenSpec change，把现有幕布 contract 提升为 `engine-runtime-contract`：明确 event schema、history snapshot schema、legacy alias policy、adapter registration rule、cross-engine parity tests。

#### R3：缺统一的 `engine-capability-matrix` spec —— **治理立法的空缺**

- **现状**：已有 `engine-control-plane-isolation` 边界 spec，前端 `EngineFeatures` 与 Rust `EngineFeatures` 也已有 feature flags；但它们还不是一个跨前后端一致、可测试、可被 UI/Policy 消费的 capability matrix。
- **影响**：UI 无法做"能力感知渲染"，治理策略无法做"按 capability 路由"
- **治理战略动作**：立项新 OpenSpec change：`add-engine-capability-matrix-spec`，包含 tool/hook/memory/subagent/cost 五大维度的 capability flag

#### R4：状态分散在 reducer，无统一领域事件语言 —— **审计与策略的盲区**

- **现状**：`src/features/threads/hooks/useThreadsReducer.ts` 与 `useThreadEventHandlers.ts` 承载大量 thread 状态转移/事件处理，但没有"对外可订阅"的领域事件形态
- **影响**：`session-activity` 只能消费 reducer 的 derived state，无法消费"原始领域事件"，导致审计粒度粗
- **治理战略动作**：**先定 `AgentDomainEvent` schema**（10 个事件类型），不急于建 bus、store、subscription，也不在第一版接入 reducer runtime。第一版只做 TypeScript schema、pure factory、reducer derivation fixtures，证明事件形状可由状态变化推导；真正 emit / session-activity 消费必须留给后续独立 change。

#### R5：MCP 可见性经 Rust/Tauri IPC 暴露 —— **IPC 治理边界**

- **现状**：`@anthropic-ai/sdk` 与 MCP client SDK 不在前端依赖；MCP config、runtime inventory、OpenCode MCP status、Codex MCP server status 等通过 Rust/Tauri command 暴露。当前还不是统一 MCP client 管理层。
- **影响**：前端治理层若要做 MCP capability 探测、tool call audit、cost 归因，必须先定义 IPC 事件与 inventory contract，不能假设所有 MCP 调用都已经可被统一拦截。
- **治理战略动作**：与 `src-tauri/src/engine/`、`src-tauri/src/codex/`、`src-tauri/src/shared/codex_core.rs` 协同设计 `mcp-governance-ipc-contract`，先约束 inventory/status/visibility，再逐步覆盖 tool-call audit。

#### R6：性能/结构阻塞提案不是"外围优化" —— **治理层的交付基座**

| 阻塞提案 | 为什么与治理强相关 | 不先处理的后果 | 设计边界 |
|---|---|---|---|
| `optimize-bundle-chunking` | 治理面板、SpecHub、audit/cost/admin surface 会持续增长；必须从首屏 critical path 解耦 | 治理功能越多，Tauri 首屏越慢，用户会关闭治理视图 | 只做 domain chunk / lazy boundary，不伪造 webview timing |
| `optimize-long-list-virtualization` | audit trail、session-activity、context ledger、message rows 都是长会话列表问题 | 长 session 下治理视图线性退化，审计/账本不可用 | viewport projection，不改 reducer truth |
| `optimize-realtime-event-batching` | `engine-runtime-contract` 之后会有更多 audit/cost/policy 消费者，高频 delta 必须有节流边界 | event fan-out 放大，治理消费者越多 UI 越抖 | 改 delivery cadence，不改 `NormalizedThreadEvent` schema |
| `refactor-mega-hub-split` | 超大 hub 是 policy/cost/event 注入点的结构瓶颈，语义审查成本过高 | 所有治理切面都被迫在巨型文件里手术，回归不可控 | 一次只拆一个 hub，按责任边界拆，不新建平行 governance 业务层 |

> 结论：这四个提案不是"和治理无关的性能任务"，而是治理层能否安全落地的 **substrate work**。它们可以阻塞治理层实现，但不应该阻塞治理层的法律文本设计；当前阶段应先把设计/任务边界写清楚，编码排期再按风险切片。

### 0.5 修订后的 Quick Win 顺序（v1.6 推荐）

```
旧顺序（v1.0）：
  1️⃣ Event Bus + Cost Tracker
  2️⃣ EAL（5 个方法）
  3️⃣ Policy Gate

新顺序（v1.6 基于事实）：
  1️⃣ Engine Runtime Contract 正式化（基于已完成的 stabilize-core-runtime change）
       ├─ 将现有 RealtimeAdapter / HistoryLoader / NormalizedThreadEvent 上升为治理 contract
       └─ 立项 add-engine-capability-matrix-spec
  2️⃣ context-ledger 升级为 Cost/Context Ledger（跨引擎视图 + Token SLO）
       ├─ 复用现有 ledger 数据结构
       └─ 在 StatusPanel 增加 "本会话花了 $X / 预算还剩 Y" 显示
  3️⃣ Checkpoint 扩展为 Policy Chain 宿主
       ├─ 现有四态判决 → 可插拔策略链
       └─ 第一批仅插件化现有 lint/typecheck/tests validation evidence
  4️⃣ AgentDomainEvent schema 立法（type-only schema + pure factory，先不接 runtime）
  5️⃣ session-activity 升级为 Audit Trail（消费 AgentDomainEvent）
```

### 0.6 与 OpenSpec 现有提案的对齐表

| OpenSpec Change / Spec | 治理战略对齐度 | 行动建议 |
|---|---|---|
| `stabilize-core-runtime-and-realtime-contracts`（已完成主干任务） | 🟢 **极高** —— 已提供 realtime/runtime contract 基础 | 基于其成果发起后续 contract formalization，不回头重做 |
| `engine-control-plane-isolation` spec | 🟢 高 —— "control plane" 语言已立 | 补 `engine-capability-matrix`，不要把 isolation spec 塞成万能 spec |
| `architecture-ci-governance` spec | 🟢 高 —— 质量门禁治理 | 增加治理契约的 CI 验证 |
| `codex-unified-exec-override-governance` spec | 🟡 中 —— 单引擎治理 | 升级时纳入跨引擎语义 |
| `add-codex-structured-launch-profile`（进行中） | 🟡 中 —— 启动配置治理 | 作为 EAL 接口设计的参考用例 |
| `large-file-governance-playbook.md` | 🟡 中 —— 治理文化已有 | 作为 large-file evidence bridge / follow-up policy 的事实依据，不能在第一版 Policy Chain 中直接消费 |

### 0.7 一张图：治理资产现状与目标态映射

```
─────────────────────────────────────────────────────────────
现状（散落，但已存在）                  目标态（统一旗帜）
─────────────────────────────────────────────────────────────
threads/contracts/conversationCurtainContracts.ts ─→ Engine Runtime Contract
threads/adapters/*RealtimeAdapter.ts              ─→ RealtimeAdapter governance registration
threads/loaders/*HistoryLoader.ts                 ─→ HistoryLoader governance registration
features/engine/useEngineController  ─→ Engine Registry
features/context-ledger              ─→ Cost/Context Ledger / Token SLO
features/session-activity            ─→ Audit Trail
features/status-panel/checkpoint     ─→ Policy Chain 宿主
features/spec/SpecHub                ─→ Spec-as-Policy
engine-control-plane-isolation spec  ─→ + Capability Matrix
architecture-ci-governance spec      ─→ + Governance Contract CI
src-tauri/src/engine + codex/shared  ─→ MCP Governance IPC
─────────────────────────────────────────────────────────────
       ☝️ 这一列 = 治理层
       不是"重写"，是"绑定 + 命名 + 立法"
─────────────────────────────────────────────────────────────
```

### 0.8 本节结论 —— 当前客户端应该怎么做（执行版）

> 用三句话回答用户的核心问题"harness 治理层在当前项目应该怎么做"：

1. **不要另起战场**：把治理战略建立在 `stabilize-core-runtime-and-realtime-contracts` 已完成的主干成果上，作为它的后续正式化，而非平行项目。
2. **不要新建 `src/governance/`**：而是给 `context-ledger` + `session-activity` + `engine/` + `status-panel/checkpoint` 一个统一的"治理"叙事，必要时引入轻量的 `src/governance/contracts/` 仅放 interface/schema 文件。
3. **优先解决三个堵点**：① 接续 `.trellis/tasks/04-22-split-app-shell-orchestration` 把 shell 拆开 ② 正式化现有 runtime/history contract ③ 立项 `engine-capability-matrix` spec 把治理语言写成法律。

> ⚠️ **避坑提醒**：在 R1（shell 拆解）有显著进展之前，不要急于做 EventBus 这类全局基础设施 —— 它们注入点都在 shell 里，shell 不拆，新基建无处下脚。

### 0.9 v1.6 收口：OpenSpec 执行队列与依赖矩阵

当前 OpenSpec workspace 已识别 11 个 active changes，其中 9 个属于 harness governance 设计闭环。它们不是同一层级的任务，必须按依赖分层推进。

| 执行层级 | Change | 角色 | 依赖判断 | 下一步 |
|---|---|---|---|---|
| L0 已交付基线 | `stabilize-core-runtime-and-realtime-contracts` | runtime/realtime 主干稳定化证据 | 后续治理 contract 必须复用其成果，不回头重做 | 保持 completed 基线，作为 formalization 的事实输入 |
| L1 法律文本 | `formalize-engine-runtime-contract` | 把 `RealtimeAdapter` / `HistoryLoader` / `NormalizedThreadEvent` 正式化 | 所有跨引擎 streaming/history parity 的前置 | 第一批实施 |
| L1 法律文本 | `add-engine-capability-matrix-spec` | 统一 TS/Rust/UI capability 语言 | cost/policy/UI degradation 的前置；可与 runtime contract 并行 inventory | 第一批实施 |
| L2 治理能力 | `evolve-context-ledger-to-cost-budget` | 把已有 context-ledger 升级为 cost/budget 视图 | 依赖 capability matrix 的 `cost.report` 语义；数据源用现有 `ThreadTokenUsage` | 第二批实施 |
| L2 治理能力 | `evolve-checkpoint-to-policy-chain` | 把 Checkpoint 升级为 policy host | 不强依赖 capability matrix，但后续 reasoning/cost policy 会受益 | 第二批实施，可软并行 |
| L2 治理能力 | `add-agent-domain-event-schema` | 先定领域事件 schema/factory/fixture | 不接 runtime，不建 bus；可在 runtime contract 后校准事件语义 | 第二批末尾实施 |
| S1 结构基座 | `refactor-mega-hub-split` | 降低全局治理注入点的语义风险 | 不阻塞法律文本，但阻塞大规模 runtime 接入 | 与 L1 并行做 inventory，实施时一次只拆一个 hub |
| S1 传播基座 | `optimize-realtime-event-batching` | 给高频 delta 建 delivery cadence contract | runtime contract 后更关键；不改 canonical schema | 在 L1 后启动 |
| S1 渲染基座 | `optimize-long-list-virtualization` | 支撑 audit/cost/policy log 长列表 | 不阻塞 L1/L2 设计，阻塞长会话可用性 | 在治理视图接入前启动 |
| S1 交付基座 | `optimize-bundle-chunking` | 防止 governance surface 拖慢 Tauri 首屏 | 不阻塞 L1/L2 设计，阻塞治理面板规模化 | 与 UI-heavy 治理功能前后衔接 |

**执行原则**：

1. **先法律，后功能**：`formalize-engine-runtime-contract` 与 `add-engine-capability-matrix-spec` 是第一批，不应被 cost/policy/event 实现反向抢跑。
2. **先 schema，后 bus**：`add-agent-domain-event-schema` 第一版只能做 type/factory/derivation fixtures，不能偷偷接 reducer runtime。
3. **先软 policy，后硬阻塞**：`evolve-checkpoint-to-policy-chain` 第一批 policy contribution 上限为 `needs_review`，large-file/spec-consistency 等硬阻塞必须先有 evidence bridge。
4. **substrate 可并行，但不能吞并治理语义**：四个性能/结构 blocker 是治理交付基座，不是 governance 业务层本身；它们应该保护注入点、传播节奏、渲染承载与首屏预算。
5. **两条 GitHub sentry 是硬约束，不是建议**：涉及新增/修改 tests 的 change 必须满足 `.github/workflows/heavy-test-noise-sentry.yml` 等价约束；涉及 spec/fixture/source 体积增长的 change 必须满足 `.github/workflows/large-file-governance.yml` 等价约束。
6. **跨平台是产品属性，不是 CI 附录**：mossx 是通用桌面客户端，治理层代码不得写入 POSIX-only 路径、shell quoting、newline、可执行名或平台条件语义；差异必须封装在 adapter/IPC 层，并在 ubuntu/macos/windows 三端验证。

**收口判定**：截至 v1.6，harness governance 的设计阶段已经完成第一轮闭环；剩余工作是执行、验证、归档，而不是继续增加新概念。

---

## 一、Harness Engineering 基础原理

### 1.1 本质定义

> **Harness（脚手架）= 包裹 LLM 的运行时框架**，把一个"无状态的 token 生成器"伪装成一个"有记忆、有工具、有判断、能持续推进任务"的工程师。

LLM 本身只做一件事：**输入 token，输出 token**。它不会读文件、不会执行命令、不会记住昨天聊过什么、不会主动调用别人。所有这些"agent 能力" —— 都是 harness 给它的。

Claude Code、Cursor、Cline、Aider、Codex CLI 都是不同流派的 harness。**模型是发动机，harness 才是整辆车。**

### 1.2 六大支柱

| 支柱 | 解决什么问题 | 在 Claude Code 里的体现 |
|------|------|------|
| **上下文管理** | LLM 窗口有限，长会话必崩 | Prompt cache（5min TTL）、自动压缩、`MEMORY.md` 索引、分层加载 |
| **工具协议** | LLM 不能直接操作世界 | Bash/Read/Edit/Grep + JSONSchema + 延迟加载（`ToolSearch`） |
| **权限沙箱** | LLM 不可信，需要边界 | permission mode、hooks（PreToolUse/PostToolUse/Stop） |
| **记忆持久化** | 跨会话遗忘 | `~/.claude/memory/*.md`、`CLAUDE.md`、project-level rules |
| **调度编排** | 单线程串行太慢 | Subagent（Task tool）、并行 tool call、background task |
| **I/O 适配** | 多端形态 | CLI / VSCode / JetBrains / Web / SDK |

### 1.3 深度推演

#### L2 本质层：为什么 harness 比模型本身更决定体验

LLM 的核心瓶颈不是"智力"，而是 **上下文工程**：

1. **注意力是稀缺资源**：100k token 窗口里，模型对中间段的关注度会衰减（lost-in-the-middle）。harness 要决定**塞什么、什么时候塞、塞在哪个位置**。
2. **Token 是钱**：每次调用都重读 50k 系统提示 = 烧钱 + 变慢。所以才有 prompt cache，所以 harness 才会精心设计 `<system-reminder>` 这种"轻量注入"。
3. **失败是常态**：模型会幻觉、会忘记、会跑题。harness 用**结构化校验**（schema 验证、hook 拦截、todo 跟踪）兜底。
4. **延迟工具加载**：100 多个工具的 schema 不可能全塞进上下文，所以"按需展开" —— 这就是典型的 harness 优化。

#### L3 哲学层：Harness 是"AI 的操作系统"

把 LLM 类比成 CPU：
- **CPU（模型）**：负责"算"
- **OS（harness）**：负责调度、内存、I/O、权限、进程通信

OS 的设计哲学决定了 CPU 能跑多快。同理：
- Cursor 走"IDE 原生派"：harness 深度嵌入编辑器
- Claude Code 走"终端工程师派"：harness 模拟 senior engineer 工作流
- AutoGPT 走"自治派"：harness 让 LLM 自己规划自己

**未来 5 年的 AI 应用竞争，本质上是 harness engineering 的竞争**，不是模型本身的竞争（因为大家都用同一批 SOTA 模型）。

### 1.4 关键设计模式

1. **分层上下文（Layered Context）**：固定层（系统提示）→ 项目层（CLAUDE.md）→ 会话层（对话历史）→ 工具层（即时结果）
2. **工具协议契约（Tool Protocol）**：JSONSchema + 执行器 + 错误处理，接口与实现解耦
3. **Hook 拦截器（Hooks）**：PreToolUse / PostToolUse / Stop 三个时机切面，AOP 思想搬到 AI agent
4. **延迟绑定（Lazy Binding）**：渐进式披露原则的工程化
5. **失败即数据（Failures as Data）**：把"模型出错"当成正常输入

---

## 二、开源生态全景（2025-2026）

### 2.1 按"野心层级"分层

| 层级 | 代表项目 | 流派 | 值得读的点 |
|------|---------|------|----------|
| **L1 极简派** | Aider | Python CLI，老祖宗 | repo-map、git-aware diff、最小可用 harness 范本 |
| **L1 极简派** | Codex CLI | OpenAI 官方 | 沙箱执行、最小工具集、Rust 重写中 |
| **L2 IDE 派** | Cline | VSCode 插件，纯开源 | **必读** —— MCP 集成最早最完整，TS 实现优雅 |
| **L2 IDE 派** | Roo Code | Cline fork | 多模式（architect/code/ask）切换 |
| **L2 IDE 派** | Continue | VSCode/JetBrains | 自定义 agent + 上下文 provider 体系 |
| **L3 自治派** | OpenHands | 前 OpenDevin | Docker 沙箱、AgentSkills、CodeAct 论文实现 |
| **L3 自治派** | SWE-agent | 普林斯顿学术 | ACI（Agent-Computer Interface）概念奠基者 |
| **L3 自治派** | goose | Block（Square）出品 | 工程化最好的开源 harness 之一，Rust core |
| **L4 框架派** | Mastra | TS-first agent framework | 类型安全、workflow DSL |
| **L4 框架派** | LangGraph | LangChain 进化版 | 图状态机编排，更像 BPM |
| **L4 框架派** | PydanticAI | Pydantic 出品 | type-safe agent |
| **协议层** | MCP | Anthropic 标准 | **2025 年最大变量** —— 已成事实标准 |
| **协议层** | A2A | Google 推 | Agent-to-Agent 协议，2025-04 发布 |
| **协议层** | AG-UI | CopilotKit 主导 | Agent ↔ Frontend 标准化 |

### 2.2 谁是"大佬"

Harness engineering 现在没有"绝对权威"，而是**协议派**和**实现派**双线竞跑：

- **协议派话事人**：**Anthropic（MCP）** —— 把工具调用做成 USB-C，绕过框架战争
- **实现派标杆**：**Cline 团队 + goose（Block）** —— 工程质量最高的开源参考
- **学术派**：**Princeton NLP（SWE-agent）+ MIT（CodeAct）** —— 概念输出
- **野路子**：**Geoffrey Huntley、Simon Willison** —— Blog 驱动，影响开发者心智
- **东方力量**：**Cursor、Devin（Cognition）** —— 闭源但定义体验上限

### 2.3 关键观察

- **2025 年的爆点是协议层**：MCP 已经赢得事实标准，A2A、AG-UI 跟进
- **开源 harness 还在内核之战**：Cline、goose、OpenHands 都在重写自己的"agent loop"
- **治理层无人入场**：所有项目都在做"如何让 agent 跑起来"，没人系统性做"如何让一群 agent 跑得好"

---

## 三、mossx 战略定位：Harness 治理层

### 3.1 三条战略路径

| 路径 | 定位 | 风险 | 天花板 | 护城河 |
|------|------|------|------|------|
| **A：Premium Host** | 做"AI 编码引擎"的最好客户端 | 低 | 中 | UX / 集成深度 |
| **B：Meta-Harness（治理层）** | 做"harness 之上的 harness" | 中 | 极高 | 抽象能力 + 协议设计 |
| **C：自研 harness 内核** | 替换 Claude Code/Codex | 高 | 中 | 垂直差异化 |

### 3.2 选择路径 B 的逻辑

**L2 本质层**：harness 是 AI 工程的 OS，但**今天的 OS 是封闭的** —— Claude Code 不让你看它的 memory 调度，Codex 不公开它的 prompt 模板。这正是"开放性"机会。

**L3 哲学层**：技术史上每次"封闭工具集合"都会催生"治理层"：
- 数据库混战 → ORM / ODBC
- 云厂商混战 → Terraform / K8s
- LLM 混战 → LangChain / LiteLLM
- **Harness 混战 → ?（mossx 的位置）**

### 3.3 mossx 现状盘点

> **核心洞察**：你以为还没开始，其实已经走了 60%。

> 📌 **v1.1 校准**：本表 v1.0 版本，更完整的现状清单见 [§0.2 走在正确方向上](#02--走在正确方向上保留--强化)。

| mossx 已有的资产 | 治理层视角的真实身份 |
|------|------|
| **多引擎（claude / codex / gemini / opencode）** | **多 agent 运行时** —— 治理的物理前提 |
| `RealtimeAdapter` / `HistoryLoader` / `NormalizedThreadEvent` | **EAL 雏形**（已存在，待上升为治理 contract） |
| `StatusPanel.Checkpoint` 四态判词 | **Agent SLA 状态机** 雏形 |
| `WorkspaceEditableDiffReviewSurface` | **Policy Enforcement Point**（人在回路审批） |
| `context-ledger` feature | **跨引擎成本/上下文账本**（治理语义已立） |
| `session-activity` feature | **Audit Trail** 雏形 |
| `Trellis` 任务编排 | **跨引擎 Workflow Engine** 雏形 |
| `OpenSpec` 规范驱动 + `SpecHub` | **Spec-as-Policy**（规范即策略） |
| `engine-control-plane-isolation` spec | **"Control Plane" 语言已正式化** |
| i18n + dock/popover 双宿主 | **双视角 UI**（开发者 vs 管理员）雏形 |

**真正缺的不是代码，是 mental model 的归零** —— 把它们**重新解读为治理资产**，然后把缝补起来。

### 3.4 概念归零：术语翻译

```
旧词汇            →     新词汇
─────────────────────────────────────────────
"引擎"             →   Managed Agent
"消息"             →   Work Unit
"状态"             →   SLA / Lifecycle State
"工具调用"         →   Side Effect / Capability Invocation
"会话"             →   Managed Workload
"diff 预览"        →   Pre-commit Policy Gate
"checkpoint"      →   Agent Health Signal
"trellis 任务"     →   Cross-Engine Workflow
```

> 当你说"消息"时你在想"内容"；当你说"Work Unit"时你在想"调度、成本、可追溯、可重放"。**语言定义认知边界**。

---

## 四、当前客户端落地路径

> ⚠️ **v1.6 执行校准**：本章不再推荐"先建 EventBus / 新建治理目录"。当前代码已经有 runtime contract、context ledger、session activity、checkpoint、SpecHub 等治理资产；正确动作是**先正式化现有 contract，再补 capability / ledger / policy / event schema**。

### 4.1 代码真实对比度矩阵

| 治理目标 | 当前代码事实 | 对比度 | 下一步 |
|---|---|---:|---|
| 多引擎 runtime | `EngineType = claude/codex/gemini/opencode`，Rust/TS 两侧均有 engine features | 85% | 统一为 `engine-capability-matrix` spec |
| Realtime contract | `NormalizedThreadEvent`、`RealtimeAdapter`、`realtimeEventContract` tests 已存在 | 80% | 把幕布 contract 上升为 Engine Runtime Contract |
| History contract | `HistoryLoader` 已存在，4 引擎 loader + shared loader 已接入 | 70% | 定义 history snapshot parity / fallback policy |
| Cost/Context Ledger | `context-ledger` 已有 block/group/projection/governance utils | 55% | 补跨引擎 pricing、budget、SLO、session aggregate |
| Audit Trail | `session-activity` 从 thread/items 派生 timeline | 45% | 补 `AgentDomainEvent` schema，再升级消费源 |
| Policy Chain | `Checkpoint` 已有 validation profile / verdict / risk / action | 50% | 把 verdict 判决扩为可插拔 policy chain |
| Spec-as-Policy | `SpecHub` 可读取/执行 OpenSpec workflow | 65% | 让 governance policy 可发布为 spec + CI gate |
| MCP Governance IPC | Rust/Tauri 已暴露 MCP config/status/inventory 的部分路径 | 40% | 先定义 inventory/status contract，再覆盖 tool-call audit |

> 💡 **判断标准**：对比度低于 50% 的领域，不应该先大规模抽象；先补 schema / contract / evidence，再决定是否需要 runtime infrastructure。

### 4.2 五件 Quick Win（按优先级，v1.6 版）

#### 第 1 件：Engine Runtime Contract 正式化

**为什么先做这个**：`RealtimeAdapter`、`HistoryLoader` 和 `NormalizedThreadEvent` 已经存在；这是最低成本、最高确定性的治理立法。

**做法**：
1. 新增或扩展 OpenSpec：`engine-runtime-contract`。
2. 把 event / history / adapter registration / legacy alias / parity test 写成 SHALL。
3. 不搬目录、不重写 mapper，只补契约与验证矩阵。

**验收信号**：新引擎接入时先补 capability + adapter + loader + parity tests，而不是在 UI 层猜分支。

#### 第 2 件：Engine Capability Matrix

**为什么第二**：前端/Rust 已有 feature flags，但不是统一法律。没有 capability matrix，UI 和 policy 只能继续写散落的 engine 判断。

**做法**：
1. 新建 OpenSpec change：`add-engine-capability-matrix-spec`。
2. 先覆盖 `streaming / reasoning / toolUse / imageInput / sessionContinuation / mcp / hooks / subagent / costReport`。
3. Rust `EngineFeatures` 与 TS `EngineFeatures` 必须能映射到同一 matrix。

**验收信号**：引擎能力变更必须有 spec、fixture、UI degradation rule。

#### 第 3 件：Cost/Context Ledger

**为什么第三**：用户能直接感知价值，但它依赖前两步的 engine/capability 语义稳定。

**做法**：
1. 复用 `context-ledger` 的 block/group/projection。
2. 增加 session-level usage aggregate、pricing source、budget threshold。
3. 在 StatusPanel 或 context-ledger panel 显示预算与上下文消耗。

**验收信号**：同一 workspace 中 claude/codex/gemini/opencode 的 token/context/cost 能被同一视图解释；未知 pricing 明确显示为 degraded，而不是瞎算。

#### 第 4 件：Checkpoint → Policy Chain

**为什么第四**：`Checkpoint` 已经有 `validation profile / risk / verdict / next action`，这是 Policy Engine 的自然宿主。

**做法**：
1. 保留现有 verdict 行为。
2. 提取 policy rule 输入/输出：`evidence -> risk/action/verdict contribution`。
3. 第一批 policy 只消费现有 `CheckpointValidationEvidence`：lint / typecheck / tests；large-file 与 spec-consistency 需要先各自建立 evidence bridge，不能直接塞进本 change。

**验收信号**：Policy Chain 是解释型，不是黑箱；每个阻断都能说清楚 source、reason、repair action。

#### 第 5 件：AgentDomainEvent Schema

**为什么最后才做**：事件 schema 是必要的，但 EventBus 不是第一步。先把 schema 稳住，再决定是否需要 bus、store 或 append-only log。

**最小事件集（第一版严格 10 类，只定义 schema，不接 reducer runtime）**：
```
AgentDomainEvent
├─ session.started / ended
├─ turn.started / completed / failed
├─ message.delta.appended / message.completed
├─ tool.started / completed
└─ usage.updated
```

**验收信号**：TypeScript `Readonly` union、pure factory、reducer derivation fixtures 完整；`useThreadsReducer*.ts` 不导入 domain-events、不 emit、不改 runtime 行为。`policy.evaluated` / `file.changed` 与 session-activity 消费迁移全部作为后续独立 change。

### 4.3 Capability Matrix contract 示例

```
能力键示例（不是最终事实填表）

Capability key             Source of truth
─────────────────────────────────────────────────────────────
streaming.text             TS/Rust EngineFeatures + runtime evidence
streaming.reasoning        Rust EngineFeatures + transcript evidence
tool.mcp                   Rust EngineFeatures.mcp + MCP IPC inventory
image.input                TS/Rust EngineFeatures mapping
session.continuation       TS sessionContinuation + Rust session_resume
cost.report                ThreadTokenUsage + pricing/budget inventory
hook.pre-tool-use          inventory pending；不能从 UI 常量猜测
memory.persistent          inventory pending；不能从引擎名称猜测
subagent                   inventory pending；不能从 Claude/Codex 心智猜测
```

矩阵值必须来自 inventory / mapping / fixture，使用统一状态 `supported | compat-input | unsupported | unknown`。UI 根据矩阵做"能力感知渲染"：某引擎不支持 `hook.pre-tool-use` 时，写入 `unsupported`；暂未完成 inventory 时写入 `unknown` 并按 unsupported 降级。**不要再写 hook 支持位这种前端局部 boolean，也不要把 MCP 当成第五个引擎。**

### 4.4 Context Bridge（杀手锏）

把会话上下文做成**可迁移单元**：

```
[Codex 跑到 80% context]
    ↓ Context Bridge：压缩 + 提取关键决策
[导出 Portable Context Bundle (PCB)]
    ↓ 转换协议（MCP-compatible）
[在 Claude Code 中续起，保留任务连续性]
```

**价值**：用户痛点直击 —— "Codex 上下文爆了/账号超限了，能不能换 Claude 接着干？" —— **今天没人能做**。

### 4.5 Workflow Engine（trellis 升级）

把 trellis / openspec 这类元工作流**与引擎解耦**：

```yaml
# workflow.yml 示例
name: feature-implementation
steps:
  - id: plan
    engine: claude-code     # 复杂规划用 Claude
    skill: wf-plan-writing
  - id: implement
    engine: codex           # 长 context 实现用 Codex
    context_from: plan
  - id: review
    engine: claude-code     # 审查回到 Claude
    skill: review
```

**效果**：成本敏感任务自动路由到便宜引擎，复杂任务路由到强引擎，**user 完全无感**。

---

## 五、关键设计决策

### 决策 1：抽象时机

| 选项 | 优缺点 |
|------|------|
| ❌ 先设计完美抽象，再适配引擎 | "未来主义陷阱"，做半年没产出 |
| ❌ 已有 contract 仍重新建一套 `src/governance/engines` | 新旧抽象并存，制造漂移 |
| ✅ **现有四引擎事实 → 正式化已有 contract** | 真实驱动，避免空中楼阁 |

**决策**：**显式化已有抽象**。`RealtimeAdapter` / `HistoryLoader` / `NormalizedThreadEvent` 已经承担 EAL 的第一层职责；下一步不是重抽象，而是把它们写成 OpenSpec contract，并补 capability matrix。

### 决策 2：协议哲学

| 选项 | 含义 |
|------|------|
| ❌ 自定义 mossx 私有协议 | 短期快，长期反生态 |
| ✅ **短期 MCP-aware / MCP-compatible，对内保留私有优化协议** | 兼容生态，同时避免过早承诺对外 server 形态 |

**决策**：短期 **MCP-compatible / MCP-aware**，中期再评估是否对外暴露为 MCP Server。当前更确定的收益是 MCP inventory/status/audit 通过 Tauri IPC 可解释；直接承诺 MCP Server 容易把产品路线带到生态集成而非本地治理核心。

### 决策 3：UI 视角分层

| 视角 | 用户 | 默认显示 |
|------|------|--------|
| 🧑‍💻 **开发者视角** | 个人开发 | StatusPanel 当前体验，治理"隐形" |
| 🛡 **管理员视角** | Team Lead / 合规 | Cost Dashboard / Audit Log / Policy 编辑 |

**决策**：**单一应用，双视角切换**。不要做两个 app。通过 settings 切换或自动识别（个人账号 = 开发者，团队账号 = 管理员）。

### 决策 4：数据存储

| 选项 | 何时合适 |
|------|--------|
| ❌ 上来就上云端后端 | 过早工程化，养不起 |
| ✅ **SQLite 本地优先 + 可选导出/同步** | Tauri 天然适合 |

**决策**：所有 trace/audit/cost 数据**先落本地 SQLite**。后续做团队版时再加 sync 协议。**Local-first 是 Tauri 应用的天然优势**，别浪费。

---

## 六、演进路线与时间线

> ⚠️ **v1.6 校准**：本章时间线以"已有治理资产正式化"为前提，不再以"从零建立 governance kernel"为前提。团队实际节奏应以 OpenSpec change + Trellis task 为执行载体。

### 6.1 三阶段路线图（v1.6 执行版）

```
─────────────────────────────────────────────────────────────────
阶段 1   "立法收口"（2-3 周）
─────────────────────────────────────────────────────────────────
✓ 基于 stabilize-core-runtime 成果创建 engine-runtime-contract 后续 change
✓ 创建 add-engine-capability-matrix-spec
✓ 明确 RealtimeAdapter / HistoryLoader / NormalizedThreadEvent 的治理边界
✓ 为新引擎接入定义最小 contract checklist

─────────────────────────────────────────────────────────────────
阶段 2   "可见治理"（1-2 个月）
─────────────────────────────────────────────────────────────────
✓ context-ledger 升级为 Cost/Context Ledger
✓ StatusPanel 或 ContextLedgerPanel 显示 session budget / token SLO
✓ Checkpoint 提取第一版 policy rule 输入/输出
✓ lint / typecheck / tests validation evidence 插件化；large-file / spec-consistency 先补 evidence bridge

─────────────────────────────────────────────────────────────────
阶段 3   "事件与迁移"（3-6 个月）
─────────────────────────────────────────────────────────────────
✓ AgentDomainEvent schema 落地
✓ 评估 domain event buffer / subscription / session-activity 消费迁移
✓ Context Bridge：Codex → Claude 上下文迁移
✓ Workflow Engine 升级 Trellis/OpenSpec 为跨引擎调度
✓ 评估 MCP Server / AG-UI / A2A 对外协议路线
✓ Team 版基础：Policy 同步 + Audit 集中
─────────────────────────────────────────────────────────────────
```

### 6.2 本周可以立刻做的事（一周验证方向）

| 时长 | 动作 | 验证什么 |
|------|------|--------|
| 0.5 天 | 给本文件补一张 governance 领域图 | mental model 是否能被非作者读懂 |
| 1 天 | 起草 `add-engine-capability-matrix-spec` | capability 语言是否能覆盖 4 引擎差异 |
| 1 天 | 起草 `formalize-engine-runtime-contract` | 现有 adapter/loader/event contract 是否能被 OpenSpec 表达 |
| 1 天 | 梳理 context-ledger 现有输入源与缺口 | token/context/cost 的缺口在哪里 |
| 1 天 | 梳理 Checkpoint policy extraction 草图 | verdict/risk/action 是否能插件化 |

> **一周内的目标不是写 EventBus，而是把治理层的"法律文本"写清楚**。法律清楚后，代码才不会抽象漂移。

### 6.3 三个绝不能犯的错

1. **绝不另建平行治理目录** —— 除非只是放 schema/interface；否则优先提升现有 feature 的 contract。
2. **绝不先建 EventBus** —— 先 schema，后消费源，最后才决定 bus/store/log。
3. **绝不把 capability 写成 UI 常量** —— capability 是跨前后端 contract，不是组件分支。
4. **绝不做没人用的治理** —— 每个 policy / dashboard 必须有具体 user story 驱动。
5. **绝不绕过 heavy-test-noise sentry** —— 新增测试必须保持低噪声，必须等价满足 `.github/workflows/heavy-test-noise-sentry.yml` 的 parser test 与 gate。
6. **绝不绕过 large-file governance sentry** —— 新增 spec、fixture、source 拆分都必须等价满足 `.github/workflows/large-file-governance.yml` 的 parser、near-threshold 与 hard gate。
7. **绝不写单平台客户端逻辑** —— 所有路径、shell、newline、process、可执行解析必须按 Win/macOS/Linux 三端设计；平台差异只能在明确 adapter 层隔离。

---

## 七、北极星图景

### 7.1 治理立体图

```
                    ┌────────────────────────────────────┐
                    │      用户 / 团队                     │
                    │  (Developer View | Admin View)      │
                    └─────────────────┬──────────────────┘
                                      │
        ┌─────────────────────────────▼─────────────────────────────┐
        │             Governance Kernel（治理内核）                  │
        │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
        │  │ Domain   │  │ Policy   │  │ Audit/   │  │ Workflow │  │
        │  │ Events   │  │ Chain    │  │ Cost     │  │ Engine   │  │
        │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
        │       └──────┬──────┴──────┬──────┴──────┬──────┘        │
        └──────────────┼─────────────┼─────────────┼───────────────┘
                       │             │             │
              ┌────────▼────────┐  ┌─▼──────────┐ ┌▼─────────────┐
              │ Engine Runtime  │  │ MCP-aware  │ │ Context      │
              │ Contract (EAL)  │  │ IPC/Bridge │ │ Bridge       │
              └────────┬────────┘  └────────────┘ └──────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Claude   │  │ Codex    │  │ Gemini / │
  │ Code     │  │          │  │ OpenCode │
  └──────────┘  └──────────┘  └──────────┘
```

### 7.2 最终形态："AI 编码的 VS Code"

| 维度 | mossx-as-Meta-Harness 的样子 |
|------|----------------------------|
| **对个人用户** | 装一个 mossx，所有 AI 编码引擎一键切换，记忆和会话自由流转 |
| **对团队** | 统一的 audit/cost/policy gate，企业级合规 |
| **对生态** | 引擎厂商竞相接入（接入越多用户越多），形成**双边网络效应** |
| **对开发者** | 可发布 workflow、skill、policy 插件 —— 形成**插件市场** |
| **对未来** | 当 GPT-6 / Claude 5 出来时，**用户在 mossx 里几乎无感切换** |

### 7.3 三句话总结

1. **对用户**：你不再"选引擎"，你选"任务" —— mossx 帮你选最适合的引擎。
2. **对市场**：当所有引擎都想被 mossx 接入时，你就赢了。
3. **对你**：从"做一个 AI 客户端"升级为"定义 AI 工程的 OS 抽象"。

### 7.4 三个反直觉的判断

> **Insight 1**：治理层最大的护城河不是技术，是**"被多个引擎信任"**。所以**保持中立**比任何代码都重要 —— 不要倾向任何一家引擎厂商。

> **Insight 2**：治理层的早期用户**不是企业，是高级个人开发者** —— 他们最先感受到"我同时用 Claude 和 Codex，缺一个统一治理工具"的痛。PLG 路径。

> **Insight 3**：**Tauri 不是劣势，是优势**。Local-first + 跨平台 + 系统集成能力，**比 web-based 治理工具（如 LangSmith）更适合做"开发者本地治理层"**。这是差异化护城河之一。

---

## 八、风险清单

| 风险 | 严重度 | 缓解策略 |
|------|------|--------|
| Claude Code / Codex 自己出 GUI 把 mossx 干掉 | 🔴 高 | 抢先建立跨引擎护城河，单引擎厂商不会做"治理多家" |
| 引擎演化快，抽象层永远落后 | 🟡 中 | 抽象层"宁愿薄不要厚"，优先显式化已有抽象 |
| 用户量起不来，飞轮转不动 | 🟡 中 | 个人开发者先行（PLG），用 OSS 建社区 |
| MCP/A2A 协议爆炸性演化 | 🟢 低 | 拥抱协议，但短期聚焦 MCP-aware inventory/status/audit |
| 治理层过度工程化，开发体验变差 | 🟡 中 | 双视角 UI，治理对开发者默认隐形 |
| 团队对"治理"概念抵触 | 🟢 低 | 用"DX 增强"包装治理，先给好处再讲规则 |
| 新建平行 `src/governance/` 导致现有 feature 漂移 | 🟡 中 | 仅在需要 schema/interface 时引入轻量 contracts；业务逻辑仍归属原 feature |
| EventBus 先行导致 reducer / session-activity / context-ledger 三套事件源 | 🔴 高 | 先定义 `AgentDomainEvent` schema，再逐步迁移消费者，最后决定是否需要 bus |
| capability matrix 写成前端常量，后端实际能力漂移 | 🔴 高 | 用 OpenSpec 定义 capability contract，TS/Rust 都必须映射到同一矩阵 |
| OpenSpec 状态滞后导致路线重复劳动 | 🟡 中 | 每次文档更新先核对 `openspec/changes/*/tasks.md` 与主 spec 状态 |
| MCP Server 路线过早承诺，稀释本地治理核心 | 🟡 中 | 短期定位 MCP-aware / MCP-compatible；对外 server 化进入阶段 3 再评估 |

---

## 附录 A：术语表

| 术语 | 全称 / 来源 | 含义 |
|------|------|------|
| **Harness** | AI Agent Harness | 包裹 LLM 的运行时框架，提供工具/记忆/调度等能力 |
| **EAL** | Engine Abstraction Layer | 引擎抽象层；在 mossx 当前阶段主要表现为 Engine Runtime Contract |
| **MCP** | Model Context Protocol | Anthropic 推动的 agent ↔ 工具协议标准 |
| **A2A** | Agent-to-Agent Protocol | Google 推动的多 agent 通信协议 |
| **AG-UI** | Agent-UI Protocol | CopilotKit 主导的 agent ↔ 前端协议 |
| **ACI** | Agent-Computer Interface | SWE-agent 提出的 agent 与计算机交互抽象 |
| **PCB** | Portable Context Bundle | 可迁移的会话上下文包（mossx 自创术语，待验证） |
| **PLG** | Product-Led Growth | 产品驱动增长（商业模式） |
| **SLA** | Service Level Agreement | 服务等级协议，借用至 agent 健康度判定 |
| **Policy Gate** | Policy Enforcement Point | 策略执行点，变更应用前的检查关卡 |

---

## 附录 B：参考资料

### 开源项目
- [Aider](https://github.com/Aider-AI/aider) —— 老牌 CLI harness
- [Cline](https://github.com/cline/cline) —— VSCode 插件 harness 标杆
- [Roo Code](https://github.com/RooCodeInc/Roo-Code) —— Cline fork，多模式
- [Continue](https://github.com/continuedev/continue) —— IDE 通用 harness
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) —— 自治派代表
- [SWE-agent](https://github.com/SWE-agent/SWE-agent) —— 学术派
- [goose](https://github.com/block/goose) —— Block 出品，工程化标杆
- [Mastra](https://github.com/mastra-ai/mastra) —— TS-first framework
- [LangGraph](https://github.com/langchain-ai/langgraph) —— 图状态机编排
- [Codex CLI](https://github.com/openai/codex) —— OpenAI 官方

### 协议规范
- [Model Context Protocol](https://modelcontextprotocol.io)
- [A2A Protocol](https://github.com/google-a2a/A2A)
- [AG-UI Protocol](https://github.com/ag-ui-protocol/ag-ui)

### 思想读物
- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Cognition — Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)
- Geoffrey Huntley's blog on Cline / agent engineering
- Simon Willison's weblog on LLM tooling

---

## 文档变更记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|--------|
| v1.0 | 2026-05-17 | 陈湘宁 × AI Co-Architect | 初稿：整合三轮战略讨论 |
| v1.1 | 2026-05-17 | 陈湘宁 × AI Co-Architect | **事实校准版**：基于 `src/` 与 `openspec/` 全量扫描，新增第 0 章"现状校准 Review"。核心修订：① 双引擎 → 四引擎 ② 新建治理目录 → 重组现有资产 ③ Quick Win 顺序重排（EAL 显式化优先） ④ 标识 `app-shell.tsx` 拆解为最大前置依赖 ⑤ 嫁接到 `stabilize-core-runtime-and-realtime-contracts` OpenSpec 主线 |
| v1.2 | 2026-05-17 | 陈湘宁 × AI Co-Architect | **执行校准版**：修正 adapter/loader 数量、OpenSpec 状态、MCP/Rust 边界与 capability 事实；将路线从"建 EventBus/新治理目录"调整为"正式化现有 runtime contract → capability matrix → Cost/Context Ledger → Policy Chain → AgentDomainEvent schema"；补充代码真实对比度矩阵与风险清单。 |
| v1.3 | 2026-05-17 | 陈湘宁 × AI Co-Architect | **提案一致性校准版**：修正 capability matrix 示例的虚构事实填表，明确 MCP 不是引擎；把 `session-activity`、large-file policy、shell 拆解任务与 9 个 OpenSpec 提案的阶段边界拉齐。 |
| v1.4 | 2026-05-17 | 陈湘宁 × AI Co-Architect | **治理阻塞提案校准版**：补齐 bundle chunking、long-list virtualization、realtime batching、mega hub split 与 harness 治理层的强关联，明确它们是治理交付基座而非外围性能优化。 |
| v1.5 | 2026-05-17 | 陈湘宁 × AI Co-Architect | **治理设计收口版**：补齐 OpenSpec 执行队列与依赖矩阵，明确 9 个 governance changes 的实施层级、并行边界与收口判定；后续进入执行/验证/归档，不再继续扩写战略概念。 |
| v1.6 | 2026-05-17 | 陈湘宁 × AI Co-Architect | **实施约束加固版**：把 heavy-test-noise sentry、large-file governance sentry 与 Win/macOS/Linux 三平台兼容写入治理实施硬约束；修正 runtime contract 任务文案，防止实施阶段把 contract 立法误读成 capability spec。 |

---

> **Let's Build Something Great.**
