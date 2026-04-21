## Why

实时对话中，最后一条用户提问是当前 turn 的上下文锚点；当幕布持续追加 reasoning/tool/assistant 片段时，它会继续被滚出视口，用户会失去“当前回答对应哪个问题”的定位。

本变更需要让最后一条用户提问在实时处理期间滚到顶部后固定常驻，并在对话结束或查看历史时恢复普通滚动，避免改变消息数据与历史回放语义。

## 目标与边界

- 在实时 processing 期间，仅固定当前 turn 的最后一条普通用户提问气泡。
- 固定行为只作用于展示层，不修改 message payload、copy 内容、history loader 或 runtime event。
- 对话结束、线程切换、历史恢复/查询时，固定行为自动失效。
- 保持现有 auto-follow、live middle steps collapse、anchor rail 与用户气泡格式保真能力可用。

## 非目标

- 不新增消息 pin/unpin 功能。
- 不改变 assistant、reasoning、tool card 的滚动策略。
- 不改变 Tauri command、storage schema 或后端 runtime contract。
- 不重构整套消息虚拟列表/窗口化策略。

## What Changes

- 为实时幕布新增“最后用户提问 sticky 展示态”。
- 当 `isThinking` 为真且当前视图不是 history restore 时，最后一条普通 user message wrapper 获得 sticky class。
- 当 processing 结束或历史会话被加载时，sticky class 移除，气泡恢复正常文档流滚动。
- 增加组件回归测试，覆盖实时、结束态、历史态与非最后用户消息。

## 技术方案对比

| 方案 | 做法 | 优点 | 风险/取舍 |
|---|---|---|---|
| A. CSS sticky + 条件 class | 在 `Messages.tsx` 为当前 turn 最后 user wrapper 加 class，CSS 使用 `position: sticky` | 改动小、无数据副作用、浏览器原生滚动语义稳定 | 需要确保 sticky 只在 `.messages` scroll container 内生效 |
| B. 复制一份 floating user bubble | 在顶部额外渲染一个 overlay 副本 | 可完全控制层级和视觉 | 容易造成 copy/accessibility/selection 双份 DOM，和原气泡状态漂移 |
| C. 改 auto-scroll 目标 | 实时滚动时让用户气泡保持在 viewport 某位置 | 能和滚动算法耦合控制 | 会干扰 auto-follow 与用户手动滚动，边界复杂 |

选择方案 A。它把行为限定在展示层，用最少状态表达“实时中的最后用户问题是当前 turn 锚点”，符合 YAGNI 和现有消息组件结构。

## Capabilities

### New Capabilities

- `conversation-live-user-bubble-pinning`: Defines the realtime canvas contract for pinning the latest user question bubble while a turn is processing.

### Modified Capabilities

- None.

## Impact

- Frontend component: `src/features/messages/components/Messages.tsx`
- Frontend style: `src/styles/messages.css`
- Tests: `src/features/messages/components/Messages.live-behavior.test.tsx`
- No backend/API/storage dependency changes.

## 验收标准

- 实时对话期间，最后一条普通用户提问滚到顶部后保持固定，不继续随内容流走。
- 实时对话中较早的用户提问不固定。
- 对话结束后，最后用户提问恢复正常滚动。
- 查询/恢复历史会话时，用户提问不进入 sticky 展示态。
- 复制用户消息仍使用原始展示文本逻辑，不因 sticky 行为改变。
