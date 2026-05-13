## ADDED Requirements

### Requirement: CLI Validation MUST Offer Bounded Installer Actions For Codex And Claude

系统 MUST 在 `CLI 验证` 面板中为 Codex 与 Claude Code 提供受控安装 / 更新入口，并且该入口不得扩展到任意 shell 执行。

#### Scenario: Codex install action is offered after missing doctor

- **WHEN** 用户在 Codex tab 运行 doctor
- **AND** doctor 结果显示 Codex CLI 不可用
- **AND** installer preflight 判断 Node/npm 可用
- **THEN** 系统 MUST 提供 “安装最新版” 操作
- **AND** 操作 MUST 通过 backend installer command 执行，而不是 frontend 拼接 shell

#### Scenario: Claude install action is offered after missing doctor

- **WHEN** 用户在 Claude Code tab 运行 doctor
- **AND** doctor 结果显示 Claude CLI 不可用
- **AND** installer preflight 判断 Node/npm 可用
- **THEN** 系统 MUST 提供 “安装最新版” 操作
- **AND** 操作 MUST 通过 backend installer command 执行，而不是 frontend 拼接 shell

#### Scenario: unsupported engine does not expose installer

- **WHEN** 用户切换到 Gemini CLI 或 OpenCode CLI tab
- **THEN** 系统 MUST NOT 展示 Phase 1 installer 操作
- **AND** 这些 engine 的 enable/disable runtime gate MUST 保持当前语义

### Requirement: Installer MUST Use Explicit Plan And User Confirmation

系统 MUST 在执行安装或更新前生成 install plan，并等待用户显式确认。

#### Scenario: install plan is shown before execution

- **WHEN** 用户点击 Codex 或 Claude Code 的安装 / 更新入口
- **THEN** 系统 MUST 展示 install plan
- **AND** plan MUST 包含 engine、action、strategy、execution backend、platform、command preview、warnings 与 blockers
- **AND** 系统 MUST NOT 在用户确认前执行安装命令

#### Scenario: blocked plan remains non-mutating

- **WHEN** install plan 包含 Node/npm 缺失、npm prefix 不可写、权限不足或 unsupported platform blocker
- **THEN** 系统 MUST 禁止执行安装
- **AND** MUST 展示 manual fallback 或 remediation hint
- **AND** MUST NOT 尝试自动修复 Node/npm、权限或 PATH 持久化配置

### Requirement: Installer Backend MUST Enforce Command Whitelist

backend MUST 只允许枚举化安装策略，不得执行 frontend 传入的 raw command。

#### Scenario: frontend cannot pass arbitrary command

- **WHEN** frontend 请求执行 installer
- **THEN** 请求 payload MUST 只包含 engine/action/strategy 等枚举字段
- **AND** backend MUST 根据白名单构造 argv
- **AND** backend MUST reject unknown engine、unknown action、unknown strategy 或不合法组合

#### Scenario: phase one command matrix is bounded

- **WHEN** backend 构造 Phase 1 installer command
- **THEN** Codex install/update MUST 使用 npm global strategy 安装官方 Codex package `@latest`
- **AND** Claude Code install/update MUST 使用 npm global strategy 安装官方 Claude Code package `@latest`
- **AND** Phase 1 MUST NOT execute CLI self-update commands such as `codex --upgrade` or `claude update`
- **AND** CLI self-update MAY be reserved as a future unsupported strategy only

### Requirement: Installer MUST Preserve Platform Boundaries

系统 MUST 对 macOS、Windows native、WSL 与 Linux-like remote 环境保持可解释的平台边界。

#### Scenario: macOS local uses non-Windows process resolution

- **WHEN** desktop app 在 macOS local backend 下执行 installer
- **THEN** backend MUST 使用 macOS 可用的 process resolution 与 PATH 语义
- **AND** MUST NOT 依赖 Windows `.cmd` wrapper 或 Windows shell

#### Scenario: Windows native uses Windows process resolution

- **WHEN** desktop app 在 Windows native local backend 下执行 installer
- **THEN** backend MUST 使用 Windows process resolution
- **AND** MUST NOT 依赖 `/bin/sh`、bash 或 zsh
- **AND** npm / CLI wrapper handling MUST 保持 argv 语义，而不是拼接 raw shell string

#### Scenario: desktop app does not cross-install into WSL

- **WHEN** desktop app 运行在 Windows native 环境
- **AND** 目标 workspace 或 configured path 指向 WSL / Linux boundary
- **THEN** Phase 1 installer MUST NOT 从 Windows desktop 跨边界修改 WSL 用户环境
- **AND** 系统 MUST 提示使用 remote daemon inside WSL/Linux 或展示手动命令

### Requirement: Installer MUST Run Doctor After Mutation

系统 MUST 在安装或更新动作结束后自动运行对应 doctor，并把结果纳入 installer result。

#### Scenario: successful installer refreshes doctor state

- **WHEN** installer command 成功退出
- **THEN** 系统 MUST 自动运行对应 Codex 或 Claude doctor
- **AND** frontend MUST 展示 post-install doctor 结果
- **AND** engine availability SHOULD refresh based on the new doctor state

#### Scenario: failed installer remains diagnosable

- **WHEN** installer command 失败、超时或被拒绝
- **THEN** result MUST 包含结构化 failure details、exit code if available、stdout/stderr summary if available
- **AND** 系统 MUST 保留对应 engine 的 blocked / unavailable 状态
- **AND** MUST NOT silently mark the CLI as installed

### Requirement: Installer MUST Not Escalate Privileges Or Persist Shell Changes

系统 MUST 禁止 installer 自动提权或修改用户 shell 持久化配置。

#### Scenario: no automatic sudo or administrator escalation

- **WHEN** npm global install 因权限不足失败
- **THEN** 系统 MUST return permission blocker
- **AND** MUST NOT 自动执行 `sudo`、管理员提权、UAC 提权、PowerShell policy 修改或等价操作

#### Scenario: installer does not rewrite profile or app settings

- **WHEN** installer 成功或失败
- **THEN** 系统 MUST NOT 自动改写 shell profile、PATH 配置、npm prefix、`codexBin` 或 `claudeBin`
- **AND** 如果用户显式路径仍不可用，doctor MUST 继续展示该 blocker 并提示用户选择 PATH 或更新路径

### Requirement: Installer Output MUST Be Structured And Bounded

installer result MUST 以结构化、可脱敏、可截断的方式返回执行结果，并且长耗时安装 MUST 提供可见的进度反馈。

#### Scenario: output summaries are bounded

- **WHEN** installer 返回 stdout 或 stderr
- **THEN** backend MUST 限制输出摘要长度
- **AND** SHOULD redact common token/key patterns before exposing to frontend
- **AND** MUST include strategy/backend/duration or equivalent diagnostic fields

#### Scenario: running installer streams progress

- **WHEN** 用户确认执行 Codex 或 Claude Code installer
- **THEN** backend MUST emit run-scoped progress events for installer start, stdout/stderr chunks, and completion or error
- **AND** frontend MUST filter events by run id before rendering
- **AND** frontend MUST show live log output or an explicit waiting state while the command is running
- **AND** streamed chunks MUST follow the same redaction and bounded-length rules as final output summaries
