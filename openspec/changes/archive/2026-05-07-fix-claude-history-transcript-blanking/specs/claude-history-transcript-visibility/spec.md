## ADDED Requirements

### Requirement: Claude History Restore MUST Preserve A Readable Transcript Surface

当 `Claude Code` 历史会话的 transcript 主要由 `thinking`、`tool_use`、`tool_result` 组成且普通 assistant 正文极少时，系统 MUST 在 history restore 后保留至少一个可读 transcript surface，不得把该会话误判为 empty thread。

#### Scenario: transcript-heavy Claude history does not render as an empty thread

- **WHEN** 当前引擎为 `claude`
- **AND** 当前线程来自 history restore / reopen，而不是 realtime processing
- **AND** 该会话存在多条 `reasoning` 或 `tool` transcript
- **AND** 普通 assistant `text` 非常少或为空
- **THEN** 消息区 MUST 保留至少一个可读 transcript surface
- **AND** 系统 MUST NOT 渲染为 `messages.emptyThread`

### Requirement: Claude Transcript Fallback MUST Stay Engine-Scoped

针对 transcript-heavy history 的 fallback MUST 限定在 `Claude Code` 引擎，不得扩散到其他引擎。

#### Scenario: non-Claude engines do not inherit Claude transcript fallback

- **WHEN** 当前引擎为 `codex`、`gemini` 或 `opencode`
- **THEN** 系统 MUST NOT 自动套用 `Claude` history transcript fallback
- **AND** 这些引擎既有 history visible-surface contract MUST 保持不变

### Requirement: Claude History Fallback MUST Not Inflate Ordinary Histories

该 fallback MUST 仅用于“空白误判保护”，系统 MUST NOT 把普通 `Claude` 历史统一变成高噪声 command transcript 视图。

#### Scenario: ordinary Claude history keeps the existing text-first reading surface

- **WHEN** 当前引擎为 `claude`
- **AND** 历史会话本身已经包含正常的 assistant 正文消息
- **THEN** 系统 MUST 继续保持现有 text-first 历史阅读体验
- **AND** MUST NOT 仅因为存在 command transcript 就强制展示额外高噪声 tool surface
