## MODIFIED Requirements

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
