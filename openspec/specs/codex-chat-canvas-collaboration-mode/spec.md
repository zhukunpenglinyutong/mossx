# codex-chat-canvas-collaboration-mode Specification

## Purpose

Define deterministic collaboration mode behavior in Codex chat so default mode, user overrides, and turn-level effective
mode stay observable and consistent without affecting non-Codex engines.
## Requirements
### Requirement: Collaboration Mode Switch Consistency

Codex 会话默认协作模式 MUST 为 `Default`（运行时 `code`），且用户选择的协作模式 MUST 在后续消息中形成可观测且可验证的有效模式。

#### Scenario: default collaboration mode for codex resolves to default runtime

- **GIVEN** 用户进入新的 Codex 会话
- **AND** 用户尚未显式选择协作模式
- **WHEN** 协作模式初始化并准备发送首轮消息
- **THEN** 默认 UI 模式 MUST 为 `Default`
- **AND** 默认运行时模式 MUST 为 `code`

#### Scenario: explicit user selection overrides default

- **GIVEN** 用户手动切换为 Plan 或 Default
- **WHEN** 后续消息发送与会话继续
- **THEN** 系统 MUST 使用用户最终选择作为本轮模式输入
- **AND** 不得被默认值再次覆盖

#### Scenario: effective mode is emitted for codex turn start

- **GIVEN** 用户已选择协作模式
- **WHEN** 系统发起 Codex `turn/start`
- **THEN** 系统 MUST 产出该线程的 `selected_ui_mode` 与 `effective_runtime_mode`
- **AND** MUST 提供可观测信息用于确认本轮实际生效模式

#### Scenario: non-codex engines are not affected

- **WHEN** 当前活动引擎为 `claude` 或 `opencode`
- **THEN** 本协作模式机制 MUST NOT 改变其既有行为

### Requirement: Codex Assistant Reply De-duplication

在 Codex 模式下，同一 assistant turn 的最终渲染文本 MUST 不得出现整句或段落级重复拼接。

#### Scenario: duplicate stream chunks are merged into one final reply

- **WHEN** 同一 assistant turn 接收到语义重复的流式片段
- **THEN** 系统 MUST 在最终消息中去重
- **AND** 用户可见回复 MUST 仅保留一份有效文本

#### Scenario: short greeting turn is rendered once

- **WHEN** 用户发送简短问候（例如 `你好`）
- **THEN** 助手最终回复 MUST 只出现一次
- **AND** MUST NOT 出现同一问候语重复拼接

#### Scenario: deduplication does not change non-codex behavior

- **WHEN** 当前活动引擎为 `claude` 或 `opencode`
- **THEN** 本去重策略 MUST NOT 改变其既有渲染行为

### Requirement: User Bubble SHALL Preserve User Input Formatting Fidelity

用户在输入框中的原始文本结构（如换行、空行、缩进、编号与列表节奏）在聊天幕布的用户气泡中 MUST 保持可见一致，不得被显示层压平或重排。

#### Scenario: multi-line structured input keeps visible structure in user bubble

- **GIVEN** 用户消息文本在展示阶段已完成 `[User Input]` 提取
- **WHEN** 用户消息气泡渲染该文本
- **THEN** UI MUST 保留用户输入中的换行、空行、缩进与编号层级
- **AND** MUST NOT 将结构化输入压平为单段连续文本

#### Scenario: formatting fidelity is display-only and does not mutate raw message payload

- **GIVEN** 用户消息包含任意结构化文本
- **WHEN** 系统应用用户气泡格式保真展示
- **THEN** 该转换 MUST 仅作用于展示文本
- **AND** 消息原始文本值 MUST 保持不变

#### Scenario: copy action remains bound to original message text

- **GIVEN** 用户消息气泡显示了格式保真后的文本
- **WHEN** 用户点击复制消息
- **THEN** 复制内容 MUST 继续使用原始消息文本
- **AND** MUST NOT 把 display-only 展示结果写回消息正文

#### Scenario: license block is treated as one example under the same generic rule

- **GIVEN** 用户输入包含 `BEGIN LICENSE ... END LICENSE` 区块
- **WHEN** 用户消息气泡渲染文本
- **THEN** 系统 MUST 以与其他结构化输入一致的通用规则保留其结构可读性
- **AND** MUST NOT 通过 license-only 特判替代通用格式保真能力

### Requirement: External Spec Root Prompt Injection SHALL Be First-Turn Only In Codex

当 workspace 配置了外部 Spec 根目录时，Codex 发送链路对提示文本的自动拼接 MUST 仅在新会话首条消息发生一次，避免后续轮次重复噪音。

#### Scenario: first codex turn prepends spec root context

- **GIVEN** 当前线程为 Codex
- **AND** workspace 已配置可用的外部 Spec 根目录
- **AND** 线程尚无历史消息
- **WHEN** 用户发送首条消息
- **THEN** 系统 MAY 自动拼接 `[Session Spec Link]` 与 `[Spec Root Priority]` 上下文提示
- **AND** 该拼接 MUST 与本轮用户输入共同下发

#### Scenario: follow-up codex turns do not prepend spec root context repeatedly

- **GIVEN** 当前线程为 Codex
- **AND** workspace 已配置外部 Spec 根目录
- **AND** 线程已存在历史消息
- **WHEN** 用户发送后续消息
- **THEN** 系统 MUST NOT 再次自动拼接 `[Session Spec Link]` 或 `[Spec Root Priority]`
- **AND** 用户消息正文 MUST 保持原始输入语义

#### Scenario: custom spec root path propagation remains intact after first-turn gating

- **GIVEN** workspace 已配置外部 Spec 根目录
- **WHEN** Codex 发送任意轮次消息
- **THEN** 系统 MUST 继续透传 `customSpecRoot` 路径上下文到后端发送参数
- **AND** 首条提示注入收敛 MUST NOT 影响 Spec 根路径可用性

### Requirement: Codex Queued Follow-up Fusion SHALL Preserve Collaboration Payload Stability

在 Codex 会话中，排队消息融合 MUST 复用当前线程已解析的 collaboration payload，并保持默认 mode 选择稳定。

#### Scenario: queued codex item reuses current collaboration payload
- **GIVEN** 当前活动引擎为 `codex`
- **AND** 当前线程存在已解析的 collaboration payload
- **WHEN** 用户执行排队消息融合
- **THEN** 系统 MUST 以当前线程已解析的 collaboration payload 发送该条消息
- **AND** 系统 MUST NOT 因融合动作重置或覆盖该 payload

#### Scenario: fused codex item does not mutate default collaboration mode
- **GIVEN** 当前活动引擎为 `codex`
- **AND** 当前线程存在既定的 collaboration mode 选择
- **WHEN** 用户执行排队消息融合
- **THEN** 系统 MUST NOT 将该动作解释为默认 collaboration mode 切换
- **AND** 该线程后续普通发送的默认 mode 语义 MUST 保持不变

### Requirement: Collaboration Mode Visibility MUST Be App-Local

Codex collaboration mode 的 UI 可见性、快捷键注册和模式列表请求 MUST 只受桌面端 app-local settings 控制，不得再被 external `config.toml` 中的历史 feature flags 反向覆盖。

#### Scenario: local setting enables collaboration mode UI

- **GIVEN** 桌面端本地 settings 中 `experimentalCollaborationModesEnabled=true`
- **WHEN** 用户进入 Codex 会话
- **THEN** 系统 MUST 按本地 setting 显示 collaboration selector
- **AND** MAY 注册 collaboration 快捷键与模式列表请求

#### Scenario: historical external flag does not override local collaboration UI state

- **GIVEN** `~/.codex/config.toml` 中存在 `collaboration_modes=false`
- **AND** 桌面端本地 settings 中 `experimentalCollaborationModesEnabled=true`
- **WHEN** 用户进入 Codex 会话或重新加载 settings
- **THEN** 系统 MUST 继续以本地 setting 为准
- **AND** MUST NOT 因 external historical flag 隐藏 collaboration mode UI

### Requirement: Dead Multi-Agent Toggle MUST NOT Masquerade As Active Collaboration Capability

若桌面端保留 legacy `experimentalCollabEnabled` 字段用于兼容，其行为 MUST 为 inert，不得继续作为真实 capability 开关对外生效。

#### Scenario: legacy collab field does not control collaboration mode behavior

- **GIVEN** `experimentalCollabEnabled` 存在于历史 settings 数据中
- **WHEN** 系统初始化 Codex collaboration 相关能力
- **THEN** 系统 MUST NOT 使用该字段决定 collaboration mode UI、mode payload 或 runtime policy
- **AND** MUST 以真实本地设置字段维持行为一致性

