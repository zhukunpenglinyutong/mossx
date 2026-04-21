## Context

`Messages.tsx` 当前已经支持 realtime 场景下“仅最后一条 ordinary user question sticky”的展示逻辑，用于在 active turn 持续 streaming 时固定当前问题锚点。历史浏览的阅读模式不同：用户会沿着已经完成的多轮问答上下滚动，当前视口里的 assistant/reasoning/tool 内容通常属于某一条更早的用户问题，但这条问题会随着继续滚动离开顶部，导致阅读分段失去标题。

消息幕布本身是一个 `.messages` scroll container，但真实消息行里可能包含很长的 user prompt、memory summary 或 references 卡片。把整块 user wrapper 直接做 sticky 会在历史回放里产生遮挡和重叠，尤其是长消息或带文件引用时。因此历史模式需要“section header 语义”，但不应直接复用整块 user bubble 本体。

本变更仍然是 frontend-only，不应影响 runtime command、history loader、message payload、copy text、storage schema 或 event contract。

## Goals / Non-Goals

**Goals:**

- 在历史浏览中，将 ordinary user question 作为 section header 参与顶部 sticky。
- sticky 切换严格跟随滚动位置，不做提前预测。
- 向下滚动和向上滚动都使用同一套物理规则。
- 保留 realtime sticky 能力的原有 contract，不让两种模式互相污染。
- 继续排除 agent task notification、memory-only user payload 等伪 user 消息。

**Non-Goals:**

- 不新增手动 pin/unpin UI。
- 不让 assistant、reasoning、tool message 参与 sticky。
- 不让完整 user message bubble 本体在 history 模式下变成多条 sticky 覆盖层。
- 不重写消息虚拟窗口或 scroll scheduling。
- 不改变历史折叠指示器、anchor rail、copy 行为的现有契约。

## Decisions

### Decision 1: History 模式使用“单一 condensed sticky header”，而不是让完整 user wrapper 直接 sticky

历史模式渲染一个独立的、展示层专用的 condensed sticky header。scroll position 决定当前应该显示哪条 ordinary user question，但真正吸附到顶部的是一份紧凑的标题摘要，而不是原始完整 user bubble。

这样可以保留“当前分段标题”的阅读语义，同时避免长 user bubble、references 卡片或复杂子结构在顶部形成重叠。

Alternatives considered:

- 让所有 ordinary user wrapper 同时 sticky：实现最短，但对长消息和 references 卡片会直接产生重叠。
- 继续复用 realtime 的“只选一条 sticky id + 完整 bubble sticky”模式：只能固定整块消息，无法解决长内容占位问题。
- 用 IntersectionObserver 替代 scroll math：复杂度更高，但没有带来比当前 scrollTop/offsetTop 方案更强的收益。

### Decision 2: Realtime sticky 优先级高于 history sticky

当对话仍处于 realtime processing 时，继续沿用现有 `pin-live-user-question-bubble` contract，只固定最后一条 ordinary user question。只有在非 realtime 浏览状态下，history section-header sticky 才接管。

这样可以避免在 active turn 中多个 user bubble 同时具备 sticky 资格，破坏当前“最后问题是实时锚点”的语义。

### Decision 3: 继续复用 ordinary-user 过滤契约

history sticky 与 realtime sticky 都必须基于同一套 ordinary user question 判定逻辑，排除：

- agent task notification user rows
- memory-only injected payload
- 空白或不构成真实用户问题的 user 文本

这样可以避免“历史里吸附了一条并不是真问题的 user 卡片”。

### Decision 4: 只对已渲染 ordinary user rows 计算 header，不为被窗口裁剪的历史消息制造 phantom sticky

当历史列表仍处于折叠窗口状态时，只允许已渲染到 DOM 中的 ordinary user question 参与 sticky。隐藏在 collapsed-history 之前的消息不应凭空成为顶部标题；用户点击显示更早消息后，sticky 范围再自然扩展到完整渲染窗口。

## Risks / Trade-offs

- condensed header 只展示用户问题摘要，不能完整反映 references 卡片等富内容。Mitigation: sticky header 仅承担“当前分段标题”职责；完整内容继续保留在原始 user message 行内。
- scroll math 如果依赖会受 DOM 布局变动影响。Mitigation: sticky header 本身不进入消息文档流，不改变 message row 的 `offsetTop`。
- 与 collapsed-history、anchor rail、copy button 的叠加可能出现边界问题。Mitigation: 增加 dedicated scroll-behavior tests，覆盖裁剪窗口、history restore 和伪 user 过滤。

## Migration Plan

1. 新增 history sticky OpenSpec spec 与 tasks。
2. 在 `Messages.tsx` 区分 realtime sticky 与 history sticky 的渲染条件。
3. 复用 `messagesLiveWindow.ts` 中 ordinary user 判定逻辑，避免重复分叉。
4. 在 `messages.css` 增加独立的 history sticky header 样式，并保留 live sticky wrapper contract 不变。
5. 添加/扩展测试，覆盖向下接棒、向上回退、窗口裁剪和 realtime 优先级。

Rollback 仍然是纯前端回退：移除 history sticky 渲染条件、样式和测试即可，不涉及数据迁移。

## Open Questions

None for MVP. 当前方案明确采用“物理滚动位置驱动”的 A 方案，不做语义预测切换。
