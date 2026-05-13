## Context

Composer 处在用户意图进入系统的最后一厘米。它必须把复杂状态压缩成用户能理解的发送快照，但不能成为 runtime lifecycle、conversation transcript 或 provider permission 的第二事实源。

当前输入区相关代码已经被拆成多个组件和 hooks，但职责仍有明显交叠：

- `Composer.tsx` 负责 orchestration、context、状态面板、rewind、submit glue。
- `ChatInputBox.tsx` 负责 rich text editor、布局、输入行为和多个 controls。
- `ChatInputBoxAdapter.tsx` 负责把外部线程状态映射给输入框。
- `ButtonArea.tsx`、`ContextBar.tsx`、`MessageQueue.tsx` 各自显示部分状态。
- `useQueuedSend.ts` 和 `useThreadMessaging.ts` 持有 queue / fuse / send truth。

本 change 的设计目标是新增一层可测试的 view model：

```text
runtime/thread/composer raw state
  -> ComposerSendReadiness view model
  -> small presentation components
```

## Goals

- 建立 `ComposerSendReadiness` 的类型边界和纯计算入口。
- 让发送前摘要稳定展示 engine / model / mode / context summary。
- 让 activity state 统一解释 processing / waiting / ingress / queued / fusing / blocked / awaitingUserInput。
- 让 request_user_input 在 Composer 中只表现为 pointer，不迁移主交互。
- 抑制大组件继续膨胀。
- 以 focused tests 驱动，而不是先做视觉大改。

## Non-Goals

- 不改 runtime recovery 规则。
- 不改 conversation fact classification。
- 不改 provider stream payload。
- 不改底层 queue/fuse 业务算法。
- 不重写 `ChatInputBox` rich text editor。
- 不引入新状态管理库或新依赖。

## Architecture

### 1. Send Readiness ViewModel

建议新增纯函数或轻量 hook：

```text
buildComposerSendReadiness(input) -> ComposerSendReadiness
```

输入只包含已存在 truth：

- selected engine / provider / model / reasoning / collaboration mode / access mode。
- context ledger、skills、commands、manual memory、note cards、file refs、images。
- thread processing state、stream activity phase、queued send state、runtime recovery summary。
- active request_user_input state。
- modeBlocked / resume pending / config loading state。

输出：

```text
target:
  engine
  providerLabel
  modelLabel
  modeLabel
  accessModeLabel?

contextSummary:
  chips[]
  compactLabel
  detailLabel

readiness:
  canSend
  canQueue
  canStop
  disabledReason?
  primaryAction
  secondaryAction?

activity:
  kind
  severity
  shortLabel
  detailLabel
  actionHint?
```

### 2. Source Of Truth Boundaries

Composer view model 只能消费其它层结果：

- Runtime Lifecycle 提供 runtime 是否 recovering / quarantined / ended / retryable。
- Conversation Fact Contract 提供 request_user_input 是否 pending / settled。
- Queue hooks 提供 queued / fusing / fusion timeout / canQueue 等真实状态。
- Composer 本地只负责当前 draft、attachments、context selections。

它不得：

- 自己发起 recover。
- 自己判断 stale thread rebind。
- 自己解析 provider raw payload。
- 自己把 request_user_input settle。

### 3. Explanation Bar

建议新增 `ComposerReadinessBar` 或等价 presentation component。它消费 view model，不直接读 thread/runtime hooks。

显示策略：

- 正常状态：一行紧凑 summary，避免压缩输入空间。
- 阻塞状态：突出 disabled reason 和下一步动作。
- 窄屏：折叠为 target pill + activity pill，detail 进入 tooltip / popover。
- 高风险模式：`full-access` 等只做明确提示，不重复弹窗。

### 4. Queue / Fuse State Projection

queue/fuse 业务仍归 `useQueuedSend` 等现有 hooks。Composer 只展示投影：

```text
processing -> current turn running
waiting -> request accepted but no stream yet
ingress -> stream is entering
queued -> draft or sent follow-up queued
fusing -> queued message is being fused into active turn
blocked -> current mode/runtime/config prevents send
awaitingUserInput -> active request_user_input pending
```

投影必须保守：如果不能确定是否可融合，不得显示“正在融合”或“可融合”，只能显示 queued / cannot fuse / waiting。

### 5. request_user_input Pointer

Composer 的 request pointer 不承载表单，只提供：

- 当前 request 的短标题。
- 状态：pending / submitted / timeout / dismissed / cancelled / stale。
- 跳转或聚焦消息卡片动作。
- settled request 的短暂说明。

表单、提交、dismiss、timeout 仍归 conversation surface 和 request lifecycle。

### 6. Large Component Guardrail

实现阶段应遵守：

- 新增复杂派生逻辑必须进入 `viewModel` / `selectors` / `summary` 文件。
- 大组件内新增业务判断应保持小而直接，只连接 props 和 render。
- focused tests 优先测 pure helpers，再测 UI。
- 不把 `ComposerReadinessBar` 做成新 god component；它只渲染 view model。

## Decisions

### Decision 1: view model 优先，而不是先做 UI polish

**Decision**

先定义 `ComposerSendReadiness` contract，再接 UI。

**Why**

Composer 的问题不是“不够漂亮”，而是解释口径不统一。先做 UI 会把状态判断继续散落。

### Decision 2: request_user_input 不迁入 Composer

**Decision**

Composer 只做轻提示和跳转，主卡片仍在 message surface。

**Why**

request_user_input 是 conversation fact，不是 draft input。把表单搬进 Composer 会制造两个交互事实源。

### Decision 3: queue/fuse 只投影，不迁移业务逻辑

**Decision**

本 change 不移动 queue/fuse 核心算法，只将其状态映射成用户可理解的 activity。

**Why**

降低 blast radius。queue/fuse 影响发送链路，体验整理不应顺手重写业务。

## Rollout Plan

1. 定义 `ComposerSendReadiness` 类型、输入、输出和 priority rules。
2. 实现 pure view model helper，补 unit tests。
3. 接入发送前 summary bar，先覆盖 engine / model / mode / context summary。
4. 接入 activity projection，覆盖 processing / waiting / ingress / queued / fusing / blocked / awaitingUserInput。
5. 接入 request_user_input pointer，确认 settled request 不阻塞输入。
6. 给大组件新增 guardrail tests 或 review checklist。
7. 执行 focused regression tests。

## Validation

Focused tests 应覆盖：

- Claude Plan / Default、Codex Plan / Code 的 target summary。
- context summary：skills、note cards、file refs、images、manual memory。
- disabled reason：runtime recovering、modeBlocked、config loading、awaitingUserInput。
- queue/fuse：queued、fusing、cannot fuse、fusion timeout。
- request_user_input：pending pointer、submitted、timeout、dismissed、cancelled、stale。
- IME、slash command、file reference、prompt history 不回退。
- narrow layout 下 explanation bar 折叠。

## Risks / Trade-offs

- view model 太宽会成为新 god object，所以第一阶段只覆盖发送解释，不承载业务 mutation。
- 过多 chips 会打扰输入，所以默认 compact，detail 按需展开。
- 如果 P0 lifecycle / fact contract 还未完全实现，Composer 需要兼容 legacy input state，并保守展示 unknown / loading，而不是猜测。

## Rollback

- 隐藏 `ComposerReadinessBar`，保留 view model tests。
- 回退 activity projection 到旧 MessageQueue / disabled button。
- request pointer 可单独关闭，不影响 request card。
- 所有发送、排队、停止业务仍走旧路径，因此回滚不需要迁移数据。
