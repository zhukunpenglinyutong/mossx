# Message Markdown Streaming Compatibility

## Purpose

定义实时 assistant markdown 在 streaming、completed 与 history restore 路径中的兼容性约束，确保 inline code span 在 partial syntax、merge、normalize 与最终收敛过程中保持边界稳定。

## Requirements

### Requirement: Live Assistant Markdown MUST Preserve Inline Code Boundaries During Partial Streaming

在 assistant 实时输出尚未完成时，系统 MUST 保持 inline code span 的 backtick 边界稳定；对于 closing backtick 尚未到达的 partial syntax，系统 MUST NOT 把相邻正文错误并入 code span。

#### Scenario: unmatched opening backtick does not swallow adjacent prose

- **WHEN** assistant live message 已收到 opening backtick，但 closing backtick 仍未到达
- **THEN** 系统 MUST NOT 因 fragmented merge、paragraph normalization 或即时 markdown reparse 把后续相邻正文错误归入 inline code span
- **AND** 当前可见内容 MUST 以 raw/stable fallback 或等价保护方式展示，而不是产生错误的 code-span 归属

#### Scenario: delayed closing backtick converges to the intended inline code

- **WHEN** assistant live message 在后续 delta 中补齐 closing backtick
- **THEN** 系统 MUST 收敛到预期的 inline code span 结构
- **AND** code span 外的前后正文 MUST 保持为普通正文，而不是遗留先前的错位解析结果

### Requirement: Live Markdown Normalization MUST Treat Inline Code Spans As Protected Regions

当系统对 assistant live markdown 执行正文规整、资源修复、可读性清洗或等价的 normalization 时，inline code span MUST 被视为 protected region，相关逻辑 MUST NOT 改写其中内容或移动其边界标记。

#### Scenario: fragmented paragraph cleanup skips protected inline code content

- **WHEN** assistant live markdown 同时触发 fragmented paragraph/line cleanup 与 inline code span
- **THEN** cleanup 逻辑 MUST 跳过 protected inline code region
- **AND** inline code 内的文本与 backtick 边界 MUST 保持原样

#### Scenario: resource or path repair does not mutate inline code examples

- **WHEN** assistant live markdown 中的 inline code span 含有路径、URL、命令片段或等价 resource-like token
- **THEN** 资源修复、路径 link 化或等价增强逻辑 MUST NOT 在该 protected region 内改写文本
- **AND** 这些文本 MUST 继续作为原始 inline code 内容展示

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

#### Scenario: completed assistant message flushes final stable markdown immediately

- **WHEN** assistant turn 进入 completed 或等价最终态
- **THEN** 系统 MUST 立即刷新最终稳定 markdown 结果
- **AND** 用户 MUST NOT 继续停留在仅用于 live partial syntax 的临时保护态

### Requirement: Completed Live Assistant Markdown MUST Converge With History Restore Semantics

同一 assistant message 在 live 完成后的最终可见 markdown 语义 MUST 与后续 history reload / restore 的可见 markdown 语义保持一致，尤其是 inline code span 的边界与正文归属。

#### Scenario: completed live message matches history reload inline-code structure

- **WHEN** 同一 assistant message 先在 live 对话中完成，再从 history reload 或 restore 路径重新载入
- **THEN** 两条路径的最终 inline code span 结构 MUST 等价
- **AND** 系统 MUST NOT 出现“live 错位而 history 正常”或反向分叉
