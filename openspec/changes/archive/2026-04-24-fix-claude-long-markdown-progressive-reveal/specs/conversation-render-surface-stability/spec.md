## MODIFIED Requirements

### Requirement: Claude Live Conversation Rendering MUST Degrade Safely On Desktop Surfaces

当 Claude 会话处于 live processing 且消息幕布进入高频 realtime 更新时，系统 MUST 启用 render-safe degradation，避免消息区出现闪白、整块空白或需要切换线程才能恢复的状态。

#### Scenario: desktop claude processing enters render-safe mode
- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前线程处于 processing
- **AND** 消息幕布正在渲染 realtime conversation items
- **THEN** 系统 MUST 为消息幕布启用 render-safe mode 或等价的安全降级路径
- **AND** 该路径 MUST 可用于关闭高风险渲染优化或激进动画效果

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
