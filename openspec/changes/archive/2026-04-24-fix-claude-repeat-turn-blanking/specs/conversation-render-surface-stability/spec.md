## MODIFIED Requirements

### Requirement: Claude Live Conversation Rendering MUST Degrade Safely On Desktop Surfaces

当 Claude 会话处于 live processing 且消息幕布进入高频 realtime 更新时，系统 MUST 启用 render-safe degradation，避免消息区出现闪白、整块空白或需要切换线程才能恢复的状态。

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

