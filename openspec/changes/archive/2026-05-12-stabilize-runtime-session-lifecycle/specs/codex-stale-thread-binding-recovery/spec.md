## MODIFIED Requirements

### Requirement: Manual Runtime Recovery MUST Start A Fresh Recovery Cycle

当 `Codex` runtime 已因为 repeated stale health probe 进入 automatic recovery quarantine 时，用户手动触发的恢复动作 MUST 开启一轮 fresh explicit recovery cycle，而不是继续被上一轮 automatic backoff 继承阻塞。

#### Scenario: explicit recovery records lifecycle source

- **WHEN** 用户显式点击 `重新连接 runtime`、recover-only 或 recover-and-resend
- **THEN** recovery cycle MUST 标记 `recoverySource=manual-reconnect`、`manual-recover-only` 或 `manual-recover-and-resend`
- **AND** 该 source MUST 出现在 runtime/thread diagnostics 中，便于区分 automatic recovery 与用户主动恢复

### Requirement: Manual Stale Thread Recovery MUST Return A Classified Outcome

Codex stale thread manual recovery MUST distinguish verified thread rebind from fresh-thread fallback and unrecoverable failure.

#### Scenario: classified outcome includes retryability and user action

- **WHEN** manual stale thread recovery 返回 `rebound`、`fresh` 或 `failed`
- **THEN** result MUST include retryability and a recommended user action when available
- **AND** frontend MUST NOT infer these semantics only from raw error text

## ADDED Requirements

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
