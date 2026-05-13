# conversation-runtime-stability Delta

## MODIFIED Requirements

### Requirement: Recoverable Create-Session Failures MUST Expose A Direct Recovery Action

当系统已经能够判断某次 create-session failure 属于 stopping-runtime、runtime-recovering、或项目 SessionStart hook 阻塞这类可恢复错误时，前端 MUST 提供显性的恢复动作或自动恢复反馈，而不是只留下纯文本错误结论。

#### Scenario: hook-induced create-session failure auto-recovers before blocking the user

- **WHEN** 用户创建 Codex 会话时 primary runtime 因项目 SessionStart hook failure、hook timeout、hook permission denial 或 invalid `thread/start` response 无法返回 thread id
- **THEN** backend MUST first attempt a bounded hook-safe fallback
- **AND** frontend MUST NOT show the empty-thread-id blocking error if fallback succeeds

#### Scenario: hook-safe fallback reports degraded context

- **WHEN** hook-safe fallback succeeds
- **THEN** frontend MUST present a visible degraded-context notice
- **AND** runtime diagnostics MUST preserve enough evidence for support to distinguish hook-safe fallback from ordinary runtime recovery

#### Scenario: hook-safe fallback remains bounded by runtime recovery guard

- **WHEN** multiple create-session requests hit the same hook-induced failure pattern
- **THEN** each user-initiated request MAY receive at most one hook-safe fallback attempt
- **AND** automatic fallback MUST NOT create an unbounded runtime restart loop
- **AND** concurrent callers MUST respect existing runtime acquire / replacement coordination

### Requirement: Stability Evidence MUST Be Correlatable Across Existing Diagnostics Surfaces

Runtime failures covered by this capability MUST leave enough correlated evidence in existing diagnostics surfaces to support issue triage and manual debugging.

#### Scenario: hook-safe fallback evidence preserves primary and fallback outcome

- **WHEN** hook-safe fallback is attempted during create-session
- **THEN** diagnostics MUST record workspace id, engine, create-session action, primary failure category, fallback mode, and fallback outcome
- **AND** diagnostics MUST avoid storing full hook additionalContext or full prompt text
