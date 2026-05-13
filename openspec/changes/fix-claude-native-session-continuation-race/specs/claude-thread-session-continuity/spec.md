## MODIFIED Requirements

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

#### Scenario: readable history is not cleared by late reconcile

- **WHEN** 用户重新打开某条 `Claude` 历史会话
- **AND** 当前幕布已经存在可读 history rows
- **AND** late native reconcile、canonical resolve 或等价 truth check 仍在进行
- **THEN** 系统 MUST 保留可读 surface 或显示显式 reconcile surface
- **AND** 系统 MUST NOT 直接掉回 blank / empty-thread success state

#### Scenario: unresolved reopen becomes explicit reconcile failure

- **WHEN** authoritative truth check 最终确认当前 sidebar-selected `Claude` entry 无法作为同一 native session reopen
- **THEN** 系统 MUST 进入可解释的 reconcile failure 或 recoverable failure
- **AND** 系统 MUST NOT 静默切换到另一条会话来伪装成 reopen 成功
