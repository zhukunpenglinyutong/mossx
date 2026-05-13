## MODIFIED Requirements

### Requirement: Doctor And Installer Commands MUST Honor Remote Execution Backend

系统 MUST 让 `codex_doctor`、`claude_doctor` 以及 CLI installer plan/run 在 remote mode 下针对 remote daemon 环境执行，而不是只诊断或修改本地桌面进程。

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

#### Scenario: install plan in remote mode describes daemon environment

- **WHEN** `backendMode = remote`
- **AND** 用户请求 Codex 或 Claude Code install plan
- **THEN** 系统 MUST 通过 remote backend 请求 daemon 生成 install plan
- **AND** plan MUST 明确标记 execution backend 为 remote
- **AND** plan MUST NOT claim to inspect or modify the desktop app host environment

#### Scenario: installer run in remote mode mutates daemon environment only

- **WHEN** `backendMode = remote`
- **AND** 用户确认执行 Codex 或 Claude Code installer
- **THEN** 系统 MUST 通过 remote backend 在 daemon 环境执行 installer
- **AND** desktop app MUST NOT 在本机同时执行 installer
- **AND** installer result MUST reflect daemon-side command execution and post-install doctor result

#### Scenario: old remote daemon lacks installer rpc

- **WHEN** `backendMode = remote`
- **AND** remote daemon does not support installer plan/run RPC
- **THEN** desktop app MUST show an explainable unsupported-daemon error
- **AND** MUST NOT fallback to local desktop installation unless user switches backend mode to local
