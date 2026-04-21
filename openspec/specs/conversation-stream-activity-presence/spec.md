# conversation-stream-activity-presence Specification

## Purpose

定义会话流式处理中 `waiting/ingress` 相位语义和视觉联动契约，确保消息区与输入区状态反馈一致且跨引擎可预测。

## Requirements

### Requirement: Streaming Activity Phase MUST Expose Waiting and Ingress States

系统 MUST 在流式处理中暴露 `waiting` 与 `ingress` 相位，用于统一消息区与输入区反馈。

#### Scenario: no new chunk keeps waiting phase

- **WHEN** 会话处于 processing 且最新对话指纹未变化
- **THEN** 相位 MUST 为 `waiting`
- **AND** 相应 UI MUST 使用 waiting 视觉反馈

#### Scenario: new chunk switches to ingress phase then decays

- **WHEN** 会话指纹发生变化（收到新流式片段）
- **THEN** 相位 MUST 进入 `ingress`
- **AND** 在保持窗口结束后 MUST 回落到 `waiting`

### Requirement: Stream Activity Effects MUST Be Consistent Across Codex/Claude/Gemini

Codex/Claude/Gemini MUST 共享同一相位语义与视觉联动策略。

#### Scenario: working indicator and stop button share same phase class

- **WHEN** 引擎为 `codex/claude/gemini`
- **THEN** 消息区 working indicator 与输入区 stop 按钮 MUST 使用一致相位类名
- **AND** 两处状态切换 MUST 同步

#### Scenario: unsupported engines fall back to idle

- **WHEN** 引擎不在上述集合（例如 OpenCode）
- **THEN** 系统 MUST 回退到 `idle` 表现
- **AND** MUST NOT 注入 waiting/ingress 特效类

### Requirement: Motion and Theme Adaptation MUST Remain Recoverable

系统 MUST 在 reduced-motion 与浅色主题下保持可识别但可降级的状态反馈。

#### Scenario: reduced-motion disables aggressive ingress animation

- **WHEN** 用户系统开启 reduced-motion
- **THEN** 系统 SHOULD 关闭或弱化 ingress 动画粒子/光晕
- **AND** MUST 保留可读状态指示

#### Scenario: light theme keeps ingress feedback visible

- **WHEN** 应用处于浅色主题
- **THEN** ingress 视觉反馈 MUST 保持可见对比度
- **AND** 不得与 waiting 态不可区分

### Requirement: Explore Auto Expansion MUST Follow The Current Live Stage

系统 MUST 将实时对话中的 Explore 卡片自动展开限定在当前实时阶段仍为 Explore 的场景；当后续可见阶段推进到非 Explore 操作时，已完成 Explore 卡片 MUST 自动折叠。

#### Scenario: live explore stage keeps explored details expanded

- **WHEN** 会话处于 processing
- **AND** 当前可见 timeline 的最新阶段是已完成 Explore 卡片
- **THEN** 该 `Explored` 卡片 MUST 自动展开详情
- **AND** 非自动展开状态下的卡片 toggle 语义 MUST 保持不变

#### Scenario: following non-explore stage collapses previous explored details

- **WHEN** 会话处于 processing
- **AND** 一个 `Explored` 卡片之后出现 tool、reasoning、assistant message 或其他非 Explore 阶段
- **THEN** 先前的 `Explored` 卡片 MUST 自动折叠
- **AND** 其他非 Explore 卡片的展示与展开逻辑 MUST 保持不变

#### Scenario: finished conversation keeps explored details collapsed

- **WHEN** 会话 processing 结束
- **THEN** 已完成且可折叠的 `Explored` 卡片 MUST 使用折叠态作为默认展示
- **AND** 现有 Explore 合并、隐藏与排序语义 MUST 保持不变
