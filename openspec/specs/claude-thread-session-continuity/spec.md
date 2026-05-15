# claude-thread-session-continuity Specification

## Purpose

TBD - synced from change fix-claude-thread-session-continuity. Update Purpose after archive.
## Requirements
### Requirement: Claude Pending-To-Session Rebind MUST Converge On One Canonical Conversation

系统 MUST 将 `claude-pending-*` 与对应的 finalized `claude:<sessionId>` 收敛为同一条 canonical conversation identity，而不是允许两条用户可见会话同时承接同一轮任务。

#### Scenario: active pending claude turn rebinds into finalized session

- **WHEN** 当前活动 `Claude` turn 起始于 `claude-pending-*`
- **AND** runtime 后续为同一条任务解析出 finalized native `sessionId`
- **THEN** 系统 MUST 将 active selection、processing state、已可见 items 与待处理 request continuity 收敛到 canonical finalized thread
- **AND** 系统 MUST NOT 留下第二条看似也在承接该 turn 的用户可见 `Claude` conversation

#### Scenario: ambiguous session update does not create a ghost replacement conversation

- **WHEN** `Claude` session-id update 无法被安全配对到当前 active pending lineage
- **THEN** 系统 MUST 将当前会话置于 reconcile 或 recoverable failure 分支
- **AND** 系统 MUST NOT 静默把一个不相关的新 `Claude` thread 当作原会话的 replacement surface

#### Scenario: pending follow-up does not resume with provisional session id

- **WHEN** 用户在 `claude-pending-*` 首轮启动后立即发送第二条消息
- **AND** 系统尚未收到可安全配对到该 pending turn 的 native `sessionId`
- **THEN** 系统 MUST NOT 调用 Claude CLI continuation with `--resume <provisionalSessionId>`
- **AND** 系统 MUST NOT 将 `engine_send_message` 启动响应中的 provisional `sessionId` 当作 provider-native resume truth
- **AND** 系统 SHOULD 进入可恢复的等待、重试或显式阻止发送状态

#### Scenario: pending follow-up reconciles from validated candidate transcript

- **WHEN** 用户在 `claude-pending-*` 首轮启动后发送后续消息
- **AND** native `thread/started` confirmation 尚未成功配对到该 pending thread
- **AND** `engine_send_message` response 提供了 candidate `sessionId`
- **AND** 系统通过 `loadClaudeSession(candidateSessionId)` 读取到该 session 的 displayable assistant/tool/reasoning evidence
- **THEN** 系统 MUST 将 `claude-pending-*` rebind 为 `claude:<candidateSessionId>`
- **AND** 后续发送 MUST resume with `<candidateSessionId>`
- **AND** 系统 MUST NOT 在 transcript 验证之前用该 candidate 构造 `--resume`

#### Scenario: missing or empty candidate transcript keeps pending recoverable

- **WHEN** `claude-pending-*` 只有 response-derived candidate `sessionId`
- **AND** candidate transcript 不存在、加载失败、解析后没有 displayable history rows，或只有 user rows 而没有 assistant/tool/reasoning evidence
- **THEN** 系统 MUST keep the pending thread in recoverable waiting/blocking state
- **AND** 系统 MUST NOT promote the candidate into canonical native session truth

#### Scenario: follow-up after native session confirmation resumes native session

- **WHEN** `claude-pending-*` 已通过 native `thread/started` event 收敛为 `claude:<nativeSessionId>`
- **AND** 用户发送后续消息
- **THEN** 系统 MUST resume with `<nativeSessionId>`
- **AND** 系统 MUST NOT resume with the earlier provisional response-derived id

### Requirement: Claude Approval And RequestUserInput Resume MUST Stay Bound To Canonical Thread

`Claude` 的 file approval 与 `requestUserInput` 恢复链路 MUST 继续附着在当前 canonical conversation 上，不得让原会话停在旧 thread、而真实 continuation 跑到另一个 ghost thread。

#### Scenario: successful file approval continue stays in the same visible conversation

- **WHEN** 用户在 `Claude` 会话中提交 file approval
- **AND** 该 approval 对应的原始 thread id 已被 canonical resolve 到另一个 thread
- **THEN** 系统 MUST 将 processing state、后续 assistant/tool activity 与终态结果附着到 canonical thread
- **AND** 用户 MUST 在原可见会话里继续看到任务推进与最终结果

#### Scenario: successful request user input submit stays in the same visible conversation

- **WHEN** 用户在 `Claude` 会话中提交 `requestUserInput` 响应
- **AND** 该请求携带的旧 thread id 已存在已验证的 canonical replacement
- **THEN** 系统 MUST 将提交摘要、恢复后的 processing 状态与后续 continuation 路由到 canonical thread
- **AND** 原会话 MUST NOT 在提交后进入永久假死或无后续结果状态

#### Scenario: request user input before native confirmation does not invent resume identity

- **WHEN** `requestUserInput` 或 approval 恢复发生在 pending Claude thread 尚未确认 native session id 时
- **THEN** 系统 MUST NOT 使用 provisional response-derived id 构造 `--resume`
- **AND** 系统 MUST wait for canonical native session truth or fail recoverably

### Requirement: Claude History Reopen MUST Preserve A Readable Surface Until Session Truth Resolves

当用户重新打开 `Claude` 历史会话时，系统 MUST 在 native session truth 尚未最终收敛前保留可读 surface 或等价 reconcile surface，不得出现“先看到历史、随后整块消失”的行为。

#### Scenario: synthetic continuation control-plane rows remain hidden during fallback validation

- **WHEN** Claude transcript contains synthetic resume rows such as `Continue from where you left off.` and `<synthetic>` `No response requested.`
- **AND** the same transcript contains real user/tool/assistant rows
- **THEN** fallback validation MUST ignore the synthetic control-plane rows
- **AND** fallback validation MUST still treat the transcript as valid when real assistant/tool/reasoning rows remain
