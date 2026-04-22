# codex-computer-use-plugin-bridge Specification

## Purpose

定义 mossx 客户端如何以最小侵入方式桥接本机已安装的官方 `computer-use@openai-bundled` plugin，并在不复制官方 helper 的前提下表达可用性与桥接边界。

## ADDED Requirements

### Requirement: Bridge MUST Discover Official Computer Use Plugin from Local Codex State

系统 MUST 能从本机官方 Codex 安装态中发现 `computer-use@openai-bundled` 的存在性、启用状态与基础元数据，而不是依赖手工硬编码配置。

#### Scenario: plugin detected from local codex config and cache
- **GIVEN** 本机已安装官方 Codex App，且本地存在 `computer-use@openai-bundled` 的配置与 cache
- **WHEN** 系统执行 Computer Use bridge discovery
- **THEN** 系统 MUST 返回 plugin detected
- **AND** MUST 识别 plugin enabled/disabled 状态

#### Scenario: plugin absent remains unavailable
- **GIVEN** 本机未安装官方 Codex App，或不存在 `computer-use@openai-bundled` 的配置/cache
- **WHEN** 系统执行 Computer Use bridge discovery
- **THEN** 系统 MUST 返回 `unavailable`
- **AND** MUST NOT 影响现有 Codex、MCP、设置主流程

### Requirement: Bridge MUST Respect Official Ownership Boundary

系统 MUST 只桥接官方安装结果，MUST NOT 复制、重打包、重签名或重新分发官方 proprietary helper / app 资产。

#### Scenario: bridge reads official assets without copying them
- **WHEN** 系统解析官方 plugin manifest、cache 或 helper 路径
- **THEN** 系统 MUST 以只读方式消费这些资产
- **AND** MUST NOT 生成 helper 副本或重新写入官方 bundle

#### Scenario: generic settings save does not mutate official plugin state
- **WHEN** 用户执行普通设置保存、恢复或刷新动作
- **THEN** 系统 MUST NOT 隐式修改官方 plugin 的启用状态或安装状态
- **AND** MUST NOT 把当前 bridge 状态回写成新的 plugin lifecycle 真值

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

### Requirement: Bridge MUST Support Whole-Module Disablement

系统 MUST 提供整块 kill switch，以便在 bridge 回归或宿主不兼容时完全关闭该能力。

#### Scenario: kill switch disables bridge discovery and surface
- **WHEN** Computer Use bridge feature flag 被关闭
- **THEN** 系统 MUST 停止 bridge discovery 与 runtime 初始化
- **AND** MUST NOT 在 UI 中误导性显示“可用”

#### Scenario: disabling bridge does not regress existing functionality
- **WHEN** Computer Use bridge feature flag 被关闭
- **THEN** 现有 Codex、MCP、设置与工作区功能 MUST 继续按当前版本工作
- **AND** MUST NOT 因 bridge 被禁用而出现新的错误路径

### Requirement: Phase 1 Bridge MUST Remain Status-Only

在当前 change 范围内，系统 MUST 将 Computer Use bridge 限定为 status-only capability，MUST NOT 把 helper invoke / activation bridge 当作本期交付。

#### Scenario: phase 1 exposes discovery without invoke
- **WHEN** Phase 1 交付完成
- **THEN** 系统 MUST 提供 discovery、status model、platform adapter 与 availability surface
- **AND** MUST NOT 因为存在 future activation lane 而把 helper invoke 视为已支持

#### Scenario: unknown helper bridgeability keeps phase 1 non-executable
- **WHEN** 官方 helper 是否可被当前宿主稳定桥接仍未被验证
- **THEN** 系统 MUST 保持 status-only contract
- **AND** MUST NOT 暴露误导性的立即执行能力

### Requirement: Availability Status Contract MUST Be Deterministic

系统 MUST 对 `ready / blocked / unavailable / unsupported` 的判定使用固定优先级，并共享最小 blocked reason 枚举。

#### Scenario: unsupported takes precedence over all other states
- **WHEN** 当前运行平台属于本期明确 unsupported 的平台
- **THEN** 系统 MUST 返回 `unsupported`
- **AND** MUST NOT 降级为 `unavailable` 或 `blocked`

#### Scenario: unavailable is used when host or plugin is absent
- **WHEN** 未检测到官方 Codex App 或未检测到官方 plugin
- **THEN** 系统 MUST 返回 `unavailable`
- **AND** blocked reasons MUST 对应 `codex_app_missing` 或 `plugin_missing`

#### Scenario: blocked is used when host exists but prerequisites are unmet
- **WHEN** 已检测到官方宿主与 plugin，但存在 `plugin_disabled`、`helper_missing`、`helper_bridge_unverified`、`permission_required`、`approval_required` 或等价前置条件未满足
- **THEN** 系统 MUST 返回 `blocked`
- **AND** MUST NOT 返回 `ready`

#### Scenario: ready requires zero blocked reasons
- **WHEN** 系统返回 `ready`
- **THEN** blocked reasons MUST 为空
- **AND** 系统 MUST 已确认不存在已知未满足前置条件
