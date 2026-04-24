## MODIFIED Requirements

### Requirement: Bridge Integration MUST Be Additive and Lazy

系统 MUST 以新增模块形式接入 Computer Use bridge，并采用惰性激活，未显式触发时不得污染现有主链路。

#### Scenario: capability stays dormant outside explicit computer use entry
- **WHEN** 用户未进入 Computer Use 入口，也未显式触发相关动作
- **THEN** 系统 MUST NOT 初始化 bridge runtime
- **AND** 现有聊天、线程、MCP、设置保存行为 MUST 保持不变

#### Scenario: additive integration limits legacy changes
- **WHEN** 新能力接入完成
- **THEN** 核心桥接逻辑 MUST 位于新增模块
- **AND** 对既有稳定模块的改动 MUST 限定为 command registration、surface 挂载、i18n 文案或等价必要接线

#### Scenario: broker is lazy and user-triggered
- **WHEN** broker capability is present
- **THEN** it MUST NOT create Codex hidden threads until the user explicitly submits a Computer Use broker task
- **AND** ordinary bridge status refresh MUST remain read-only
