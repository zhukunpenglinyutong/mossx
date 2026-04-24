## Context

当前 `Claude Code` 对话链路已经具备真实正文流：

```text
Claude CLI stream-json
  -> content_block_delta/text_delta
  -> Rust Claude parser
  -> EngineEvent::TextDelta
  -> item/agentMessage/delta
  -> reducer merge
  -> Messages/Markdown live render
```

问题最终被拆成两层：

- 现有仓库只对 `Windows + Claude` 建立 candidate mitigation / visible stall timer。
- 当同类 visible stall 出现在其他 Claude desktop surface 时，系统没有 engine-level recovery path。
- Claude parser 对 `stream_event/content_block_delta/text_delta` 与末尾 `assistant` cumulative snapshot 使用了分离的 emitted-text 跟踪。
- 结果是：backend 明明已经持续收到 `text_delta`，但 GUI 仍可能在中后段停在短文案；而 turn 末尾的 full snapshot 又可能被当成“新的整段 delta”再次下发，造成突然整块冒出与 completed 重复拼接。
- 另外，Claude live canvas 会把“最新 reasoning -> 后续 tool cards”这一段按 middle steps 折叠，导致幕布上看不到 latest reasoning row，只剩底部 `WorkingIndicator` 还在复述那句 reasoning 文案。

## Decisions

### Decision 1: 新问题独立于旧 Windows change

本 change 不追加到 `fix-claude-windows-streaming-visibility-stall`。

原因：

- 旧 change 的主语义是 Windows visible stream fault。
- 新问题的主语义是 `Claude long-markdown progressive reveal` 的 engine-level recovery blind spot。
- 若混在同一 change，会让“Windows candidate 保护”和“跨平台 evidence recovery”两个验证矩阵缠在一起。

### Decision 2: 保留 Windows candidate path，不做回退

`Windows + Claude` 现有 candidate mitigation 仍保留：

- `claude-qwen-windows-render-safe`
- `claude-windows-visible-stream`

这次不去推翻它，只补足“非 Windows Claude 没有 recovery”这一层。

### Decision 3: 新增 engine-level recovery profile，只在 visible stall evidence 后激活

新增 `claude-markdown-stream-recovery`：

- 仅在 `engine=claude`
- 且 `first delta` 已到达
- 且 `visible text` 在 bounded window 内未增长

时激活。

激活后：

- live assistant path 使用 `plain-text streaming surface`
- completed 后恢复最终 Markdown

这样可以避免把所有 Claude streaming 直接降级成 plain text。

### Decision 4: 不把 render amplification 扩大成所有平台

本轮只把 **visible-output stall** 恢复扩大到 engine-level。

不把 `render-amplification -> mitigation activation` 一并扩大到所有平台，原因是当前 `noteThreadVisibleRender()` 仍以 `renderedItems` 粒度记录，对“同一 message 内容增长但 item 数不变”的场景证据不够强。

因此本轮策略是：

- Windows：保留现有 candidate + render-lag 激活
- 非 Windows Claude：走 visible-stall evidence 激活

### Decision 5: Claude backend 的 streamed delta 与 cumulative snapshot 必须共用同一累计文本状态

对于 Claude CLI：

- `stream_event/content_block_delta/text_delta` 是 realtime 增量正文
- turn 尾部还可能补发 `assistant` 全量 cumulative snapshot

如果 parser 只在 `assistant` 路径更新 last-emitted-text，而不在前面的 `stream_event text_delta` 路径同步累计状态，那么尾部 full snapshot 会被误判为全新正文，导致：

- 用户看到一整段 Markdown 在末尾突然再次出现
- synthetic completed 聚合 `accumulated_agent_text` 时再把整段正文拼一次

因此本轮要求：

- streamed `text_delta` 与后续 `assistant` snapshot 共用一套 cumulative-text tracker
- 当后续 snapshot 只是已发正文的等价或更短版本时，parser 不再重复发整段 delta

### Decision 6: reducer completed merge 增加“existing already contains completed body”兜底

即使 backend 将来再次出现 provider-specific full snapshot 抖动，reducer 也需要保证：

- 若 live assistant markdown 已经包含 completed 主体
- 且 completed 只是其中的长正文子集

则最终 completed merge 优先保留现有 readable body，而不是再拼一份长 Markdown。

### Decision 7: Claude live collapse 不得把 latest reasoning 文案只留在 loading 区

当前 live canvas 会把“用户消息之后、最后一个 item 之前”的非 message 项统一折叠成 middle steps。

这对 Claude 会产生一个额外错觉：

- latest reasoning row 被折叠隐藏
- 后续 tool cards 继续显示
- `WorkingIndicator` 又复用了 latest reasoning label

结果就是用户在底部 loading 区看到一句像正文的话，却无法在消息幕布上找到对应 live row，误以为“正文流式输出被塞到了 loading 后面”。

因此本轮要求：

- 在 `engine=claude`
- 且 `latestAssistantMessageId == null`
- 且存在 `latestReasoningId`

时，live collapse 必须保留该 latest reasoning row 在幕布上。

同时，只有当 working indicator 的 activity label 真正会展示时，才允许对 Claude 隐去底部 reasoning label，避免“幕布里已有 reasoning row，spinner 还在重复那句文案”。

### Decision 8: Claude turn completed 后需要一次 authoritative history reconcile

仅靠 realtime reducer 收敛并不够稳，因为 Claude turn 末尾还可能同时存在：

- synthetic completed 文本
- backend 末尾 cumulative snapshot
- 本地 live markdown / plain-text recovery 中间态

当这些路径在同一 turn 内轻微错位时，用户就会看到“completed 后仍重复一段”。

Codex 现有实现已经证明：turn completed 后做一次 history reconcile，可以用 authoritative history snapshot 覆盖本地实时链路残留的尾部脏态。

因此本轮要求：

- Claude 也在 turn completed 后调度一次 history reconcile
- reconcile 必须去重，同一 turn 只允许触发一次
- Claude `refreshThread()` 必须真正强制 reload session history，而不是在 `loadedThreadsRef` 已命中时直接短路

### Decision 9: Claude realtime reasoning 与 assistant text 必须使用独立 render item identity

这次继续深挖后确认了一个更底层的 cross-layer 脏点：

- Claude realtime forwarder 之前复用了同一个 `itemId`
- `conversationState` 路径下的 assembler 仍存在按 `id` 单键 upsert 的契约
- 结果是 provider 如果在同一 turn 内先后交付 reasoning / assistant text，同一个 live item 可能在幕布态里互相覆盖

这会直接放大成用户可见故障：

- reasoning row 继续可见
- `WorkingIndicator` 仍在复述 latest reasoning
- assistant 正文 delta 即使已经到达，也可能没有稳定变成独立 assistant row

因此本轮要求：

- Claude realtime forwarder 为 reasoning 与 assistant text 使用独立 render item id
- synthetic completed 统一收敛到 assistant item id
- conversation curtain assembler / history hydrate 不再允许同 `id` 跨 `kind` 互相覆盖

这不是“额外优化”，而是让 live curtain 与 realtime event contract 对齐的必要修复。

## Risks

- 风险：非 Windows Claude 也可能在 700ms 内短暂无可见增长，导致 recovery profile 提前激活。  
  缓解：只在 `first delta` 之后、且同一 assistant item 的 visible text 未增长时触发；completed 会立即回归 Markdown。

- 风险：plain-text live surface 改变 streaming 中间态的视觉语义。  
  缓解：仅在 stalled evidence 后激活，并在 completed 时立即回到最终 Markdown。

- 风险：cumulative-text tracker 若错误把真正的新正文当成 stale snapshot，会吞掉有效 delta。  
  缓解：tracker 仅对 Claude realtime text path 生效，并保留“前缀扩展 -> 只发 suffix”的主路径；新增 Rust 单测覆盖 streamed delta + final assistant snapshot 收敛。

- 风险：保留 latest Claude reasoning row 可能让 live canvas 比之前多出一个 reasoning block。  
  缓解：仅在“还没有 assistant message、且该 reasoning 本来会被 middle-step collapse 吃掉”时保留；不会放宽到所有引擎，也不会恢复旧 reasoning runs。

- 风险：completed 后 history reconcile 若拿不到 workspace path，会静默不生效。  
  缓解：当前工作流里 workspace path 由 thread list hydration 先行注入；同时 `refreshThread()` 已改为对 Claude force reload，不再因为 `loadedThreadsRef` 命中而空转。

- 风险：Claude realtime item id 改成 lane-aware 后，若 completed / history 仍落到旧 id，可能出现 live item 与终态 item 脱节。  
  缓解：synthetic completed 固定收敛到 assistant lane item id，同时 conversation assembler 也改为 `id + kind` 级别去重，避免 contract 两端再次发生覆盖。

## Validation

- `streamLatencyDiagnostics.test.ts`：
  - Windows Qwen path 保持。
  - Windows native Claude path 保持。
  - macOS Claude visible stall 会激活 `claude-markdown-stream-recovery`。
- `MessagesRows.stream-mitigation.test.tsx`：
  - 新 recovery profile 会走 plain-text live surface。
- `Messages.live-behavior.test.tsx`：
  - Claude 在首个 assistant chunk 前，latest reasoning row 继续留在幕布上。
  - 当 tool activity 已显示时，底部 working indicator 不再把同一条 Claude reasoning 文案当成唯一可见文本。
  - Claude conversation state 即使出现“同一个 provider item id 对应 reasoning + assistant”也必须同时保留 reasoning row 与 assistant 正文。
- `conversationAssembler.test.ts`：
  - Claude same-id cross-kind realtime event 不再互相覆盖。
  - history hydrate 不再把 same-id reasoning/message 折叠成单条 item。
- `threadReducer.completed-duplicate.test.ts`：
  - 已有 live markdown 包含 completed 主体时，不再把长 Markdown 再拼一遍。
- `useThreadActions.test.tsx`：
  - Claude `refreshThread()` 在 thread 已 loaded 时仍会强制 reload history。
- `useThreads.memory-race.integration.test.tsx`：
  - Claude turn completed 后只调度一次 history reconcile。
- `cargo test` / `Claude tests_core`：
  - `stream_event text_delta` 先到、最终 `assistant` full snapshot 后到时，只允许发真正增量，不允许再发整篇正文。
- backend CLI evidence：
  - 记录等价 `stream-json` 长文测试，证明正文 delta 真实存在。
