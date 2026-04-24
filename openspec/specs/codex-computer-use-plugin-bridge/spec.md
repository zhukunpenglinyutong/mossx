# codex-computer-use-plugin-bridge Specification

## Purpose

定义 mossx 客户端如何以最小侵入方式桥接本机已安装的官方 `computer-use@openai-bundled` plugin，并在不复制官方 helper 的前提下表达可用性与桥接边界。
## Requirements
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

#### Scenario: broker is lazy and user-triggered
- **WHEN** broker capability is present
- **THEN** it MUST NOT create Codex hidden threads until the user explicitly submits a Computer Use broker task
- **AND** ordinary bridge status refresh MUST remain read-only

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

### Requirement: Availability Status Contract MUST Be Deterministic

系统 MUST 对 `ready / blocked / unavailable / unsupported` 的判定使用固定优先级，并共享最小 blocked reason 枚举。

Phase 1 fixed blocked reason set:

- `platform_unsupported`
- `codex_app_missing`
- `plugin_missing`
- `plugin_disabled`
- `helper_missing`
- `helper_bridge_unverified`
- `permission_required`
- `approval_required`
- `unknown_prerequisite`

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

#### Scenario: ready requires strict minimum prerequisites
- **WHEN** 系统返回 `ready`
- **THEN** 系统 MUST 已确认平台受支持、官方 Codex App 存在、官方 plugin 存在且已启用
- **AND** MUST NOT 依赖“默认推断可用”或“未知即视为可用”的逻辑

#### Scenario: false-positive ready is forbidden when prerequisites are still unverified
- **WHEN** helper bridgeability、系统权限、app approvals 或其他已知关键前置条件仍未确认
- **THEN** 系统 MUST 返回 `blocked`
- **AND** MUST NOT 返回 `ready`

#### Scenario: implementation uses only fixed blocked reason set
- **WHEN** 后端返回已知 blocked reason
- **THEN** 该值 MUST 属于 Phase 1 fixed blocked reason set
- **AND** 实现 MUST NOT 临时返回 spec 未定义的新 reason

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

### Requirement: Bridge MUST Preserve Official Helper Handoff Boundary

系统 MUST 只调查官方支持的 handoff boundary，不得复制、修改、重签名、重打包或伪造官方 Computer Use helper 的 parent contract。

#### Scenario: bridge records official handoff evidence without mutating assets
- **WHEN** host-contract diagnostics 检查 official app bundle、plugin manifest、helper descriptor 或 launch services evidence
- **THEN** 系统 MUST 以只读方式采集 evidence
- **AND** MUST NOT 写入官方 Codex App、plugin cache、helper bundle 或 macOS approval database

#### Scenario: bridge rejects asset mutation as remediation
- **WHEN** diagnostics 判断 direct third-party host 无法满足 helper parent contract
- **THEN** remediation MUST NOT 建议复制、重签名、重打包或替换官方 helper
- **AND** MUST 将结果表达为 `requires_official_parent`、`handoff_unavailable` 或等待官方 API 的等价 guidance

### Requirement: Bridge MUST Not Promote Host Diagnostics To Conversation Runtime

host-contract diagnostics 的任何成功或失败结果 MUST 只影响 Computer Use settings surface 与后续提案决策，不得在本阶段自动开启 conversation runtime integration。

#### Scenario: handoff verified remains diagnostic evidence
- **WHEN** host-contract diagnostics 返回 `handoff_verified`
- **THEN** 系统 MUST 只在 Computer Use surface 展示该证据
- **AND** MUST NOT 自动注册 Computer Use conversation tool、MCP relay 或后台 automation

#### Scenario: host diagnostics failure remains isolated
- **WHEN** host-contract diagnostics 返回 `handoff_unavailable`、`requires_official_parent`、`manual_permission_required` 或 `unknown`
- **THEN** 现有聊天、Codex、MCP、设置与工作区功能 MUST 保持不变
- **AND** MUST NOT 因该失败进入重试循环

### Requirement: Bridge MUST Base Remediation On Official Handoff Evidence

Computer Use bridge 的后续 remediation MUST 基于 official parent handoff discovery evidence，而不是重复 direct exec nested helper。

#### Scenario: host incompatible directs user to handoff discovery
- **WHEN** activation/probe 返回 `host_incompatible`
- **THEN** Computer Use surface MAY 引导用户运行 official parent handoff discovery
- **AND** MUST NOT 建议用户手动运行 nested helper binary

#### Scenario: bridge rejects unsupported handoff workarounds
- **WHEN** 未发现 official handoff method
- **THEN** bridge guidance MUST NOT 推荐复制、重签名、重打包、patch helper 或伪造 parent contract
- **AND** MUST 保持 unavailable / blocked diagnostics state

### Requirement: Bridge MUST Keep Official Asset Boundary During Handoff Discovery

bridge MUST 把 official handoff discovery 视为只读能力，不得成为官方 plugin lifecycle manager。

#### Scenario: plugin state is not mutated during handoff discovery
- **WHEN** handoff discovery 扫描 official plugin manifest 或 marketplace cache
- **THEN** 系统 MUST NOT 修改 plugin enabled state、manifest、cache 或 helper path
- **AND** MUST NOT 将 scanner 输出写回官方 Codex config

### Requirement: Bridge Guidance MUST Distinguish Mac Readiness From Parent Contract Block

Computer Use bridge guidance MUST 把“官方安装态/签名证据可读”和“当前宿主可运行 helper”拆开表达，避免用户把 parent contract 阻塞误判为权限未点完。

#### Scenario: mac evidence is readable but host remains blocked
- **WHEN** Codex App、official plugin、helper path、codesign 或 parent team evidence 可读
- **THEN** UI MAY 表达 Mac-side evidence is readable
- **AND** MUST NOT 将其等同于 `ready`

#### Scenario: unsupported workaround is rejected in user guidance
- **WHEN** parent contract verdict 已经出现
- **THEN** guidance MUST NOT 推荐 direct exec nested helper、复制 helper、重签名、patch bundle 或修改官方 plugin cache
- **AND** MUST 建议等待官方 handoff/API 或继续 diagnostics-only

### Requirement: Bridge MUST Distinguish CLI Cache Contract From App Bundle Contract

Computer Use bridge MUST not treat all nested app-bundle helper paths as the same launch contract.

#### Scenario: cli cache helper is preferred over app bundled helper
- **WHEN** both Codex CLI plugin cache and Codex.app bundled plugin contain Computer Use descriptors
- **THEN** bridge MUST prefer the CLI cache descriptor
- **AND** MUST show the cache descriptor/helper paths in status diagnostics

#### Scenario: direct helper workaround remains rejected
- **WHEN** helper launch contract requires Codex CLI or Codex App parent
- **THEN** bridge guidance MUST NOT instruct users to manually execute `SkyComputerUseClient`
- **AND** MUST explain that Codex CLI is the supported parent path for the CLI plugin cache
