## Context

用户报告了两类小概率但高伤害的 Codex 死态：

1. 新建 Codex 会话后不发送消息，几分钟后首次发送就出现断链/恢复卡片；点击恢复或重连按钮无效。
2. 正在进行的 Codex 会话卡住十多分钟，用户 stop 后重新发送也很难续上；但新建 Codex 会话可用。

这说明 Codex 连通性本身通常没有整体损坏，真正失稳的是当前 conversation identity。当前实现中存在几条已经落地的局部保护：

- `conversation-runtime-stability`：bounded recovery guard、quarantine、last-good continuity、runtime-ended diagnostics。
- `codex-stale-thread-binding-recovery`：verified alias、recover-only、fresh fallback 与 recovery card outcome。
- `codex-long-task-runtime-protection`：active-work protection 防止长任务被 idle eviction 打断。
- `codex-stalled-recovery-contract`：queue fusion / continuation 的 no-progress bounded settlement。

但这些能力仍缺一个更上层的 Codex liveness model：首轮空会话是否是 durable thread？runtime ready 是否等于 old thread recovered？正在进行的 turn 长时间没有 progress evidence 后应该如何停止、重发或 fresh continue？本设计把这些问题收口为 Codex conversation liveness contract。

## Goals / Non-Goals

**Goals:**

- 把 Codex conversation 拆成 `draft`、`thread identity`、`runtime generation`、`turn` 四个 lifecycle plane。
- 让首轮空 Codex 会话成为 disposable draft；旧空 `threadId` 失效时，首条消息 fresh create + send。
- 让 runtime reconnect 与 thread identity recovery 分离：runtime ready 只是前置条件，不代表旧会话恢复成功。
- 让 long no-progress turn 进入 bounded stalled / dead-recoverable state，stop 后必须 terminal settlement。
- 让 recovery action 输出 classified result：`rebound`、`fresh`、`failed`、`abandoned`。
- 让 diagnostics 足以复盘小概率问题，不依赖稳定复现。

**Non-Goals:**

- 不重写 Codex CLI protocol。
- 不把所有 engine 都迁入 Codex-specific liveness state machine。
- 不新增持久化 incident database。
- 不把所有静默期都判为故障；quiet protected work 仍必须被保护。

## Decisions

### Decision 1: Draft-first semantics for empty Codex conversations

当前 Codex 点“新会话”会立即走 `thread/start`，拿到真实 `threadId` 并标记 loaded。这个模型对首轮空会话过重：用户没有发送任何 work，系统却把该 `threadId` 当 durable conversation identity。若 runtime 被清理或 CLI 没保留空 thread，首次发送就会变成“新 runtime + 旧空 threadId”。

采用方案：给 Codex 空会话补 draft semantics。实现不一定必须立刻取消 backend `thread/start`，但 lifecycle 层必须把“无 accepted user turn 的 Codex thread”视为 disposable draft。

逻辑草图：

```text
CodexDraft(no accepted turn)
  ├─ first send succeeds on existing thread ─▶ DurableThread(verified)
  └─ first send gets identity failure ───────▶ FreshThread + replay first prompt
```

替代方案是完全 lazy-create Codex thread，直到首轮发送才 `thread/start`。它更干净，但改动面更大；本 change 可以先实现 semantic draft-first：保留现有 start path，但首轮失败按 draft replacement 处理。

### Decision 1.1: Accepted-turn classification is authoritative, not a UI guess

首轮 draft fallback 的边界必须非常硬：只有“没有 accepted user turn / durable activity fact”的 Codex identity 才能自动 disposable replacement。否则系统可能把用户已经开始过的真实上下文误判成空 draft。

采用方案：引入 canonical accepted-turn / durable-activity fact。前端 `itemsByThread` 可以作为快速 hint，但不能单独决定 durable promotion 或 silent fresh replacement。权威事实优先来自已持久化的 thread/session activity、backend accepted-turn acknowledgement、或等效 lifecycle marker。

边界规则：

```text
acceptedTurnFact = true       -> DurableThread; no silent fresh replacement
acceptedTurnFact = false      -> DisposableDraft; first-send identity failure can fresh create + send
acceptedTurnFact = unknown    -> DurableSafe; verify/recover first, do not silently replace
```

这条规则把“不确定”归入保护旧上下文的一侧。代价是某些异常空会话可能多出现一次 recovery UI；收益是不会悄悄丢掉真实 work。

实现中还需要一个更窄的首发例外：如果本地 accepted-turn marker 因 reload 或 draft state 丢失而缺席，但当前 send 已经创建了 pre-accept optimistic user intent、没有任何 durable activity、且 backend 返回的是 `thread not found` / `session not found` 这类 missing-thread 证据，而不是 malformed `invalid thread id`，则该次发送仍属于 idle-before-first-send 的 disposable draft 语义。此例外只保护当前 prompt 的 fresh replay，不把旧空 identity 记为 durable recovery。

### Decision 2: Runtime generation is a boundary, not just a diagnostic

旧 runtime 的 shutdown / stdout eof / manual shutdown 可能晚于新 runtime acquire 到达。没有 generation 边界时，旧 runtime 的事件可能污染新会话状态。

采用方案：在 runtime manager / liveness diagnostic 中引入 `runtimeGeneration` 或等价 process identity。所有 runtime-ended、stale cleanup、active-work settlement 都必须带 generation 维度；前端只消费与当前 liveness chain 匹配的 evidence。

候选字段：

- `workspaceId`
- `engine`
- `runtimeGeneration` 或 `processId + startedAt`
- `threadId`
- `turnId`
- `livenessStage`
- `recoverySource`
- `outcome`

不要求一次性新建大 ledger；可先扩展现有 Runtime Pool row、runtime diagnostics、thread session debug log。

### Decision 2.1: Runtime/process identity must be cross-platform

runtime generation 不能写成 macOS-only process model。Windows 与 macOS 都必须能表达同一组 lifecycle fact：

- process identity 使用 monotonic generation，或 `pid + startedAt` 这样的 composite identity；禁止 pid-only，因为 pid 可复用。
- path handling 使用 Rust/Tauri path API、`PathBuf`、已有 storage/app path resolver；禁止手写 `/` 或 `\` 拼接。
- process spawn 使用 executable + args array；禁止把核心语义依赖 shell-specific quoting。
- shutdown reason 归一化为 `manual-shutdown`、`stdout-eof`、`process-exit`、`watchdog-stalled` 等平台中立枚举；禁止依赖 OS 原始错误字符串做状态判断。
- stop/kill 行为允许平台实现不同，但对上层只暴露同一 terminal / abandoned / runtime-ended contract。

验证必须至少覆盖 macOS 本地路径和 Windows path / command quoting 的单元或 fixture case；如果 CI 暂时没有 Windows runner，必须保留可执行的 platform-neutral unit tests 和手动 Windows smoke checklist。

### Decision 3: Identity recovery owns thread target; runtime recovery only owns process readiness

`ensureRuntimeReady` 成功只能说明 workspace 有可用 runtime。它不能证明旧 `threadId` 仍可 `resume` 或 `turn/start`。

采用方案：所有 recovery button 分两段：

1. Runtime readiness：可启动/恢复 runtime。
2. Identity readiness：验证旧 thread、rebind 到 canonical thread，或明确 fresh continuation / failed。

UI outcome 不再以 `ensureRuntimeReady` 成功为成功，而以 identity recovery result 为准。

```text
Reconnect button:
  ensureRuntimeReady(workspace)
  verifyIdentity(thread)
    rebound -> restored
    fresh -> continue in new thread
    failed -> keep retryable failure
```

### Decision 4: Bounded no-progress watchdog is turn-level, not runtime-level

长任务可能安静执行，不应该被 idle eviction 杀掉。但“十多分钟没有任何 progress evidence”的前台 turn 也不能无限 processing。

采用方案：active-work protection 继续保护 runtime；另设 turn-level no-progress watchdog。watchdog 只改变 turn liveness，不直接杀 runtime。

Progress evidence 包括：

- `turn/started`
- stream delta / assistant delta
- tool / command / file change item
- approval / user input request
- terminal completed / error
- runtime-ended diagnostic

watchdog 采用两级窗口，避免把“正在跑工具但没有 stdout”的正常长任务误判为死态：

- 普通 Codex foreground turn：180 秒没有 progress evidence 后进入 recoverable stalled。
- 已有 command/tool/file-change execution item 处于活跃状态：使用更长的 execution-active 静默窗口；180 秒只表示需要继续观察，不能 settle stalled。

当超过 bounded window：

- thread 进入 `stalled` / `dead-recoverable`
- UI 展示 stop / retry / fresh continuation 等安全动作
- stop 后清理 active turn marker，settle 为 `abandoned`

### Decision 5: Fresh continuation is explicit, visible, and never mislabeled as restore

当旧 thread identity 不可恢复时，fresh continuation 是合理逃生通道，但必须保持诚实：

- `recover-only` 不应把 fresh 当 restored。
- `recover-and-resend` 可以 fresh，但必须可见地发送 replayed prompt。
- 首轮 empty draft 可以自动 fresh，因为没有旧上下文损失；durable thread 必须显式 fresh。

这保留两个工程价值：用户意图不中断，系统语义不撒谎。

### Decision 6: Verification uses fault injection matrix, not only happy-path tests

该问题小概率，不能等稳定复现。实现必须加 fault injection style tests：

- empty Codex draft idle 后 first send `thread not found`
- runtime ready but old thread `thread not found`
- `turn/start` 后 runtime-ended before terminal
- no progress window -> stalled
- stalled stop -> abandoned -> next send unblocked
- fresh continuation renders replayed prompt
- stale predecessor runtime-ended does not poison successor generation

## Risks / Trade-offs

- [Risk] Draft-first fallback 可能让用户误以为旧空会话被恢复。
  Mitigation: 首轮 empty draft 文案和 diagnostics 必须表达 draft replacement / fresh continuation。

- [Risk] Turn-level watchdog 误判真正安静执行的长任务。
  Mitigation: 普通静默窗口与 execution-active 静默窗口分离；工具/命令活跃时不使用 180 秒短窗口 settle，只进入 recoverable stalled 且不直接 kill runtime；收到匹配 progress evidence 可恢复。

- [Risk] generation 字段扩展跨 backend/frontend，容易遗漏调用点。
  Mitigation: 先在 runtime-ended、ensure runtime、send path、recovery card 四个关键入口落地，再扩大到 Runtime Pool console。

- [Risk] accepted-turn source of truth 不清晰会导致 silent fresh replacement 误伤真实上下文。
  Mitigation: `unknown` 必须走 durable-safe recovery；只有 authoritative fact 明确为 false 时才允许自动 draft replacement。

- [Risk] macOS 本地实现把 Unix process/path 假设写死，Windows 后续复现同类断链。
  Mitigation: runtime generation、path、spawn、shutdown reason 都用 platform-neutral contract；验证命令拆分，避免只在当前平台 happy path 通过。

- [Risk] fresh continuation 可能丢旧上下文。
  Mitigation: durable thread 只允许显式 fresh；UI 必须区分 `rebound` 与 `fresh`。

- [Trade-off] 系统会更早暴露“旧会话不可恢复”的事实。
  Mitigation: 这是正确产品语义；用 fresh continuation 保住用户意图，而不是假装旧上下文还在。

## Migration Plan

Implement in three reviewable slices, not as one wide PR:

1. Slice A: lifecycle facts and diagnostics only.
2. Slice B: first-turn draft / identity recovery behavior.
3. Slice C: stalled turn settlement and runtime protection compatibility.

Detailed sequence:

1. Add liveness helpers and diagnostics types for draft status, accepted-turn fact, identity outcome, runtime generation, and turn liveness stage.
2. Add platform-neutral runtime generation and process/path helpers before consuming them in UI.
3. Implement first-turn Codex draft fallback in the send path:
   - detect no accepted user turn / no durable local activity
   - on identity failure, create fresh Codex thread
   - replay first prompt visibly
4. Tighten recovery card flow:
   - runtime ready result stays separate
   - identity result drives UI state
   - fresh continuation copy and resend visibility remain explicit
5. Add turn-level no-progress stalled settlement:
   - track last progress evidence
   - settle to stalled after bounded window
   - stop clears active turn and produces abandoned outcome
6. Add generation-aware runtime diagnostics:
   - prevent predecessor shutdown from mutating successor state
   - expose correlated evidence in debug/runtime surfaces
7. Run focused test matrix, then broader quality gates:
   - targeted Vitest for messaging/recovery card/thread actions
   - targeted Rust runtime/session lifecycle tests, split by actual module/test filter
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run check:runtime-contracts`
   - `cargo test --manifest-path src-tauri/Cargo.toml`

Rollback strategy:

- If watchdog causes false stalled state, disable stalled settlement while keeping diagnostics.
- If draft fallback misroutes prompts, restrict fresh fallback to explicit recovery button and keep first-turn diagnostics.
- If generation diagnostics are incomplete, keep generation as debug-only while preserving existing runtime stability behavior.

## Open Questions

- Bounded no-progress default should be global, Codex-only setting, or hidden constant first?
- Fresh continuation for durable threads should appear as a button on the existing recovery card or as a separate explicit “新会话继续” card?
- Runtime generation should be a monotonic counter in runtime manager, or derived from `pid + startedAt` for lower migration cost?
