# claude-history-transcript-visibility Specification

## Purpose
TBD - created by archiving change fix-claude-history-transcript-blanking. Update Purpose after archive.
## Requirements
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

### Requirement: Claude History MUST Filter Cross-Engine Control Plane Contamination

Claude history parsing MUST filter Codex or GUI control-plane payloads before projecting user-visible sessions or messages.

#### Scenario: control-plane payload is not used as first message
- **WHEN** a Claude JSONL entry contains control-plane text such as JSON-RPC `initialize`, `clientInfo.name=ccgui`, `capabilities.experimentalApi`, `developer_instructions`, or Codex `app-server` launch text
- **THEN** the backend scanner MUST NOT use that text as the session first user message
- **AND** it MUST NOT derive a user-visible session title from that text

#### Scenario: control-plane-only transcript is omitted from session list
- **WHEN** a Claude history transcript contains no real user or assistant conversation after filtering control-plane entries
- **THEN** the backend MUST omit that transcript from the visible Claude session list
- **AND** the frontend MUST NOT recreate a visible conversation from the filtered entries

#### Scenario: mixed transcript keeps valid messages
- **WHEN** a Claude history transcript contains real conversation messages and control-plane contamination
- **THEN** the backend MUST keep the valid conversation messages
- **AND** the frontend loader MUST keep the valid conversation messages if it receives a mixed payload

#### Scenario: normal Claude messages are not over-filtered
- **WHEN** a real user message mentions terms such as `app-server` without matching high-confidence control-plane structure
- **THEN** the system MUST keep that message visible
- **AND** it MUST NOT hide normal conversation content solely because it contains a keyword

### Requirement: Claude History Contamination Filtering MUST Be Cross-Platform

Claude history contamination filtering MUST behave consistently on Windows and macOS because polluted JSONL shape is engine-protocol based rather than OS-specific.

#### Scenario: Windows polluted transcript is filtered
- **WHEN** Windows Claude history contains Codex control-plane payloads produced through wrapper, PATH, or proxy misrouting
- **THEN** the system MUST filter those payloads using the same contamination rules
- **AND** it MUST avoid showing `app-server` or `developer` pseudo sessions

#### Scenario: macOS polluted transcript is filtered
- **WHEN** macOS Claude history contains Codex control-plane payloads produced through custom binary or PATH misrouting
- **THEN** the system MUST filter those payloads using the same contamination rules
- **AND** it MUST preserve real Claude conversation content in mixed transcripts

### Requirement: Claude History Filtering MUST Be Protected By CI Gates

Claude history contamination filtering MUST be covered by backend and frontend tests.

#### Scenario: backend tests cover session scanner behavior
- **WHEN** backend tests exercise Claude history scanning
- **THEN** they MUST prove control-plane-only JSONL transcripts do not produce visible session summaries
- **AND** they MUST prove mixed transcripts retain real user messages

#### Scenario: frontend tests cover loader fallback behavior
- **WHEN** frontend tests exercise Claude history loader parsing
- **THEN** they MUST prove control-plane messages are skipped
- **AND** they MUST prove normal Claude messages remain visible

### Requirement: Claude History Reasoning MUST Respect Thinking Visibility

Claude history restore MUST preserve reasoning transcript data while applying the current Claude thinking visibility state to the user-visible conversation canvas.

#### Scenario: hidden thinking suppresses history reasoning text
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is disabled
- **AND** restored Claude history contains `thinking` or `reasoning` blocks
- **THEN** the system MUST NOT render those reasoning blocks as visible reasoning body text in the conversation canvas
- **AND** the underlying parsed transcript data MUST NOT be physically deleted solely because it is hidden

#### Scenario: visible thinking restores history reasoning text
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is enabled
- **AND** restored Claude history contains `thinking` or `reasoning` blocks
- **THEN** the system MUST be allowed to render those blocks through the existing reasoning presentation

#### Scenario: hidden reasoning does not create empty thread regression
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is disabled
- **AND** restored history contains hidden reasoning plus assistant, tool, approval, or transcript fallback surfaces
- **THEN** the system MUST NOT render the thread as `messages.emptyThread`
- **AND** it MUST preserve the remaining visible transcript surfaces

#### Scenario: reasoning-only history avoids content leakage
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is disabled
- **AND** restored history contains only reasoning transcript content and no other visible transcript surface
- **THEN** the system MUST NOT reveal the hidden reasoning body text
- **AND** it SHOULD show a non-content-leaking placeholder instead of treating the transcript as corrupted

### Requirement: Claude History Reasoning Visibility MUST Be Reversible

The system MUST allow Claude history reasoning presentation to follow later visibility changes without requiring the history transcript to be regenerated.

#### Scenario: re-enable thinking after hidden restore
- **WHEN** a Claude history conversation was restored while thinking visibility was disabled
- **AND** the user later enables Claude thinking visibility
- **THEN** the system SHOULD be able to display the previously hidden reasoning from retained transcript data
- **AND** it MUST NOT require creating a new Claude session to recover that reasoning presentation
