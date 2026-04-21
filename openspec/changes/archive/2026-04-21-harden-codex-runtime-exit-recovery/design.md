## Context

当前 Codex managed runtime 的稳定性链路已经有两部分基础设施：

1. backend `RuntimeManager` 会根据 `turn/started`、`turn/completed`、`turn/error`、`item/*` 事件维护 turn lease 与 stream lease，并在 reconcile 时避免回收有活动 lease 的 runtime。
2. frontend `useAppServerEvents` 会把 `turn/completed` / `turn/error` 转成 thread event，由 reducer 最终把 `isProcessing` 置回 false。

但这条链路存在两个主次分明的问题：

1. **主问题：active work protection 不够强。** 当前 turn lease / stream lease 更像内部 bookkeeping，没有被提升成“长任务存活边界”的正式契约。这样一来，`warm ttl`、budget reconcile、manual cooling/release 等本该只面向 idle runtime 的策略，仍有机会和活跃任务保护产生语义混淆。
2. **次问题：runtime 真退出时缺少统一收口。** `WorkspaceSession` 的 stdout/stderr 读取协程会消费 app-server 输出并转发事件，却没有一条统一的 child-exit / EOF watcher 去处理“进程已经结束，但没有发出 terminal lifecycle event”的情况。于是长任务一旦真的被 kill、崩溃、Broken pipe、stdout 提前 EOF，host 可能既没有 fail pending requests，也没有向 frontend 发出结构化 runtime-ended 诊断。

这个 change 是标准的 cross-layer behavior 变更：涉及 Rust session lifecycle、runtime pool bookkeeping、frontend event adapter、thread reducer、messages recovery UI、runtime pool console。它需要先把**长任务自动保活**这个主契约讲清楚，再补上异常退出后的 recovery fallback。

## Goals / Non-Goals

**Goals:**

- 为 Codex managed runtime 定义 `active work protection` 契约，使长任务在 active turn 或 active stream 期间自动续持 no-evict 保护。
- 让 `warm ttl`、budget overflow、manual release 只作用于 idle runtime，而不是隐式影响活跃任务。
- 保证 runtime 真失活时，thread 一定会离开 loading / processing 状态。
- 在 thread-facing recovery UI 与 runtime pool console 中提供一致、可关联的诊断信息。
- 补齐 backend 与 frontend 回归测试，使该能力能稳定进入 implementation/apply 阶段。

**Non-Goals:**

- 不重写 Codex runtime pool 架构或多引擎统一模型。
- 不依赖“增大 Warm TTL”作为 correctness 修复。
- 不要求用户通过 pin/warm 配置手动给长任务续命。
- 不新增独立的 incident storage；继续复用现有 runtime log、thread event、runtime pool snapshot。
- 不在本次设计中处理 provider 侧所有网络慢响应或非流式模型体验问题。

## Decisions

### Decision 1: Introduce a renewable active-work lease as the primary long-task protection contract

`RuntimeManager` 当前已经有 turn lease / stream lease 基础，但本 change 要把它提升为显式契约：

- 从 `turn/started` 到 `turn/completed` / `turn/error` 或等价终态到达前，runtime 必须持有 active-work lease；
- 只要 active turn 或 active stream 仍在进行，host 就必须自动续持这层保护，而不是退化成 `warm ttl` 语义；
- “长时间没有新的 stdout token” 不能自动等价为 idle，只要 turn/session 仍处于活动态，active-work protection 就必须持续有效。

这意味着长任务保活的依据是**任务活性**，不是用户有没有 pin，也不是 warm retention 时间有没有调大。

Alternatives considered:

- 仅靠 pin 或默认自动 pin：会把系统职责转嫁给用户或配置。
- 仅靠“有输出就续租、没输出就降级”：容易误杀 non-streaming 或 provider slow phase 的活跃任务。

### Decision 2: Treat active-work protection as the hard no-evict boundary

一旦 runtime 持有 active-work lease，下列路径都不得回收它：

- `reconcile_pool()` 的 warm/cold 冷却逻辑；
- budget overflow 下的淘汰选择；
- settings 变更后的 TTL/budget 收敛；
- 用户点击 release-to-cold 或等价 cooling 动作。

manual shutdown 仍允许结束 runtime，但它必须走显式 shutdown path，而不是和 idle eviction 混用。

Alternatives considered:

- 只做“尽量避免”而不是 hard rule：容易在后续实现中再次漂移。
- 用 pin 覆盖 active-work 保护：会把 retention policy 和 work lease 混为一谈。

### Decision 3: Separate active-work protection from idle retention in the runtime pool console

runtime pool console 需要把以下几类状态拆开表达：

- `active-work protected`
- `warm retained`
- `pinned retained`
- `manual shutdown` / `abnormal exit`

这样用户才能知道“这个实例为什么不会被杀”，也才能理解 warm/pin 的边界只是 idle retention，而不是任务保活按钮。

Alternatives considered:

- 只在文案中解释，不在 console 结构上区分：不利于定位和后续回归。

### Decision 4: Introduce a canonical `runtime/ended` event as the secondary recovery fallback

在 active-work protection 之外，`WorkspaceSession` 仍需要在 child process 结束、stdout EOF、initialize 之后的异常管道关闭等场景下，统一发出结构化 `runtime/ended` 事件，而不是仅依赖 `turn/error` 或 parse error 的旁路。

建议 payload 至少包含：

- `workspaceId`
- `engine`
- `reasonCode`：如 `process_exit`、`stdout_eof`、`stdin_write_failed`、`manual_shutdown`
- `exitCode` / `exitSignal`（如果可得）
- `affectedThreadIds`
- `affectedTurnIds`
- `pendingRequestCount`
- `hadActiveLease`
- `activeProtectionState`
- `message`

这样可以把“runtime 真死了”和“某个 turn 普通失败了”区分开，也可以让 UI 知道这次失败发生前 runtime 是否本该受 active-work protection。

Alternatives considered:

- 只在 stdout reader 结束时 silent cleanup：frontend 无法知道为什么 loading 要结束，诊断面太弱。
- 只合成 `turn/error`，不新增 runtime-level event：兼容简单，但会把 runtime exit 与普通 turn failure 混为一谈，console/runtime log 也缺少规范字段。

### Decision 5: Keep compatibility by mapping `runtime/ended` into existing thread teardown paths

frontend 不应该为了这个 change 大改 reducer 主干。更合理的做法是：

- `useAppServerEvents` 新增对 `runtime/ended` 的解析；
- 一方面触发一个显式的 runtime-ended callback，供 recovery UI / console 使用；
- 另一方面为受影响 thread 走现有的 `onTurnError` / processing teardown 兼容路径，使 reducer 继续通过已存在的 `markProcessing(false)` 语义收尾。

这条路径的核心目标是：**child exit 时，现有 UI 不需要等到一个永远不会到来的 `turn/completed`。**

Alternatives considered:

- 在 reducer 内直接处理一个全新 runtime-ended action，不复用 turn error teardown：语义更纯，但要改更多消费方。
- 仅靠 RuntimeReconnectCard 从 assistant 文本中猜 broken pipe：这只是后置 UI 兜底，不是事件契约。

### Decision 6: Fail pending requests and drain background callbacks on runtime end

除了 UI processing 收尾，runtime 失活时还必须处理 backend 内部状态：

- pending request 应得到统一可读错误，不继续悬挂；
- timed-out request grace path 不得把 late response 当成健康会话；
- background thread callback/channel 需要有序清理，避免遗留“隐藏线程仍在工作”的假象。

Alternatives considered:

- 只处理前台 active thread：实现更小，但后台线程、review、tool callbacks 会留下脏状态。

## Risks / Trade-offs

- [Risk] active-work lease 自动续持规则如果定义不严，可能把真正 idle 的 runtime 长时间留热。  
  Mitigation: 续持只绑定 active turn / active stream / pending request，不绑定单纯“最近活跃”。

- [Risk] `runtime/ended` 和现有 `turn/error` 可能双重通知，造成重复 recovery UI。  
  Mitigation: 使用 threadId + turnId + reasonCode 去重，明确 canonical ordering。

- [Risk] 某些退出场景无法准确拿到 threadId / turnId。  
  Mitigation: payload 允许 workspace-scoped degrade；frontend 至少要结束 active processing，并保留 last-good snapshot。

- [Risk] child exit watcher 与手动 shutdown/reconnect 竞态，可能误报异常退出。  
  Mitigation: 区分 `manual_shutdown` 与异常 reasonCode，并在 shutdown path 设置明确的 disposed/stopping marker。

- [Risk] 增加 event 类型后，shared session/native binding 路径可能漏处理。  
  Mitigation: `useAppServerEvents` 先做 additive routing，未命中的共享路径保持 no-op，不破坏既有事件。

- [Risk] runtime pool console 字段增加后，前后端 snapshot contract 可能漂移。  
  Mitigation: 同步更新类型与 contract tests，并维持兼容默认值。

## Migration Plan

1. 先补 delta specs，确认 `runtime/ended`、lease boundary、console diagnostics 的规范。
2. backend 先实现 active-work lease 自动续持、no-evict reconcile、runtime manager bookkeeping。
3. 再实现 child wait watcher、pending request settlement、runtime-ended fallback。
4. frontend 实现 `runtime/ended` 路由、processing teardown、RuntimeReconnectCard / console 适配。
5. 补齐 targeted Rust + Vitest tests。
6. 运行 `openspec validate --strict`、相关测试与类型检查后再进入 apply。

Rollback strategy:

- 若 backend event contract 有问题，可先保留 watcher 但关闭 frontend 消费，回退到现有 turn error 路径；
- 若前端新事件消费不稳定，可仅保留 backend diagnostic/logging，不影响现有 thread list/history 基线；
- 本 change 不涉及数据迁移，回滚主要是代码路径回退。

## Open Questions

- `runtime/ended` 是否需要按 workspace 一次性广播所有受影响 thread，还是只广播当前活跃 thread 列表即可？
- 对 background thread / hidden thread，是否要在 UI 明确展示“因 runtime 结束而中断”，还是只做 silent state cleanup？
- runtime log 是否需要专门记录 child exit 原因枚举，还是复用现有 error string + status 即可？
