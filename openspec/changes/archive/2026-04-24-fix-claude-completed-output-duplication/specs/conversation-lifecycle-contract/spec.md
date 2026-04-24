## MODIFIED Requirements

### Requirement: Realtime Optimization Must Preserve Lifecycle Semantics

Any client-side realtime CPU optimization MUST preserve conversation lifecycle semantics and terminal outcomes.

#### Scenario: claude completed snapshot replay converges with streamed prefix before terminal settlement
- **WHEN** 当前引擎为 `Claude`
- **AND** live assistant message 已经在 processing 中显示过可读正文前缀
- **AND** terminal completed payload 又以 `streamed prefix + full final snapshot` 形式回放同一条 assistant 内容
- **THEN** 生命周期消费者 MUST 在 terminal settlement 前将该 replay 收敛为一条 completed assistant message
- **AND** conversation state MUST NOT 留下重复的 Markdown report、大段列表或等价主体正文块

#### Scenario: completed replay collapse does not require history reconcile changes
- **WHEN** 系统为 `Claude` 处理 completed replay collapse
- **THEN** 该收敛逻辑 MUST 保持在 completed text merge / lifecycle settlement 边界内
- **AND** 系统 MUST NOT 依赖停用、延后或改写 `Claude` history reconcile 才保持单条 assistant bubble 收敛
