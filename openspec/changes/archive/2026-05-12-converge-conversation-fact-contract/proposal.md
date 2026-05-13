## Why

当前 mossx 的 conversation surface 已经不是单纯的消息列表。它同时承载 Claude / Codex / Gemini / OpenCode 的 realtime stream、history restore、approval、request_user_input、modeBlocked、compaction、plan、file changes、queued follow-up、project memory、note card 与 agent prompt 等多类事件。

近期修复集中暴露出同一类系统债：

- realtime 正常但 reopen history 后 row 数量或文本形态变化。
- user bubble 因 queued handoff、shared session、project memory wrapper 或 note card injected context 重复显示。
- assistant 正文被 stream delta、completed snapshot、history hydrate 重复拼接。
- synthetic approval marker、No response requested、permission mode、resume bookkeeping 等 control-plane 文本污染普通聊天流。
- request_user_input 的 submitted、timeout、dismissed、stale 状态没有形成统一 lifecycle，容易阻塞当前对话。
- `Messages.tsx` / `MessagesRows.tsx` 承担过多 provider payload 判断，render layer 继续膨胀。

根因不是某个 renderer 太大，而是 realtime、history、control-plane、presentation 四种事实混在同一层补丁化。正确方向是建立稳定的 Conversation Fact Contract：幕布只消费 normalized conversation facts，provider 原始 payload 必须先被分类、过滤、格式化或隐藏。

> 🛠 **深度推演**：L2 根因是 message identity、control event identity 与 presentation state 没有分层；L3 原则是 AI 客户端的 transcript 是事实账本，不是 provider payload dump。任何会被用户当作“对话历史”的内容，都必须先通过事实契约治理。

## 目标与边界

### 目标

- 定义 conversation fact 分类：`dialogue`、`reasoning`、`tool`、`control-event`、`hidden-control-plane`、`presentation-state`。
- 收敛 realtime / history parity：同一 turn 在 stream、completed snapshot、history hydrate 三条路径下 visible rows 与核心文本语义稳定。
- 收敛 message text normalization：user / assistant / reasoning 的 wrapper stripping、dedupe、canonical comparison 进入共享 helper。
- 收敛 control-plane filtering：synthetic approval resume、No response requested、permission-mode、project memory wrapper、agent prompt、queue bookkeeping 等不得作为普通聊天气泡出现。
- 明确 request_user_input lifecycle：pending、submitted、timeout、dismissed、cancelled、stale 都必须 settle，不阻塞后续对话。
- 明确 Messages render boundary：render layer 消费 normalized facts，不继续直接推断 provider 原始 payload 语义。

### 边界

- 实现范围限定在 feature-local contract/helper、assembler integration、Composer request pointer consumption 与 focused tests。
- 不修改主 specs；本 change 只提供 delta specs，主 specs 同步留给归档流程。
- 不重做整套视觉设计。
- 不改变 Tauri command、Rust storage schema 或 provider runtime payload。
- 不一次性重构所有 reducer action。
- 不把 Claude Code approval rollout、Codex launch config 或 runtime session lifecycle 的权限/启动语义迁入本 change。
- 不要求一次性覆盖所有 legacy provider payload；未知 payload 可保留 legacy-safe fallback，但必须有分类证据和测试路径。

## What Changes

### Conversation Fact Contract

所有进入 conversation curtain 的内容必须先归类为可治理 fact：

| 类型 | 用途 | 示例 | 渲染策略 |
|---|---|---|---|
| `dialogue` | 用户/助手真实对话 | user message、assistant answer | 普通气泡 |
| `reasoning` | 模型思考/摘要 | Claude thinking、Codex reasoning、Gemini summary | reasoning row |
| `tool` | 工具执行事实 | command、file changes、browser/tool result | tool card |
| `control-event` | 用户可理解控制事件 | resume failed、modeBlocked、interrupted、model switched | compact status row |
| `hidden-control-plane` | 内部控制面 | synthetic approval marker、No response requested、permission-mode wrapper、queue bookkeeping | 不进入 visible transcript |
| `presentation-state` | 纯展示状态 | history loading、live placeholder、scroll/sticky state | 不进入 durable transcript |

### Realtime / History Parity

- realtime delta、completed snapshot、history hydrate 对等价语义不得产生额外 visible row。
- completed snapshot 只能 canonicalize metadata、status、ids 或 structured facts，不得重复追加主体文本。
- history reconcile 只能 validation / backfill，不得成为 primary duplicate repair。
- queued follow-up 的 optimistic user bubble 与 authoritative user item 必须收敛为同一条可见 user bubble。

### Message Text Normalization

- user text 必须剥离 project memory、mode fallback、shared session sync wrapper、agent prompt、note card injected context，只保留用户实际可见意图。
- assistant text 必须剥离 Claude approval resume marker、No response requested、near duplicate paragraph、fragmented line/paragraph artifact。
- reasoning text 必须使用同一 identity 和 merge 规则处理 realtime summary、content、history snapshot。
- Markdown streaming 的 inline code、fenced code、long Markdown 稳定化属于 presentation profile，不应由 provider-specific payload patch 直接决定事实语义。

### Control-Plane Filtering

- 纯内部控制面默认隐藏。
- 用户可理解控制事件转成 compact status row。
- `modeBlocked` 必须作为诊断 fact 出现，而不是混入 assistant 正文。
- stale 或已完成的 request_user_input 不得继续阻塞 Composer 或 conversation turn。

### Messages Render Boundary

- `ConversationAssembler` / normalization layer 负责事实归一、去重、realtime/history parity。
- `Messages.tsx` 负责窗口、滚动、sticky、approval/input request slot、live controls。
- `MessagesRows.tsx` 只按 normalized item 类型渲染 row。
- tool blocks 只处理 tool presentation，不负责从 raw provider payload 推断消息事实。

## Capabilities

### New Capabilities

- `conversation-fact-contract`: 定义 conversation fact 分类、normalization、control-plane filtering、request_user_input lifecycle 与 render boundary。
- `conversation-realtime-history-parity`: 定义 realtime stream、completed settlement、history hydrate/reconcile 的可见 transcript 一致性门禁。

### Modified Capabilities

- 无。本 change 只新增 change-local delta specs，不修改主 specs。

## 验收标准

- 同一 Claude / Codex turn 在实时输出、完成快照、重新打开历史后，visible row 数量和主要文本一致。
- queued follow-up、shared session、note card、project memory 注入后，用户实际提问只显示一次。
- stream delta、completed item、history hydrate 对等价 assistant 输出不产生重复正文。
- synthetic approval resume、No response requested、permission-mode、file-history-snapshot、queue bookkeeping 不作为普通聊天气泡出现。
- resume failed、model switch、interrupted、modeBlocked 等以 compact control row 表达。
- request_user_input 的 pending、submitted、timeout、dismissed、cancelled、stale 都能 settle；过期卡片可关闭且不阻断新对话。
- legacy 或异常 tool payload 不得导致整条 conversation render 崩溃。
- `Messages.tsx` / `MessagesRows.tsx` 新增行为必须消费 normalized facts，不新增 provider raw payload 分支。

## Impact

主要影响面：

- `src/features/threads/assembly/conversationAssembler.ts`
- `src/features/threads/assembly/conversationNormalization.ts`
- `src/features/threads/contracts/realtimeHistoryParity.test.ts`
- `src/features/threads/adapters/*RealtimeAdapter.ts`
- `src/features/threads/loaders/*HistoryLoader.ts`
- `src/features/threads/hooks/useThreadsReducer.ts`
- `src/features/threads/hooks/threadReducerTextMerge.ts`
- `src/features/threads/hooks/useThreadMessaging.ts`
- `src/features/threads/hooks/useThreadUserInput.ts`
- `src/utils/threadItems.ts`
- `src/utils/threadItemsAssistantText.ts`
- `src/utils/threadItemsFileChanges.ts`
- `src/features/messages/components/Messages.tsx`
- `src/features/messages/components/MessagesRows.tsx`
- `src/features/messages/presentation/presentationProfile.ts`
- `src/features/messages/utils/groupToolItems.ts`

关联任务可映射：

- `split-thread-items-assistant-text-normalization`
- `split-thread-messaging-session-tooling`
- `fix-codex-queued-user-bubble-gap`
- `show-codex-history-loading-state`
- `fix-ask-user-question-timeout-settlement`
- `fix-live-inline-code-markdown-rendering`
- `fix-codex-compaction-status-copy`

## 风险与回滚

- 过滤规则过宽可能误删真实用户消息或 assistant 正文。应通过 fixture tests 覆盖真实样本、自然语言误伤、Windows path / CRLF。
- 去重规则过强可能合并不同 turn 的相似内容。等价判断必须包含 turn identity、item identity 或明确 source confidence。
- parity gate 接入过猛可能影响多引擎 history restore。应先覆盖 Claude / Codex 高价值路径，再扩展 Gemini / OpenCode。
- render boundary 调整可能引发滚动、sticky、live auto-follow 回归。presentation profile 变更必须保留旧渲染 fallback。
- control event 分类不完整时，未知 payload 默认保留 legacy-safe item，并记录 debug evidence，避免 silent data loss。
