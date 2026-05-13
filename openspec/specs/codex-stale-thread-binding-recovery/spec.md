# codex-stale-thread-binding-recovery Specification

## Purpose
TBD - created by archiving change fix-codex-stale-thread-binding-recovery. Update Purpose after archive.
## Requirements
### Requirement: Verified Codex Thread Replacement MUST Survive Restart

当 `Codex` stale thread 已被恢复到新的 canonical `threadId` 后，系统 MUST 将该 replacement 作为可恢复事实持久化，而不是只保留在当前进程内存里。

#### Scenario: persisted alias remaps stale thread after restart
- **WHEN** 某个 `Codex` 线程已经验证 `oldThreadId -> canonicalThreadId`
- **AND** 用户重启应用后重新打开同一 workspace 或历史会话
- **THEN** 生命周期入口 MUST 优先把旧 `threadId` canonicalize 到持久化的 `canonicalThreadId`
- **AND** 系统 MUST NOT 再次优先调用已知失效的旧 `threadId`

#### Scenario: alias chain resolves to latest canonical target
- **WHEN** 一个 stale `threadId` 在多次恢复中形成链式 replacement
- **THEN** 持久化 alias 读取结果 MUST 收敛到最新 canonical `threadId`
- **AND** reopen / restore 路径 MUST 不再经过过时的中间 thread id

### Requirement: Recover-Only Rebind MUST Be Available Without Forced Resend

当 `thread not found` 属于 stale binding 问题且系统已经具备安全 rebind 能力时，用户 MUST 可以只恢复当前会话绑定，而不是被迫 resend 上一条 prompt。

#### Scenario: stale thread recovery card offers recover-only action
- **WHEN** reconnect surface 识别到当前失败属于 `thread not found`
- **AND** 系统提供了安全的 thread rebind callback
- **THEN** UI MUST 展示 recover-only 动作
- **AND** 用户 MUST 能在不 resend 上一条 prompt 的情况下先恢复当前会话绑定

#### Scenario: no verified replacement keeps conservative failure semantics
- **WHEN** 系统无法确认安全 replacement thread
- **THEN** reconnect surface MUST 保持保守失败语义
- **AND** 系统 MUST NOT 通过启发式猜测把当前会话误绑到其他线程

### Requirement: Manual Runtime Recovery MUST Start A Fresh Recovery Cycle

当 `Codex` runtime 已因为 repeated stale health probe 进入 automatic recovery quarantine 时，用户手动触发的恢复动作 MUST 开启一轮 fresh explicit recovery cycle，而不是继续被上一轮 automatic backoff 继承阻塞。

#### Scenario: explicit recovery records lifecycle source

- **WHEN** 用户显式点击 `重新连接 runtime`、recover-only 或 recover-and-resend
- **THEN** recovery cycle MUST 标记 `recoverySource=manual-reconnect`、`manual-recover-only` 或 `manual-recover-and-resend`
- **AND** 该 source MUST 出现在 runtime/thread diagnostics 中，便于区分 automatic recovery 与用户主动恢复

### Requirement: First-Turn Stale Codex Drafts MUST Use Fresh Continuation Semantics

Codex stale-thread recovery MUST distinguish durable stale conversation identities from first-turn drafts that never accepted user work.

#### Scenario: empty stale draft can be replaced without manual recovery card
- **WHEN** a Codex thread identity fails with `thread not found`
- **AND** canonical accepted-turn / durable-activity facts prove the identity has no accepted user turn, no completed assistant response, and no persisted durable activity
- **THEN** the system MAY replace the stale draft with a fresh Codex thread for the current first prompt
- **AND** the primary user path MUST continue the prompt in the fresh thread rather than asking the user to recover the old empty identity

#### Scenario: unknown draft boundary stays durable-safe
- **WHEN** a Codex thread identity fails with `thread not found`
- **AND** the system cannot determine whether the identity accepted user work
- **AND** the failure is not the current pre-accept first-send prompt on a locally empty draft surface
- **THEN** the system MUST use durable stale-thread recovery semantics
- **AND** it MUST NOT silently classify the source as an empty disposable draft based only on missing frontend-rendered items

#### Scenario: current first-send prompt can recover a lost empty-draft marker
- **WHEN** a Codex thread identity fails with `thread not found` before `turn/start` accepts the current prompt
- **AND** the empty-draft lifecycle marker is missing
- **AND** local activity contains no durable user, assistant, tool, approval, or completed generated-image evidence
- **THEN** the system MAY create a fresh Codex thread and resend the current prompt there
- **AND** malformed identity errors such as `invalid thread id` MUST still require verified rebind or explicit user recovery rather than automatic fresh replacement

#### Scenario: durable stale thread still requires verified rebind or explicit fresh continuation
- **WHEN** a Codex thread identity fails after one or more accepted user turns or durable activity facts exist
- **THEN** the system MUST first attempt verified rebind through the existing stale-thread recovery contract
- **AND** fresh continuation MUST be explicit and user-visible rather than silently replacing the old thread

#### Scenario: first-turn fresh replacement records alias only when safe
- **WHEN** a first-turn stale draft is replaced by a fresh thread
- **THEN** the system MUST NOT persist an alias that claims the old durable conversation was recovered unless the old identity was verified
- **AND** any stored mapping MUST be marked or treated as draft replacement rather than durable rebind

### Requirement: Fresh Continuation MUST Preserve User Intent Visibility

When stale Codex recovery falls back to a fresh thread, the user's immediate intent MUST remain visible and target the new active identity.

#### Scenario: fresh continuation renders the replayed prompt
- **WHEN** a recover-and-resend or first-turn fallback sends a prompt to a fresh Codex thread
- **THEN** the user prompt MUST be rendered or otherwise visibly represented in the fresh thread
- **AND** duplicate suppression MUST NOT hide the prompt merely because the action originated from a stale source thread

#### Scenario: fresh continuation keeps old thread explainable
- **WHEN** a fresh continuation replaces or supersedes a stale Codex source identity
- **THEN** the old thread surface MUST remain explainable as stale, abandoned, or replaced when visible
- **AND** the UI MUST NOT imply that old context was fully preserved unless verified rebind occurred

### Requirement: Manual Stale Thread Recovery MUST Return A Classified Outcome

Codex stale thread manual recovery MUST distinguish verified thread rebind from fresh-thread fallback and unrecoverable failure.

#### Scenario: classified outcome includes retryability and user action

- **WHEN** manual stale thread recovery 返回 `rebound`、`fresh` 或 `failed`
- **THEN** result MUST include retryability and a recommended user action when available
- **AND** frontend MUST NOT infer these semantics only from raw error text

### Requirement: Recover And Resend MUST Make Fresh Fallback Visible

When a user explicitly chooses to recover and resend from a stale Codex thread recovery card, a fresh-thread fallback MUST visibly continue the user intent in the new thread.

#### Scenario: rebound resend preserves duplicate suppression
- **WHEN** recover-and-resend receives a `rebound` result
- **THEN** the resend path MUST preserve existing duplicate suppression for the previous user prompt
- **AND** the recovered canonical thread MUST remain the target of the resend

#### Scenario: fresh resend shows the replayed user prompt
- **WHEN** recover-and-resend receives a `fresh` result
- **THEN** the UI MUST switch to the fresh thread
- **AND** the resend path MUST render or otherwise visibly surface the replayed user prompt in that fresh thread

#### Scenario: failed recovery does not resend
- **WHEN** manual recovery returns `failed`
- **THEN** recover-and-resend MUST NOT send the previous prompt
- **AND** the recovery card MUST show a failure detail

### Requirement: Recover Only MUST Preserve Conservative Rebind Semantics

Recover-only stale thread actions MUST only report success for actual rebind outcomes.

#### Scenario: recover-only succeeds for rebound
- **WHEN** recover-only receives a `rebound` result
- **THEN** the UI MUST switch or remain on the canonical recovered thread
- **AND** the action MAY clear the failed recovery state

#### Scenario: recover-only does not present fresh fallback as recovered session
- **WHEN** recover-only receives a `fresh` result
- **THEN** the UI MUST NOT present the original stale thread as recovered
- **AND** the user MUST receive an explicit indication that continuing requires the fresh conversation path

### Requirement: Codex Create Session MUST Survive Stopping Runtime Races

Codex create-session 路径 MUST 正确处理 create 期间 runtime 已进入 stopping、manual shutdown、runtime ended 或 stale reuse cleanup 的竞态。

#### Scenario: create session rejects stopping runtime reuse

- **WHEN** 用户创建 Codex session
- **AND** 当前 registered runtime 已标记为 `manual shutdown`、`runtime ended`、`stopping` 或等价状态
- **THEN** create-session MUST NOT 复用该 runtime 作为 foreground target
- **AND** MUST start or await a fresh guarded runtime acquisition

#### Scenario: create session gets one bounded retry after stopping race

- **WHEN** create-session 已进入 `thread/start`
- **AND** bound runtime 因同一 stopping/manual-shutdown race 在 turn 创建前结束
- **THEN** 系统 MUST perform one bounded fresh reacquire or equivalent guarded retry
- **AND** flow MUST settle as either successful new session or recoverable failure without unbounded reconnect loop

#### Scenario: create shutdown race emits recoverable diagnostic

- **WHEN** create-session 因 stopping runtime race 失败
- **THEN** 系统 MUST classify the failure as `stopping-runtime-race` or equivalent reasonCode
- **AND** frontend MUST be able to show reconnect-and-retry rather than only a raw error toast

### Requirement: Codex Stale Binding Recovery MUST Be Durable-Safe

Codex stale thread binding recovery MUST preserve durable local activity and MUST NOT silently replace durable conversations with fresh threads.

#### Scenario: durable stale thread requires verified rebind or explicit fresh continuation

- **WHEN** stale Codex thread has accepted user turn、assistant response、tool activity、approval、generated image 或其他 durable local activity
- **THEN** 系统 MUST first attempt verified rebind through stale-thread recovery contract
- **AND** fresh continuation MUST be explicit and user-visible rather than silently replacing the old thread

#### Scenario: recoverable stale send retries at most once

- **WHEN** send/resume fails with recoverable stale binding signal such as `thread-not-found`、`session-not-found`、`broken-pipe` or `runtime-ended`
- **THEN** 系统 MAY attempt automatic recovery and retry the user action at most once
- **AND** repeated failure MUST settle to visible recovery state rather than entering retry storm

#### Scenario: recovery failure preserves old thread visibility

- **WHEN** stale binding recovery fails
- **THEN** UI MUST keep the source thread explainable as stale、abandoned、unrecovered 或需要 fresh continuation
- **AND** 系统 MUST NOT silently clear local history or bind it to an unrelated thread

### Requirement: Codex Stale Binding Diagnostics MUST Use Stable Reason Codes

Codex stale binding 和 runtime shutdown 相关错误 MUST 被分类为稳定 reasonCode，供 frontend 和 diagnostics surface 消费。

#### Scenario: stale thread not found is classified

- **WHEN** Codex provider returns `thread not found`、`session not found` or equivalent stale identity error
- **THEN** 系统 MUST classify it as `stale-thread-binding` with staleReason such as `thread-not-found` or `session-not-found`
- **AND** frontend recovery logic MUST use this classification rather than substring matching alone when available

#### Scenario: probe failure differs from already stopping

- **WHEN** stale health probe fails
- **THEN** diagnostics MUST distinguish `probe-failed` from `already-stopping`、`manual-shutdown` and `runtime-ended`
- **AND** retryability MUST reflect the classified lifecycle state

#### Scenario: internal cleanup differs from foreground turn loss

- **WHEN** Codex runtime stops because of stale-session cleanup、replacement、idle eviction、settings restart or app shutdown cleanup
- **AND** no active foreground work is attached to that runtime
- **THEN** backend MUST record lifecycle evidence without emitting misleading foreground `runtime-ended` conversation diagnostics
- **AND** active foreground work MUST still receive structured recoverable diagnostics when affected
