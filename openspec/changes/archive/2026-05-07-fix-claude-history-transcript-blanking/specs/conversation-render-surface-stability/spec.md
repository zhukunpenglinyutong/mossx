## MODIFIED Requirements

### Requirement: Claude Live Conversation Rendering MUST Degrade Safely On Desktop Surfaces

当 Claude 会话处于 live processing 且消息幕布进入高频 realtime 更新时，系统 MUST 启用 render-safe degradation，避免消息区出现闪白、整块空白或需要切换线程才能恢复的状态。

#### Scenario: transcript-heavy Claude history restore keeps a readable surface

- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前幕布承载的是 history restore / reopen 后的非 realtime conversation
- **AND** 该会话以 `reasoning` / `tool` transcript 为主而普通 assistant 正文极少
- **THEN** render surface MUST 保留至少一个可读 transcript surface
- **AND** 系统 MUST NOT 将该会话直接渲染为空白或 empty-thread placeholder
