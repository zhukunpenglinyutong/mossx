# claude-repeat-turn-blanking-recovery Specification

## Purpose

Define recovery and activation boundaries for Claude repeat-turn blanking so the conversation curtain can recover in place without degrading unaffected sessions.

## Requirements

### Requirement: Claude Repeat-Turn Blanking MUST Recover In Place

当 `Claude` 会话已经成功显示过前序回合内容，而后续 turn 在 live processing 中触发整块幕布空白时，系统 MUST 在当前会话内恢复可读 surface，而不是要求用户切线程或重开会话。

#### Scenario: second-or-later claude turn does not leave a fully blank curtain
- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前会话已成功完成至少一个 user/assistant 回合
- **AND** 后续 turn 进入 processing 或正在接收 realtime 更新
- **AND** conversation curtain 进入整块空白、无可读 rows、无等价可读反馈的状态
- **THEN** 系统 MUST 保留或恢复至少一个非空、可读的 curtain surface
- **AND** 用户 MUST NOT 需要切换到其他线程或重开同一会话才能继续看到内容

#### Scenario: blanking recovery does not create an unrelated thread
- **WHEN** `Claude` repeat-turn blanking recovery 被激活
- **THEN** 系统 MUST 在当前 thread identity 内完成恢复
- **AND** 系统 MUST NOT 因 blanking recovery 自动创建新的 Agent conversation 或切换到其他 thread

### Requirement: Repeat-Turn Blanking Mitigation MUST Stay Evidence-Driven

系统 MUST 以 `Claude`、repeat-turn、blank curtain evidence 与当前 render phase 等证据决定是否激活 mitigation，不得把所有 `Claude` 会话永久降级。

#### Scenario: normal claude sessions keep baseline render path
- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前 turn 没有出现 repeat-turn blanking evidence
- **THEN** 系统 MUST 保持既有 baseline render path
- **AND** MUST NOT 仅因引擎是 `claude` 就进入更重的 blanking mitigation
