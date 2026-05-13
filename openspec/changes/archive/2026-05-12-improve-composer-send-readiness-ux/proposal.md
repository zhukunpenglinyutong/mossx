## Why

Composer 现在已经不是简单输入框，而是用户发送前的控制面。它同时承载 provider、model、collaboration mode、access mode、reasoning、skills、commands、manual memory、note cards、file references、images、context ledger、queue、request_user_input、rewind 与 completion email 等多类状态。

近期变更暴露出同一类体验债：

- 输入工具栏和工具弹出面板已经重构，但发送前“当前会发给谁、用什么模式、带什么上下文”仍不够清晰。
- 会话级技能选择、线程级选择、Linux IME、queued send、modeBlocked、resume-pending、request_user_input 都分别被修过，说明 Composer 状态解释分散。
- `Composer.tsx`、`ChatInputBox.tsx`、`ChatInputBoxAdapter.tsx` 已经是大组件；继续把 disabled reason、queue/fuse、request pointer、mode explanation 直接塞进去，会把体验优化变成新的稳定性债。

根因不是缺一个按钮，而是 Composer 缺少一个稳定的 Send Readiness contract：UI 各处都在局部推断 `canSend`、`canQueue`、`canStop`、当前 target、上下文摘要和阻塞原因。

> 🛠 **深度推演**：L2 根因是 Composer 同时承担输入编辑器、发送策略解释器、runtime 状态投影、context 摘要器四个角色。L3 原则是：输入区应该展示“发送意图快照”，而不是重新解释 runtime truth 或 conversation truth。Composer 的正确边界是 consumer：消费 Runtime Lifecycle 与 Conversation Fact Contract，形成用户可理解的 send readiness view model。

## 目标与边界

### 目标

- 建立 `ComposerSendReadiness` view model，集中表达 target、context summary、readiness、activity、disabled reason 与 primary action。
- 在输入区提供发送前可解释性 bar，展示 engine / model / mode / context summary。
- 统一 processing / waiting / ingress / queued / fusing / blocked / awaitingUserInput 等状态的用户表达。
- 为 `request_user_input` 提供 Composer 轻提示或 pointer，但不替代消息幕布里的主交互卡片。
- 给 `Composer.tsx`、`ChatInputBox.tsx`、`ChatInputBoxAdapter.tsx`、`ButtonArea.tsx`、`ContextBar.tsx` 设置瘦身护栏，新增业务判断优先进入 view model / selectors / summary helpers。
- 补齐 focused tests，覆盖 Claude / Codex、queue/fuse、request_user_input、IME、slash command、file reference 与 narrow layout。

### 边界

- 不改 P0 change 目录。
- 不修改 OpenSpec 主 specs。
- 实现范围限定在 Composer send-readiness view model、轻量 readiness header、queue/fuse/request pointer 表达、CSS 校准与 focused tests。
- 不改变 runtime lifecycle、thread recovery、conversation fact classification 的 source of truth。
- 不新增 Claude / Codex 权限能力。
- 不重做 rich text editor、IME、file tag、slash command 的底层输入能力。
- 不引入新依赖。
- 不把 request_user_input 表单搬进 Composer；Composer 只做轻提示和定位入口。

## What Changes

### Composer Send Readiness ViewModel

新增或等价抽象一个纯 view model 层，集中计算发送前状态：

```text
ComposerSendReadiness
  target: engine / provider / model / agent / collaborationMode / accessMode
  context: skills / commands / manualMemory / noteCards / fileRefs / images / annotations
  readiness: canSend / canQueue / canStop / disabledReason / primaryAction
  activity: idle / processing / waiting / ingress / queued / fusing / blocked / awaitingUserInput
  explainability: shortLabel / detailLabel / tooltipKey / severity
```

该 view model 只消费现有 state 和 P0 契约结果，不自己发起 runtime recovery，不自己判定 transcript truth。

### 发送前可解释性 Bar

输入区附近显示稳定的发送前摘要：

- 当前发送目标：例如 `Codex · GPT-5 · Plan`、`Claude · Sonnet · Default`。
- 当前上下文摘要：例如 `2 skills · 1 note · 3 files · 1 image`。
- 当前模式影响：例如 `Plan mode: 不会写文件`、`Full access: 可直接修改 workspace`。
- 当前不可发送原因：例如 `等待 Claude 选择回复`、`runtime 正在恢复`、`当前请求已阻塞，需要切换模式`。

这个 bar 是解释层，不是新的控制中心。它不得替代现有 selector、context bar 或 request card。

### 输入活动状态统一

Composer 需要把当前输入状态表达成可理解的 activity：

| Activity | 含义 | 主动作 |
|---|---|---|
| `idle` | 可正常发送 | Send |
| `processing` | 当前 turn 正在执行 | Stop 或 Queue |
| `waiting` | 已发送但 engine 暂无输出 | Stop |
| `ingress` | 回复正在流式进入 | Stop 或 Queue |
| `queued` | 用户消息已排队 | View queue / cancel |
| `fusing` | 正在尝试融合 queued message | Wait / cancel if supported |
| `blocked` | runtime、mode 或配置阻止发送 | Follow action |
| `awaitingUserInput` | agent 正在等待用户选择 | Jump to request |

### request_user_input Composer 轻提示

Composer 只做轻提示：

- active request 显示“等待你的选择”，提供跳转到幕布卡片。
- submitted / timeout / dismissed / cancelled / stale 都不得继续阻塞输入。
- stale 或已完成 request 可以显示短暂 settled 状态，但主交互仍归 message surface。
- 如果 request 被 modeBlocked，Composer 显示可行动建议，但不把 modeBlocked 混入普通发送状态。

### 大组件瘦身护栏

新增派生逻辑必须优先进入：

- `viewModel`
- `selectors`
- `summary`
- `readiness`
- focused pure helpers

`Composer.tsx`、`ChatInputBox.tsx`、`ChatInputBoxAdapter.tsx`、`ButtonArea.tsx`、`ContextBar.tsx` 不应继续吸收大段业务判断。UI 组件只消费 view model 输出并渲染。

## Capabilities

### New Capabilities

- `composer-send-readiness-ux`: 定义发送前可解释性、send readiness view model、target/context summary、disabled reason 与 request_user_input 轻提示。
- `composer-queue-input-state`: 定义 processing / waiting / ingress / queued / fusing / blocked / awaitingUserInput 等输入活动状态与 queue/fuse 用户表达。

### Modified Capabilities

- 无。本 change 只新增 change-local delta specs，不修改主 specs。

## 验收标准

- 用户发送前可以看到当前 engine、model、mode、关键上下文摘要。
- 当输入区不可发送时，必须显示可理解原因，而不是只有 disabled button。
- 当前 turn 处理中再次输入时，用户能区分“会排队”“可融合”“正在融合”“不能融合”。
- `request_user_input` active 时 Composer 有轻提示；settled request 不阻塞输入。
- `modeBlocked`、resume pending、request_user_input blocked 的提示不互相覆盖。
- 新增业务判断不直接堆进大组件；派生逻辑有 pure helper 或 view model tests。
- 现有 IME、slash command、file reference、prompt history、queued send 测试不回退。

## Impact

主要影响面：

- `src/features/composer/components/Composer.tsx`
- `src/features/composer/components/ChatInputBox/ChatInputBox.tsx`
- `src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`
- `src/features/composer/components/ChatInputBox/ButtonArea.tsx`
- `src/features/composer/components/ChatInputBox/ContextBar.tsx`
- `src/features/composer/components/ChatInputBox/MessageQueue.tsx`
- `src/features/threads/hooks/useQueuedSend.ts`
- `src/features/threads/hooks/useThreadUserInput.ts`
- `src/features/threads/hooks/useThreadUserInputEvents.ts`
- `src/features/threads/hooks/useThreadMessaging.ts`
- `src/features/threads/hooks/useThreadMessagingSessionTooling.ts`

用户影响：

- 高感知：输入区每天使用，状态解释会立即被感知。
- 中风险：如果 `canSend / canQueue / disabledReason` 推导错误，会影响发送和排队。
- 高收益：减少误发、模式错发、重复发送、等待中困惑。

## 风险与回滚

### 风险

- view model 与 runtime truth 不一致，会制造新的“解释错误”。
- 过度聚合 view model 可能变成新的 god object。
- UI 提示过多会压缩输入空间，尤其是窄屏。
- request_user_input 如果 Composer 和 Messages 双方都强提示，可能重复打扰用户。
- queue/fuse 文案如果超过真实能力，会给用户错误承诺。

### 回滚

- 首阶段只新增派生 view model 和轻量展示，不删除旧发送路径。
- 新提示用 feature-local 组件包裹，必要时可隐藏。
- queue/fuse 业务逻辑不迁移，只迁移展示解释，避免破坏发送链路。
- request_user_input 表单仍留在幕布，Composer 只做 pointer。
- 若 readiness 推导异常，回退为旧 disabled button + 原 MessageQueue 展示。
