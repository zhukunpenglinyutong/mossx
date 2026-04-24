# conversation-render-surface-stability Specification Delta

## ADDED Requirements

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

#### Scenario: history and sticky contracts remain readable during degradation

- **WHEN** render-safe mode 已启用
- **AND** 当前幕布同时存在 collapsed history、history sticky 或 realtime sticky 行为
- **THEN** 系统 MUST 保持这些 presentation contract 可读且可交互
- **AND** MUST NOT 因降级策略引入双 sticky header、消失的历史入口或不可滚动状态

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
