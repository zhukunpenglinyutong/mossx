# claude-session-sidebar-state-parity Specification

## Purpose

Define the sidebar-to-native-session truth contract for Claude historical sessions so activation, reopen, and cleanup converge on the real session state.
## Requirements
### Requirement: Claude Sidebar Entry MUST Resolve Against Native Session Truth Before Activation

当用户从左侧栏重新打开 `Claude` 历史会话时，系统 MUST 在 activation / history load 前先确认该 entry 对应的 native session truth，而不是直接把 sidebar projection 当成事实源。

#### Scenario: stale sidebar entry is reconciled before reopen
- **WHEN** 用户选择左侧栏中的 `Claude` 历史会话
- **AND** 该 entry 对应的 native session 已失效、缺失或需要 canonical resolve
- **THEN** 系统 MUST 先执行 existence check、canonical resolve 或等价 reconcile
- **AND** 系统 MUST NOT 直接进入一个与该 entry 不一致的 loaded success 状态

#### Scenario: reopen failure does not silently create a new agent conversation
- **WHEN** `Claude` 历史会话在 reopen / history load 过程中失败
- **THEN** 系统 MUST 将该结果视为当前 entry 的 recoverable failure 或 reconcile 分支
- **AND** 系统 MUST NOT 静默创建一个不相关的新 Agent conversation 来顶替原 entry

#### Scenario: concurrent realtime crossed surface does not rewrite final sidebar truth
- **WHEN** 同一 workspace 下存在多个并行 `Claude` realtime 会话
- **AND** live session rebind 一度需要在多个 pending 之间做隔离
- **THEN** sidebar selected entry 的最终 truth MUST 仍然收敛到对应 native session
- **AND** temporary realtime isolation failure MUST NOT 永久改写历史 reopen 后的 selected conversation truth

### Requirement: Claude Sidebar Projection MUST Converge Back To Session Truth After Not-Found

当 `Claude` sidebar entry 已与底层 session truth 分叉，系统 MUST 在 authoritative not-found 之后收敛回真实状态，而不是保留永久 ghost entry。

#### Scenario: delete not found triggers ghost cleanup
- **WHEN** 用户删除某条 `Claude` sidebar entry
- **AND** authoritative delete path 返回 `SESSION_NOT_FOUND` 或等价 not-found
- **THEN** 系统 MUST 触发 authoritative refresh、ghost cleanup 或等价 reconcile
- **AND** 左侧栏最终 MUST 不再长期保留该失效 entry

### Requirement: Claude Sidebar Reopen Surface MUST Stay Anchored During Late Reconcile

当用户从 sidebar 或 recent conversations 重新激活 `Claude` 历史会话时，只要当前幕布已经存在可读 surface，late reconcile MUST 维持该 surface 或替换为显式 reconcile/failure，不得直接把内容清空。

#### Scenario: late reconcile preserves readable history or explicit reconcile surface
- **WHEN** 用户重新打开某条 `Claude` sidebar entry
- **AND** 当前幕布已经显示出可读 history rows
- **AND** native session truth 仍在 late reconcile、canonical resolve 或 existence check 中
- **THEN** 系统 MUST 保留 readable history surface 或显示显式 reconcile surface
- **AND** 系统 MUST NOT 在无说明的情况下把当前幕布清空

#### Scenario: truth mismatch does not blank the selected sidebar conversation
- **WHEN** 当前选中的 `Claude` sidebar entry 与 authoritative native session truth 不一致
- **THEN** 系统 MUST 将该 entry 置于 reconcile 或 recoverable failure
- **AND** 系统 MUST NOT 先显示该 entry 的历史，再在晚到 truth mismatch 后直接掉回空白 conversation

### Requirement: Canonical Claude Replacement MUST Converge The Selected Sidebar Entry

当 `Claude` 历史 entry 需要 canonical replacement 时，系统 MUST 让 selected sidebar entry 与实际打开的 native session truth 收敛到同一目标，不得留下会自行消失的 duplicate conversation。

#### Scenario: selected sidebar entry converges to canonical replacement
- **WHEN** 当前选中的 `Claude` sidebar entry 经过 canonical resolve 后应当指向另一条 native session identity
- **THEN** selected sidebar state 与 conversation surface MUST 一起收敛到该 canonical replacement
- **AND** 系统 MUST NOT 让旧 entry 与 replacement entry 同时表现为“当前会话”

#### Scenario: canonical replacement does not surface as a temporary ghost thread
- **WHEN** `Claude` reopen / continue 过程中出现 canonical replacement
- **THEN** replacement MUST 作为当前 selected conversation 的 truth convergence 结果呈现
- **AND** 系统 MUST NOT 生成一个短暂可见、完成后又自行消失的 ghost `Claude` thread

### Requirement: Claude Sidebar Listing MUST Be Resilient To Large History Payloads

Claude sidebar session listing MUST treat large inline media payloads as non-blocking optional content and continue projecting valid session summaries.

#### Scenario: large base64 transcript does not remove sidebar sessions
- **WHEN** one or more Claude JSONL files contain multi-megabyte inline base64 image lines
- **THEN** the sidebar session listing MUST still return valid discoverable Claude sessions for the workspace
- **AND** unrelated Claude sessions MUST NOT disappear solely because one transcript contains a large media payload

#### Scenario: session summary excludes large image payloads
- **WHEN** the system builds Claude sidebar summaries
- **THEN** the summary payload MUST NOT include inline base64 image data or data URI strings
- **AND** it MUST include only bounded metadata such as title preview, timestamps, message count, file size, and attribution fields

#### Scenario: Claude listing failure is source-scoped
- **WHEN** a Claude history file is oversized, malformed, or times out during summary extraction
- **THEN** the system MUST degrade or skip that file without clearing the full workspace thread list
- **AND** the degraded state MUST expose a Claude-specific partial source or diagnostic reason
