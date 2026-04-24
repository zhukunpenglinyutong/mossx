## MODIFIED Requirements

### Requirement: Latency Diagnostics MUST Distinguish Upstream Delay From Client Render Amplification

系统 MUST 避免把所有“出字慢”或“幕布异常”都记录成同一种原因。

#### Scenario: repeat-turn full-curtain blanking is classified separately from visible stall
- **WHEN** `Claude` 会话已经成功显示过前序回合内容
- **AND** 后续 turn 进入 processing 或 realtime 更新阶段
- **AND** 当前 conversation curtain 失去全部可读内容，而不是仅仅出现可见文本增长停顿
- **THEN** diagnostics MUST 将该次异常归类为 `repeat-turn blanking` 或等价显式类别
- **AND** diagnostics MUST NOT 将其压缩成 `visible-output-stall-after-first-delta`

#### Scenario: blanking evidence stays correlated with render recovery
- **WHEN** 系统记录 `repeat-turn blanking` diagnostics
- **THEN** 记录 MUST 保留 `workspaceId`、`threadId`、`engine`、`platform`、active mitigation profile 与 turn 相关 evidence
- **AND** triage 时 MUST 能将该诊断与具体的 blanking recovery 行为关联起来

