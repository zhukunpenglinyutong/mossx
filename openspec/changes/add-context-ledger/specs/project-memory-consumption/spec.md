## ADDED Requirements

### Requirement: Manual Memory Selection SHALL Remain Traceable In Context Ledger

系统 MUST 让手动选择的项目记忆在 Context Ledger 中保持可追踪，而不是只在发送时临时拼接后消失。

#### Scenario: selected memories appear as ledger blocks before send

- **WHEN** 用户在当前发送前手动选择了一组项目记忆
- **THEN** ledger SHALL 为每条已选记忆投影一个 `manual_memory` block
- **AND** 每个 block SHALL 保留稳定的 `memoryId` 或等价 source reference

#### Scenario: removing a selected memory removes the matching ledger block

- **WHEN** 用户在发送前移除某条已选记忆
- **THEN** 对应 ledger block SHALL 同步消失
- **AND** 其余已选记忆的 ledger block SHALL 保持不变

#### Scenario: send settlement clears one-shot memory blocks

- **WHEN** 当前发送完成或失败后收敛
- **AND** 用户未对该记忆显式执行 `pin for next send`
- **THEN** one-shot 手动记忆选择 SHALL 按现有语义清空
- **AND** 相应 ledger blocks SHALL 一起清空

#### Scenario: pin for next send carries a manual memory across one additional send

- **WHEN** 用户对当前已选记忆执行 `pin for next send`
- **THEN** 当前发送收敛后该记忆 SHALL 继续留在下一轮发送准备态
- **AND** 该保留 SHALL 在下一轮发送后自动消耗

#### Scenario: ledger does not reintroduce hidden auto memory retrieval

- **WHEN** 当前发送准备态不存在手动选择的项目记忆
- **THEN** Context Ledger SHALL NOT 伪造 `manual_memory` block
- **AND** Phase 1 ledger SHALL NOT 仅为了补齐账本而重启隐藏的 project-memory 自动检索注入
