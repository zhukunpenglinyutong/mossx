## Context

Claude Code 子 agent 并行执行时，当前体验的核心断点在于“子 agent 不是可导航的 session 实体”。父会话可以通过实时幕布看到一些 agent output，完成后也可能把 agent session block 回灌到历史幕布，但用户无法在运行中进入某个子 agent 的完整对话，也无法在左侧 session 列表理解父子关系。

已有规范中，`workspace-session-catalog-projection` 负责共享会话 membership 与 scope，`workspace-session-radar-overview` 已定义直接导航到目标 session，`conversation-curtain-normalization-core` 负责 realtime/history 的语义收敛。这次设计应复用这些边界：不新造独立 session store，而是在共享 projection 上增加 parent-child relationship，并让 sidebar 与 curtain 消费同一份关系事实。

## Goals / Non-Goals

**Goals:**
- 将 Claude Code 子 agent 表达为 parent session 下的 first-class child session。
- sidebar 支持父子树形结构，运行中和历史状态都可读。
- session folder projection 与父子树保持一致：父 session 移动 folder 时，child sessions 默认跟随父级。
- parent curtain 在运行中展示 subagent cards，并支持点击跳转 child conversation。
- 子 agent 完成后保留结构化引用，不把完整 child transcript 混进 parent transcript。
- relationship projection 具备确定性去重、排序与 degraded marker。

**Non-Goals:**
- 不重构全量 session catalog、folder tree 或 archive 规则。
- 不把所有 engine 都升级成通用 multi-agent runtime。
- 不改变 fork/resume/session deletion 等既有能力。
- 不引入复杂的独立 child folder 策略；第一期只支持 parent folder 继承与显式 child assignment override。
- 不要求第一期支持复杂多层 agent nesting；若出现嵌套，先按当前 parent-child 一层关系展示。

## Architecture

### Data model

新增一个轻量关系投影，而不是让 UI 各自解析 transcript：

```ts
type SubagentSessionRelationship = {
  workspaceId: string;
  parentSessionId: string;
  childSessionId: string;
  spawnedByToolCallId: string | null;
  agentName: string | null;
  agentRole: string | null;
  status: "queued" | "running" | "completed" | "failed" | "unknown";
  updatedAt: number;
  jumpTarget: SessionActivityJumpTarget | null;
  degradedReason?: "transcript-unavailable" | "identity-pending" | "source-partial";
};
```

字段原则是“少而硬”：relationship 必须能回答 parent 是谁、child 是谁、为何产生、现在能否跳转。不要把完整 transcript、prompt、tool output 放入这个对象，避免 catalog projection 膨胀。

### Source of truth

relationship 的事实源应来自 runtime event / structured history 中的 agent spawn、agent progress、agent completion 信号。history hydrate 只能补齐缺失 metadata 或完成态，不应该覆盖更新鲜的 runtime progress。排序优先使用 spawn order；没有 spawn order 时用 `updatedAt + childSessionId` 做稳定排序。

### Parent turn settlement

父会话的 processing lifecycle 与 child relationship projection 相关，但不能被同一套状态无限期绑死。对 Codex collaboration child-agent 流，`final assistant message` 与 `turn/completed` 同时存在时，应视为 parent turn 已具备可结算证据。此时残留的 `collabAgentToolCall`、`Collab: wait` 或 `running` child status 只能进入 diagnostic 的 `remainingBlockers`，不得继续阻止 `markProcessing(false)` 与 `activeTurnId=null`。

反向保护仍然保留：如果只有 `turn/completed`，但尚未看到 final assistant completion，且还有 running child-agent blocker，则可以 defer parent completion，直到 child terminal update 或 assistant completion 到达。这样同时覆盖两类 race：避免子 agent 未结束时过早 stopped，也避免 assistant 已经总结完成后 UI 卡在 loading。

### UI surfaces

Sidebar 消费 session catalog projection，将 child sessions 缩进显示在 parent session 下。child row 点击后激活 child conversation，不等价于打开 parent。

Conversation curtain 在 parent session 中展示 subagent cards。卡片是 activity/reference surface，不是 assistant text bubble。它可以显示 agent 名称/角色、状态、最近活动摘要、更新时间与 disabled reason。可用 `jumpTarget` 时，点击直接进入 child conversation。

### Folder projection

Session folder membership 仍以 catalog metadata 中的 folder assignment 为持久化事实源，但 sidebar folder projection 必须消费同一份 session tree row depth。规则如下：

- 若 session 有显式 folder assignment，优先使用该 assignment。
- 若 child session 没有显式 folder assignment，则继承最近 parent session 的有效 folder。
- 若 child session 被显式移动到 project root，则该 root assignment 优先，不能继续继承 parent folder。
- 父 session 执行 move-to-folder 时，应对当前已稳定的 child subtree 批量写入相同 folder assignment，避免刷新后父子分离。
- Pending child identity 尚未稳定时，不强行写入 catalog；UI 通过 parent folder 继承保持即时一致，待 identity 稳定后再由 pending intent 或下一次 assignment 收敛。

## Decisions

### Decision 1: relationship 属于 session projection，不属于 curtain 局部状态

Rationale:
- sidebar、curtain、radar 都需要同一份 parent-child truth。
- 如果 curtain 自己解析 transcript，sidebar 仍然不知道树形关系，问题只会从“不可见”变成“多套状态不一致”。
- projection 层可以统一处理去重、排序、degraded marker。

Alternatives considered:
- 只在 parent curtain 内展示 agent output 卡片。拒绝：无法解决左侧 session 树和跳转后的会话归属。
- 在 sidebar 内通过标题或历史文本猜测子 agent。拒绝：脆弱且不可验证。

### Decision 2: child transcript 与 parent transcript 保持分离

Rationale:
- 子 agent 是独立执行单元，完整 transcript 应在 child conversation 中查看。
- parent curtain 应展示引用、状态和摘要，不应把完整 child output 回灌成普通 assistant 正文。
- 这样可以避免 history hydrate 后重复渲染 agent session block。

Alternatives considered:
- 完成后把 child transcript 展开到 parent 下。拒绝：短期看起来方便，长期会污染父会话语义和去重逻辑。

### Decision 3: navigation 复用现有 session jump target

Rationale:
- `workspace-session-radar-overview` 已经定义从条目跳转到目标 workspace/thread 的契约。
- subagent card 只需要提供稳定 `jumpTarget`，不需要新建导航系统。
- 缺失 target 时使用 disabled + reason，比静默失败更可诊断。

Alternatives considered:
- 子 agent 卡片点击后只滚动到 parent 内的某个 block。拒绝：用户要的是进入子 agent 对话，不是定位引用文本。

### Decision 4: folder follow 属于 session tree projection，而不是独立 folder tree 规则

Rationale:
- 用户移动 parent session 时，视觉上是在移动一个 agent tree；如果 child 留在 root 或旧 folder，会破坏父子关系的可理解性。
- folder projection 已经消费 sidebar row tree，天然可以基于 `depth` 与 parent chain 推导 inherited folder。
- 通过“显式 child assignment 优先，缺省时继承 parent”的规则，可以同时支持默认跟随和用户后续单独整理 child session。

Alternatives considered:
- 只移动 parent session，不处理 child。拒绝：会把一个逻辑 agent tree 拆散到多个 folder。
- 强制所有 child 永远跟随 parent，禁止 child override。拒绝：用户可能需要把某个重要 child session 单独归档或移到 root。
- 只在 UI 上继承，不批量持久化稳定 child sessions。拒绝：刷新或重新加载后容易出现 folder membership 回退。

### Decision 5: final assistant completion 是 parent turn 结算的强证据

Rationale:
- child-agent tool row status 可能因 runtime event 顺序、wait row 残留或 status snapshot 未及时 terminal 化而滞后。
- final assistant message 已经出现且 `turn/completed` 已到达时，继续用残留 child blocker 卡住 parent loading，会比原始问题更严重。
- 保留 `remainingBlockers` diagnostic 可以继续观察异常顺序，而不牺牲用户侧主会话结束状态。

Alternatives considered:
- 必须等待所有 child blocker terminal 才结算 parent。拒绝：实测会在 child 已结束、parent 已总结时仍卡 loading。
- 只要 `turn/completed` 到达就立即结算。拒绝：会回到子 agent 仍在运行时主会话过早 stopped 的问题。
- 用固定 timeout 释放 loading。拒绝：timeout 难以覆盖不同机器和模型延迟，且诊断价值低于 final assistant evidence。

## Data Flow

1. Claude Code parent session 运行，runtime 产生 agent spawn/progress/completion event。
2. 事件归一化层提取 parent session、child session、tool call、agent name/role/status。
3. session relationship projection 按 stable identity 去重并更新 `updatedAt`、`status`、`jumpTarget`。
4. Sidebar 从 projection 渲染 parent-child tree。
5. Parent curtain 从同一 projection 渲染 subagent cards。
6. 用户点击 card 或 child row，navigation 激活 child conversation。
7. Child session 继续从自己的 transcript / realtime source 渲染完整对话。
8. Parent session 只保留 card/reference，不吞并 child transcript。
9. 用户移动 parent session 到 folder 时，sidebar 收集当前 parent subtree，对已稳定 child sessions 批量写入相同 folder assignment；pending child rows 通过 folder projection 继承 parent folder。
10. Folder projection 渲染时按显式 assignment 优先、parent folder 继承兜底的顺序决定 row 所属 folder。
11. Codex parent turn settlement 监听 final assistant completion 与 `turn/completed` 两类事件；两者都已出现时，即使仍存在 remaining child blockers，也结算 parent processing state。
12. 若 `turn/completed` 先到且没有 final assistant evidence，Codex parent completion 可被 child blocker defer；后续 child terminal update 或 assistant completion 触发 flush。

## Error Handling

- child transcript 尚不可读：保留 child relationship，card/row 标记 `transcript-unavailable`，点击态禁用或进入 loading fallback。
- child identity 尚未稳定：使用 `spawnedByToolCallId` 建立 pending identity，后续拿到 `childSessionId` 后归并，不新增重复 row。
- pending child 尚无稳定 session id：folder move 不写 catalog，避免创建无法解析的 folder assignment；UI 通过 parent folder inheritance 保持跟随展示。
- child 有显式 root / folder assignment：folder projection 不覆盖该显式选择，避免 parent folder inheritance 吞掉用户整理结果。
- out-of-order event：以 source freshness 和 event timestamp 防止状态倒退。
- Codex event order out-of-order：`assistant-completed -> turn/completed` 和 `turn/completed -> assistant-completed` 都必须最终结算 parent；只有缺少 assistant completion 且 child blocker 仍 running 时才允许 defer。
- 残留 child blocker：final assistant completion 已出现时，残留 blocker 只能作为 `remainingBlockers` diagnostic，不能继续影响 parent loading state。
- relationship source partial：projection summary 暴露 degraded marker，UI 展示“部分子 agent 信息可能不完整”。

## Testing Strategy

- Projection unit tests：同一 child 的 spawn/progress/history hydrate 收敛成一个 relationship。
- Sidebar tests：parent row 下展示 child rows，child click 激活 child session。
- Folder projection tests：child 无显式 folder 时继承 parent folder；child 显式 root / 其他 folder 时不被 parent folder 覆盖。
- Folder move tests：parent session move-to-folder 会批量更新已稳定 child subtree，pending child 不强行写入 catalog。
- Curtain tests：running child 显示 card，progress 更新同一卡片，completed 后不追加完整 child transcript。
- Navigation tests：可用 jump target 进入 child conversation；缺失 target 显示 disabled reason。
- Parent settlement tests：覆盖 Codex child-agent blocker 下 `turn/completed -> assistant-completed` flush、`assistant-completed -> turn/completed` bypass、running blocker remaining diagnostic，以及没有 assistant completion 时继续 defer。
- Regression tests：非 Claude provider 不展示伪造 child tree；workspace scope 不因 child relationship 被扩大。

## Rollback Strategy

- 若 relationship extraction 不稳定，先关闭 sidebar tree 与 curtain card 的入口，保留现有 parent session 展示。
- 若 folder follow 造成误归类，关闭 parent move 的 child batch assignment，仅保留显式 child assignment 与 root projection；不影响 session navigation。
- 若 navigation target 不稳定，只禁用 card click，仍展示只读 subagent status。
- 不回退或改写既有 session catalog membership、fork/resume 或非 Claude provider 行为。
