# codex-collaboration-mode-runtime-enforcement Specification

## Purpose

Define deterministic runtime enforcement for Codex collaboration modes so `plan/code` is locally executable, observable, and restart-consistent rather than best-effort passthrough only.
## Requirements
### Requirement: Effective Collaboration Mode Resolution

系统 MUST 在 Codex 消息发送链路中计算并输出线程级 `effective_mode`，并将 UI 模式 `default` 规范映射为运行时 `code`。

#### Scenario: explicit mode resolves to effective mode

- **GIVEN** 用户在 Codex 会话中显式选择 `plan` 或 `default`
- **WHEN** 系统发起 `turn/start`
- **THEN** 系统 MUST 计算 `effective_mode`
- **AND** `default` MUST 解析为 `effective_mode=code`

#### Scenario: missing or invalid mode falls back deterministically

- **GIVEN** 请求中的协作模式缺失或非法
- **WHEN** 系统计算协作模式
- **THEN** 系统 MUST 回退到确定性默认模式
- **AND** MUST 记录 `fallback_reason`

### Requirement: Thread-Level Mode State Consistency

系统 MUST 在同一线程多轮对话中保持协作模式一致性，并定义 fork/resume 的继承规则。

#### Scenario: same thread keeps effective mode across turns

- **GIVEN** 线程 T 已计算出 `effective_mode=plan`
- **WHEN** 线程 T 发起后续 turn 且未显式切换模式
- **THEN** 系统 MUST 继续使用 `effective_mode=plan`

#### Scenario: fork or resume inherits mode unless explicitly overridden

- **GIVEN** 子线程或恢复线程来源于已有模式线程
- **WHEN** 新线程未提供显式模式
- **THEN** 系统 MUST 继承来源线程的 `effective_mode`
- **AND** 若请求显式指定模式，MUST 以显式指定覆盖继承结果

### Requirement: Mode-Aware RequestUserInput Enforcement

系统 MUST 根据策略 profile 决定 `requestUserInput` 的处理方式，并保证行为可观测。

#### Scenario: official-compatible keeps request user input flow

- **GIVEN** 当前 profile 为 `official-compatible`
- **WHEN** 系统收到 `item/tool/requestUserInput`
- **THEN** 系统 MUST 保持标准交互提问流程
- **AND** MUST NOT 因 `effective_mode=code` 自动阻断

#### Scenario: strict-local blocks request user input flow in code mode

- **GIVEN** 当前 profile 为 `strict-local`
- **AND** 当前线程 `effective_mode=code`
- **WHEN** 系统收到 `item/tool/requestUserInput`
- **THEN** 系统 MUST 阻断该事件进入交互卡片流程
- **AND** MUST 发出标准化阻断提示事件

#### Scenario: plan mode preserves request user input flow in all profiles

- **GIVEN** 当前线程 `effective_mode=plan`
- **WHEN** 系统收到 `item/tool/requestUserInput`
- **THEN** 系统 MUST 保持现有交互提问流程
- **AND** MUST NOT 误触发阻断提示

### Requirement: Collaboration Mode Observability

系统 MUST 为每轮协作模式决策输出结构化可观测字段，支持问题定位与回归审计。

#### Scenario: logs include selected and effective mode metadata

- **WHEN** 系统发送 Codex 用户消息并启动 turn
- **THEN** 调试或日志输出 MUST 包含 `selected_mode` 与 `effective_mode`
- **AND** MUST 包含 `policy_version`
- **AND** 当发生降级时 MUST 包含 `fallback_reason`

### Requirement: Plan Readonly Enforcement

系统 MUST 在 `effective_mode=plan` 时执行只读硬约束，而不是仅依赖提示词约束。

#### Scenario: plan mode blocks write file operations

- **GIVEN** 当前线程 `effective_mode=plan`
- **WHEN** 发生写文件操作（如 apply_patch 或等效写入工具）
- **THEN** 系统 MUST 阻断该操作
- **AND** MUST 记录阻断原因

#### Scenario: plan mode blocks repo-mutating commands

- **GIVEN** 当前线程 `effective_mode=plan`
- **WHEN** 执行会改变仓库状态的命令
- **THEN** 系统 MUST 阻断该命令
- **AND** MUST 提示切换到 `Default`

#### Scenario: default mode keeps normal execution path

- **GIVEN** 当前线程 `effective_mode=code`
- **WHEN** 执行读写与命令路径
- **THEN** 系统 MUST 按既有审批/沙箱策略允许执行

### Requirement: User-visible Content Hygiene for Mode Policy

模式策略注入 MUST NOT 污染用户可见正文。

#### Scenario: runtime policy does not inject code wording into user-visible message

- **WHEN** 系统为运行时注入模式策略
- **THEN** 用户可见消息正文 MUST NOT 包含 `Collaboration mode: code`
- **AND** 策略信息 SHOULD 保留在系统指令或不可见元数据层

### Requirement: Collaboration Policy Profile Selection

系统 MUST 为 Codex 协作模式策略提供 profile 选择，并将默认 profile 设为官方兼容语义。

#### Scenario: official-compatible is default profile

- **WHEN** 系统在未显式配置 profile 的情况下启动 Codex 通道
- **THEN** 有效 profile MUST 为 `official-compatible`
- **AND** MUST 记录当前 profile 供可观测与回归审计

#### Scenario: strict-local profile remains available for controlled rollout

- **WHEN** 运维或实验配置启用 `strict-local`
- **THEN** 系统 MUST 启用本地增强阻断策略
- **AND** 该策略 MUST 仅作用于 Codex 通道

### Requirement: Runtime Enforcement Setting MUST Remain App-Local

Codex collaboration mode runtime enforcement 的启停 MUST 由桌面端 app-local settings 控制，而不是由 external `config.toml` 中的历史 feature flag 决定。

#### Scenario: local enforcement setting controls runtime policy

- **GIVEN** 桌面端本地 settings 中 `codexModeEnforcementEnabled=false`
- **WHEN** 系统计算 Codex turn 的 execution policy
- **THEN** 系统 MUST 以本地 setting 决定是否启用 plan/code enforcement
- **AND** MUST NOT 读取 external `collaboration_mode_enforcement` 作为覆盖来源

#### Scenario: historical external enforcement flag is ignored

- **GIVEN** `~/.codex/config.toml` 中存在 `collaboration_mode_enforcement=true`
- **AND** 桌面端本地 settings 中 `codexModeEnforcementEnabled=false`
- **WHEN** 系统启动 Codex session、恢复 settings 或发送消息
- **THEN** 系统 MUST 继续以本地 setting 为准
- **AND** MUST NOT 因 historical external flag 恢复本地 enforcement

### Requirement: Steer Queue Behavior MUST Remain App-Local

Codex queued follow-up continuation 与 steer 相关行为 MUST 由桌面端本地 setting 控制，不得依赖 external `steer` feature flag。

#### Scenario: local steer setting controls queued follow-up behavior

- **GIVEN** 桌面端本地 settings 中 `experimentalSteerEnabled=true`
- **WHEN** 当前 Codex 线程处于 processing 状态且用户继续发送消息
- **THEN** 系统 MUST 以本地 setting 决定 same-run continuation / queue fusion 行为
- **AND** MUST NOT 读取 external `steer` 作为行为开关

