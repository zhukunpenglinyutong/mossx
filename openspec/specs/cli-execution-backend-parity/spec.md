## Purpose

定义 `CLI 验证` 面板中的 shared execution backend 语义，以及 Claude / engine / history / doctor 在 remote backend 下的 forwarding parity 契约。
## Requirements
### Requirement: CLI Validation MUST Expose Shared Execution Backend Controls

系统 MUST 将 `backendMode / remoteBackendHost / remoteBackendToken` 作为 `CLI 验证` 面板内的 shared execution backend 配置展示，而不是继续作为 `Codex` tab 内的隐含专属配置。系统同时 MUST 在该区域提供 `Codex / Claude Code / Gemini CLI / OpenCode CLI` tabs，其中 `Gemini CLI` 与 `OpenCode CLI` 必须具备显式 enable/disable control。

#### Scenario: execution backend controls are shared above engine-specific tabs

- **WHEN** 用户进入 `CLI 验证` 面板
- **THEN** 系统 MUST 在 `Codex / Claude Code / Gemini CLI / OpenCode CLI` tabs 之外展示 shared execution backend 区块
- **AND** 该区块 MUST 至少包含 `backendMode`
- **AND** 当 `backendMode = remote` 时，系统 MUST 展示 `remoteBackendHost` 与 `remoteBackendToken`
- **AND** 用户 MUST 不需要切到任一 engine tab 才能发现这些 transport 配置

#### Scenario: Gemini and OpenCode tabs expose hard disable controls

- **WHEN** 用户切换到 `Gemini CLI` 或 `OpenCode CLI` tab
- **THEN** 系统 MUST 展示该 engine 的显式 enable/disable 控件
- **AND** 该控件 MUST 持久化到 app settings
- **AND** 它 MUST 表示真正的 runtime gate，而不是仅隐藏 UI

#### Scenario: disabled engine closes its entry surfaces

- **WHEN** 用户将 `Gemini CLI` 或 `OpenCode CLI` 切换为 disabled
- **THEN** 系统 MUST 关闭对应 engine 的 selector / workspace 入口 / CLI 验证下的运行入口
- **AND** 系统 MUST NOT 再把该 engine 暴露为可选 active engine

### Requirement: Remote Backend MUST Forward Engine RPCs For Claude Parity

当 `backendMode = remote` 时，系统 MUST 将 Claude/engine 关键命令转发到 remote daemon，而不是继续只在本地桌面进程执行。

#### Scenario: engine send message forwards through remote backend

- **WHEN** `backendMode = remote`
- **AND** 用户以 Claude 或其他非 Codex engine 触发消息发送
- **THEN** 系统 MUST 通过 remote backend 转发 `engine_send_message` / `engine_send_message_sync`
- **AND** MUST NOT 出现 “Codex 使用 daemon、Claude 仍本地执行” 的分叉

#### Scenario: engine status and interrupt commands honor remote mode

- **WHEN** `backendMode = remote`
- **THEN** `detect_engines`、`get_active_engine`、`switch_engine`、`get_engine_status`、`get_engine_models`、`engine_interrupt` 与 `engine_interrupt_turn` MUST 与 remote daemon 对齐
- **AND** 前端 MUST 接收到与 local mode 等价的结构化结果或可解释错误

### Requirement: Remote Backend MUST Support Claude Session History Actions

当 `backendMode = remote` 时，Claude Code 会话历史相关操作 MUST 能通过 daemon 执行，保持与本地模式一致的基本能力。

#### Scenario: claude history actions work in remote mode

- **WHEN** `backendMode = remote`
- **THEN** `list_claude_sessions`、`load_claude_session`、`fork_claude_session`、`fork_claude_session_from_message`、`delete_claude_session` MUST 通过 remote daemon 可用
- **AND** 系统 MUST NOT 因缺少 daemon handler 导致部分操作 silently unavailable

#### Scenario: gemini history delete parity remains intact

- **WHEN** `backendMode = remote`
- **THEN** `list_gemini_sessions`、`load_gemini_session`、`delete_gemini_session` MUST 与 daemon 对齐
- **AND** 现有非 Claude engine 的 session history 行为 MUST NOT 因本次扩 scope 回退

### Requirement: Doctor Commands MUST Honor Remote Execution Backend

系统 MUST 让 `codex_doctor` 与 `claude_doctor` 在 remote mode 下能够针对 remote daemon 环境执行，而不是只诊断本地桌面进程。

#### Scenario: running claude doctor in remote mode diagnoses daemon environment

- **WHEN** `backendMode = remote`
- **AND** 用户在 `CLI 验证` 中触发 `Run Claude Doctor`
- **THEN** 系统 MUST 通过 remote backend 执行 `claude_doctor`
- **AND** 返回结果 MUST 反映 remote daemon 的 reachability / binary resolution 语义

#### Scenario: explicit doctor bin still wins over daemon defaults

- **WHEN** 用户在 `CLI 验证` 中输入了显式 `claudeBin` 或 `codexBin`
- **AND** 随后触发对应 doctor
- **THEN** doctor MUST 优先使用该显式 bin 值
- **AND** remote mode 下该显式值 MUST 原样透传给 daemon command

### Requirement: Desktop Transport Settings MUST Remain Separate From Remote Daemon Settings

系统 MUST 明确区分 desktop app 的 transport 配置与 remote daemon 自身的 CLI settings，避免暗中把两者混为一谈。

#### Scenario: saving remote transport host does not claim to rewrite daemon cli settings

- **WHEN** 用户保存 `remoteBackendHost` 或 `remoteBackendToken`
- **THEN** 系统 MUST 仅将其视为 desktop app 的 transport 配置
- **AND** MUST NOT 隐式宣称这会同步更新 remote daemon 的 `claudeBin` / `codexBin` 或其他 app settings

#### Scenario: remote daemon keeps its own settings source of truth

- **WHEN** remote daemon 执行 Claude / Codex runtime 或 doctor 命令
- **THEN** 它 MAY 继续读取自己的 app settings 作为默认值来源
- **AND** desktop app 与 remote daemon 的 settings source-of-truth 边界 MUST 保持可解释

