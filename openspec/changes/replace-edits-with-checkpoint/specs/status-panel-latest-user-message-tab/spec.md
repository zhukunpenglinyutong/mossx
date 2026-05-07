## MODIFIED Requirements

### Requirement: Dock Status Panel MUST Expose User Conversation Tab Across Supported Engines

系统 MUST 在右下角 `dock` 状态面板中提供 `用户对话` Tab，并在当前已接入底部状态面板的 `Claude / Codex / Gemini` 会话中保持一致可见。

#### Scenario: dock panel shows user conversation tab for supported engines

- **WHEN** 用户进入使用底部 `dock` 状态面板的 `Claude`、`Codex` 或 `Gemini` 会话
- **THEN** 状态面板 MUST 展示 `用户对话` Tab
- **AND** 该 Tab MUST 与既有 `任务 / 子代理 / 结果 / Plan` Tab 并列存在

#### Scenario: existing tabs remain reachable after adding user conversation tab

- **WHEN** 系统将原 `最新对话` 能力升级为 `用户对话` Tab 后
- **THEN** 既有 `任务 / 子代理 / 结果 / Plan` Tab MUST 保持原有访问方式
- **AND** 新 Tab MUST NOT 替代或隐藏现有状态面板能力
