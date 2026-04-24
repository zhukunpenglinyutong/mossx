## MODIFIED Requirements

### Requirement: Live Assistant Markdown Rendering MUST Use Bounded Stabilization For Syntax-Incomplete Streams

对于 syntax-incomplete 的 assistant live markdown，系统 MUST 使用 bounded stabilization window 或等价策略，避免对每个高频中间片段都立即执行语义级 markdown 重解析。

#### Scenario: high-frequency partial deltas do not force zero-buffer semantic reparsing
- **WHEN** assistant live message 高频接收仍处于 syntax-incomplete 状态的 markdown deltas
- **THEN** 渲染路径 MUST 采用 bounded stabilization，而不是对每个中间片段执行零缓冲语义级重解析
- **AND** 该策略 MUST 降低 partial syntax 期间的语义抖动窗口

#### Scenario: long-markdown visible stall can recover through a temporary readable surface
- **WHEN** assistant live markdown 的正文 delta 仍在持续到达
- **AND** 语义级 Markdown render 已经无法持续推动用户可见文本增长
- **THEN** 系统 MUST 允许通过 plain-text live surface 或等价 readable fallback 恢复 progressive reveal
- **AND** completed assistant message MUST 立即刷新最终稳定 Markdown 结果

#### Scenario: completed cumulative snapshot must not append an already-visible markdown document a second time
- **WHEN** Claude live assistant markdown 已经通过 streamed deltas 展示出长正文主体
- **AND** turn 尾部又收到等价或被现有正文完整包含的 cumulative snapshot / completed body
- **THEN** 系统 MUST 将该 completed 收敛为单份 readable markdown
- **AND** MUST NOT 在终态里把整篇长 Markdown 再追加一遍

#### Scenario: completed claude turn may reconcile the final markdown from session history once
- **WHEN** Claude turn 已进入 completed
- **AND** 本地 realtime 终态可能仍残留重复尾段、重复 completed body 或等价的终态偏差
- **THEN** 系统 MAY 读取一次该 session 的 authoritative history snapshot 进行 reconcile
- **AND** 同一 turn MUST NOT 触发多次重复 reconcile
- **AND** 若 history 中的最终 assistant markdown 与本地终态冲突，history snapshot MUST 覆盖本地脏终态

#### Scenario: claude realtime reasoning and assistant text stay as separate curtain items even if provider reuses one native item id
- **WHEN** Claude provider 在同一 turn 内复用同一个原生 item id 先后承载 reasoning 与 assistant text
- **THEN** realtime conversation curtain MUST 仍然保留 reasoning item 与 assistant message 两条独立可见项
- **AND** assembler / history hydrate MUST NOT 因为 `id` 相同而让两者互相覆盖
