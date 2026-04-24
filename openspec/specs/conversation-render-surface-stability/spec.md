# conversation-render-surface-stability Specification

## Purpose
TBD - created by archiving change fix-claude-chat-canvas-cross-platform-blanking. Update Purpose after archive.
## Requirements
### Requirement: Claude Live Conversation Rendering MUST Degrade Safely On Desktop Surfaces

当 Claude 会话处于 live processing 且消息幕布进入高频 realtime 更新时，系统 MUST 启用 render-safe degradation，避免消息区出现闪白、整块空白或需要切换线程才能恢复的状态。

#### Scenario: desktop claude processing enters render-safe mode

- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前线程处于 processing
- **AND** 消息幕布正在渲染 realtime conversation items
- **THEN** 系统 MUST 为消息幕布启用 render-safe mode 或等价的安全降级路径
- **AND** 该路径 MUST 可用于关闭高风险渲染优化或激进动画效果

#### Scenario: render-safe mode prevents blank conversation surface

- **WHEN** Claude live processing 期间连续收到多次 delta、reasoning、tool 或 assistant message 更新
- **THEN** 消息幕布 MUST 保持至少一条可见 conversation content、working indicator 或等价可读反馈
- **AND** 系统 MUST NOT 进入“短暂闪现后整块空白”的状态

#### Scenario: visible stalled markdown can fall back to a plain-text live surface

- **WHEN** Claude live assistant markdown 已收到正文 delta
- **AND** live visible text 在 bounded window 内停止增长
- **THEN** 系统 MAY 将当前 streaming assistant message 临时切换到 plain-text live surface 或等价恢复路径
- **AND** completed assistant message MUST 立即回到最终 Markdown render

#### Scenario: latest claude reasoning row stays on the curtain before the first assistant chunk

- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前线程处于 processing
- **AND** 最新 user turn 之后已经出现 `reasoning` 与后续 tool activity
- **AND** 首个 assistant message 仍未出现
- **THEN** live canvas MUST 保留 latest reasoning row 在消息幕布上
- **AND** `WorkingIndicator` MUST NOT 成为该 reasoning 文案的唯一可见承载面

#### Scenario: history and sticky contracts remain readable during degradation

- **WHEN** render-safe mode 已启用
- **AND** 当前幕布同时存在 collapsed history、history sticky 或 realtime sticky 行为
- **THEN** 系统 MUST 保持这些 presentation contract 可读且可交互
- **AND** MUST NOT 因降级策略引入双 sticky header、消失的历史入口或不可滚动状态

#### Scenario: repeat-turn blanking preserves a readable curtain surface

- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前会话已经成功显示过前序回合内容
- **AND** 新一轮 turn 在 processing 中触发 residual blanking
- **THEN** render-safe path MUST 保留或恢复至少一个可读 curtain surface
- **AND** 系统 MUST NOT 让消息幕布长时间维持整块空白

#### Scenario: blanking recovery stays inside the active claude conversation

- **WHEN** render-safe path 因 `Claude` repeat-turn blanking 被激活
- **THEN** recovery MUST 在当前 active conversation 内完成
- **AND** 系统 MUST NOT 通过切换线程、自动新建会话或要求 reopen 才恢复消息幕布

### Requirement: Claude Render Safety MUST Preserve Progressive Assistant Text Visibility

Claude render-safe behavior MUST protect live assistant text visibility in addition to preventing blank or flashing conversation surfaces.

#### Scenario: render-safe mode keeps live assistant text progressing
- **WHEN** current conversation engine is `claude`
- **AND** the conversation is processing
- **AND** assistant text deltas continue to arrive
- **THEN** render-safe mode MUST keep the live assistant message visibly progressing
- **AND** the message surface MUST NOT degrade to a spinner-only or first-few-characters-only state until completion

#### Scenario: render-safe degradation does not suppress meaningful live text
- **WHEN** Claude render-safe mode disables high-risk visual effects, animations, or render optimizations
- **THEN** those degradations MUST prioritize preserving readable live assistant text
- **AND** the system MUST NOT solve blanking by hiding or deferring all intermediate assistant content until the terminal event

#### Scenario: a shorter degraded stub does not overwrite the last readable live assistant surface
- **WHEN** `Claude` render-safe mode is active during processing
- **AND** the current turn had already rendered a more readable assistant body
- **AND** the current live surface regresses to a shorter prefix-only stub under visible stall evidence
- **THEN** render-safe recovery MUST keep the last more-readable same-turn surface available
- **AND** the shorter stub MUST NOT overwrite the preserved readable surface as the only visible body

### Requirement: Render Safety MUST Follow Normalized Conversation Processing State

渲染安全策略 MUST 以归一化 `conversationState` 为准，不得依赖可能滞后的 legacy props，避免 render-safe mode 漏触发。

#### Scenario: normalized state overrides stale legacy thinking flag

- **WHEN** `conversationState.meta.isThinking` 为 `true`
- **AND** legacy `isThinking` prop 仍为 `false` 或尚未同步
- **THEN** 消息幕布 MUST 仍按 processing conversation 处理
- **AND** render-safe mode MUST 依据 normalized state 正常启用

#### Scenario: normalized state shutdown exits render-safe mode

- **WHEN** `conversationState.meta.isThinking` 变为 `false`
- **THEN** 消息幕布 MUST 退出 realtime-specific render-safe mode
- **AND** 历史浏览与普通 completed conversation 渲染 MUST 恢复到非 processing 行为

### Requirement: Render Safety MUST Remain Claude-Scoped Unless Another Engine Opts In

本能力 MUST 以 Claude live conversation 为主治理对象，不得误伤 Codex、Gemini、OpenCode 的现有视觉与交互契约。

#### Scenario: codex path does not inherit claude-only degradation

- **WHEN** 当前会话引擎为 `codex`
- **AND** 未显式声明复用 Claude render-safe contract
- **THEN** 系统 MUST NOT 自动套用 Claude 专属 render-safe mode
- **AND** Codex 既有 stream、timeline 与 working indicator 行为 MUST 保持不变

#### Scenario: desktop platform handling is not hard-coded to windows only

- **WHEN** 当前会话引擎为 `claude`
- **AND** 应用运行在任一 desktop WebView surface，例如 Windows 或 macOS
- **THEN** render-safe strategy MUST 通过统一的 desktop surface contract 判定是否启用
- **AND** 系统 MUST NOT 将安全降级能力写死为 Windows-only 样式分支
