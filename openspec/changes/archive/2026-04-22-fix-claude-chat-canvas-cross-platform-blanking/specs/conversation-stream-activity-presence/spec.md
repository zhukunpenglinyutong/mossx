# conversation-stream-activity-presence Specification Delta

## MODIFIED Requirements

### Requirement: Stream Activity Effects MUST Be Consistent Across Codex/Claude/Gemini

Codex/Claude/Gemini MUST 共享同一相位语义与视觉联动策略；当某个引擎进入 render-safe mode 时，系统 MAY 降级激进视觉效果，但 MUST 保持 `waiting/ingress` 的 processing 语义可见且一致。

#### Scenario: working indicator and stop button share same phase class

- **WHEN** 引擎为 `codex/claude/gemini`
- **THEN** 消息区 working indicator 与输入区 stop 按钮 MUST 使用一致相位类名
- **AND** 两处状态切换 MUST 同步

#### Scenario: render-safe mode weakens effects without losing phase semantics

- **WHEN** 引擎为 `claude`
- **AND** 消息幕布进入 render-safe mode
- **THEN** 系统 MAY 关闭或弱化 ingress 动画、粒子、光晕或等价的高风险视觉效果
- **AND** waiting / ingress / idle 的相位语义 MUST 仍然可由 UI 状态区分

#### Scenario: unsupported engines fall back to idle

- **WHEN** 引擎不在上述集合（例如 OpenCode）
- **THEN** 系统 MUST 回退到 `idle` 表现
- **AND** MUST NOT 注入 waiting/ingress 特效类

### Requirement: Motion and Theme Adaptation MUST Remain Recoverable

系统 MUST 在 reduced-motion、浅色主题与 desktop render-safe degradation 下保持可识别但可降级的状态反馈，不得为了保留特效而牺牲消息幕布稳定性。

#### Scenario: reduced-motion disables aggressive ingress animation

- **WHEN** 用户系统开启 reduced-motion
- **THEN** 系统 SHOULD 关闭或弱化 ingress 动画粒子/光晕
- **AND** MUST 保留可读状态指示

#### Scenario: light theme keeps ingress feedback visible

- **WHEN** 应用处于浅色主题
- **THEN** ingress 视觉反馈 MUST 保持可见对比度
- **AND** 不得与 waiting 态不可区分

#### Scenario: desktop render-safe mode disables unsafe render optimizations first

- **WHEN** 桌面 WebView surface 上的 stream activity 特效与渲染优化可能导致消息幕布不稳定
- **THEN** 系统 MUST 优先关闭高风险 render optimization 或激进动画
- **AND** MUST NOT 为了保留特效而接受聊天区闪白、空白或不可恢复状态
