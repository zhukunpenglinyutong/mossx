## ADDED Requirements

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
