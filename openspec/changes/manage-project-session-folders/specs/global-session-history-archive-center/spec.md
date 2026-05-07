## ADDED Requirements

### Requirement: Global Session History Archive Center SHALL Query Codex Claude Code And Gemini With Priority Boundaries

全局历史 / 归档中心 MUST 支持按 engine 查询 `Codex` 与 `Claude Code` 本地历史；`Gemini` MUST 以 best-effort 方式纳入 engine filter，并保持每个 engine source 的 degraded 状态可解释。

#### Scenario: global center filters by engine
- **WHEN** 用户在全局历史中心选择 Codex、Claude Code、Gemini 或 all engines
- **THEN** 系统 MUST 返回匹配 engine filter 的 session histories
- **AND** 每条 entry MUST 暴露 engine identity

#### Scenario: one engine scan failure does not hide other engines
- **WHEN** Claude Code history scan 失败
- **AND** Codex 或 Gemini history scan 成功
- **THEN** 系统 MUST 继续返回成功 engine 的结果
- **AND** MUST 暴露 Claude Code source degraded marker

#### Scenario: gemini degradation does not block codex or claude
- **WHEN** Gemini history scan 失败或 metadata 不足
- **AND** Codex 或 Claude Code history scan 成功
- **THEN** 系统 MUST 继续返回 Codex 或 Claude Code 的结果
- **AND** MUST NOT 因 Gemini best-effort source 不完整而降低 Codex/Claude Code attribution correctness

### Requirement: Global And Project History Views SHALL Share Canonical State

同一 canonical session 在 global history、project strict view、project related view 与 folder tree 中 MUST 共享 archive/delete/assignment 状态，不得形成互相矛盾的 UI truth。

#### Scenario: archive in global reflects in project folder view
- **WHEN** 用户在 global history center archive 某条属于当前 project folder 的 session
- **THEN** project folder view MUST 在刷新或状态同步后反映 archived 状态
- **AND** 若当前 project view 只显示 active sessions，该 session MUST 从 active view 移除

#### Scenario: delete in project removes global entry
- **WHEN** 用户在 project folder view 删除某条 session 且 delete 成功
- **THEN** global history center MUST 不再显示该 canonical session as active or archived
- **AND** 系统 MUST 清理该 session 的 folder assignment metadata
