## REMOVED Requirements

### Requirement: Phase 1 Bridge MUST Remain Status-Only
**Reason**: 第二阶段引入 `macOS-only` 的显式 activation/probe lane，不再要求 bridge 永远停留在纯状态读取。
**Migration**: 将“status-only”约束替换为“仅允许显式 activation lane；任何后台或隐式 helper invoke 仍然禁止”。

## ADDED Requirements

### Requirement: Bridge MUST Support Explicit Activation After Discovery

在 discovery 已经确认官方安装态之后，系统 MUST 允许 `macOS` 用户通过显式 activation lane 验证 helper bridgeability，而不是永久停留在 `helper_bridge_unverified`。

#### Scenario: eligible blocked macOS host can enter activation lane
- **WHEN** 当前平台为 `macOS`，bridge status 已确认官方 app/plugin/helper 存在，但仍因 `helper_bridge_unverified`、`permission_required` 或 `approval_required` 处于 `blocked`
- **THEN** 系统 MUST 允许用户显式触发 activation/probe
- **AND** MUST 返回结构化 activation result，而不是只刷新原有 blocked 文案

#### Scenario: successful activation updates current-session bridge truth
- **WHEN** activation/probe 在当前 app session 内成功验证宿主可桥接官方 helper
- **THEN** 后续 bridge status 读取 MUST 不再继续携带 `helper_bridge_unverified`
- **AND** 仅当不存在其他 blocked reason 时，系统才可以将 status 收敛为 `ready`

### Requirement: Bridge MUST Keep Implicit Invocation Disabled Outside Activation Lane

即使进入第二阶段，系统仍然 MUST 禁止在 activation lane 之外隐式调用官方 helper。

#### Scenario: ordinary status refresh remains read-only
- **WHEN** 用户刷新 Computer Use 状态，或系统重新读取 bridge status
- **THEN** 系统 MUST 继续执行只读 discovery
- **AND** MUST NOT 因状态刷新自动触发 activation/probe

#### Scenario: non-computer-use workflows do not invoke helper
- **WHEN** 用户执行普通设置保存、聊天发送、线程恢复、MCP 管理或其他无关主流程
- **THEN** 系统 MUST NOT 触发官方 helper invoke
- **AND** MUST NOT 因第二阶段接线而污染现有主流程
