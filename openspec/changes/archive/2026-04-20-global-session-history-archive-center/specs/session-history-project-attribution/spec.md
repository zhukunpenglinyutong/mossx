## ADDED Requirements

### Requirement: The System SHALL Derive Project Attribution For Global Codex History

系统 MUST 对全局 Codex 历史执行项目归属判断，并将结果区分为 `strict-match`、`inferred-related` 与 `unassigned`。

#### Scenario: strict project match stays classified as strict

- **WHEN** 某条会话的 metadata 能 strict 命中某个 workspace/project 边界
- **THEN** 系统 MUST 将其标记为 `strict-match`
- **AND** MUST NOT 把它降级为 inferred-only 结果

#### Scenario: related session becomes inferred when not strict

- **WHEN** 某条会话不满足 strict path match
- **AND** 其 `cwd`、git root、parent-scope 或 worktree mapping 可以稳定指向某个项目
- **THEN** 系统 MUST 将其标记为 `inferred-related`
- **AND** MUST 记录归属理由与置信度

#### Scenario: session remains unassigned when evidence is insufficient

- **WHEN** 某条会话缺少足够 metadata 或候选项目不唯一
- **THEN** 系统 MUST 将其标记为 `unassigned`
- **AND** MUST NOT 强行猜测一个项目归属

### Requirement: Project Attribution SHALL Be Explainable

项目宽松归属结果 MUST 向前端暴露可解释信息，避免 inferred 结果成为黑盒。

#### Scenario: inferred result exposes reason and confidence

- **WHEN** 某条会话被标记为 `inferred-related`
- **THEN** payload MUST 暴露 `attributionReason`
- **AND** payload MUST 暴露 `confidence` 或等价置信度字段

#### Scenario: project view distinguishes fact from inference

- **WHEN** 用户在项目视图中查看 related sessions
- **THEN** 前端 MUST 能区分 strict project sessions 与 inferred related sessions
- **AND** inferred 结果 MUST 显式带有推断标签

### Requirement: Inferred Related Sessions SHALL Be Governable Without Polluting Strict Project History

项目相关但非 strict 的历史 MUST 可以被查看与治理，但不得直接混入 strict project sessions。

#### Scenario: inferred sessions appear in related surface only

- **WHEN** 某条会话仅满足 inferred attribution 而不满足 strict match
- **THEN** 系统 MUST 将其展示在 `related` 或等价的 inferred surface 中
- **AND** MUST NOT 直接混入 strict project sessions 列表

#### Scenario: archive inferred session preserves cross-view consistency

- **WHEN** 用户在 inferred related surface 对某条会话执行 archive 或 unarchive
- **THEN** 全局历史与 strict/inferred 相关视图中的同一 canonical session 状态 MUST 保持一致
- **AND** strict project sessions 的事实边界 MUST 不因此被改变

#### Scenario: delete inferred session is protected when owner is unresolved

- **WHEN** 用户在 inferred related surface 删除一条 owner 仍无法唯一解析的会话
- **THEN** 系统 MUST 阻止 delete
- **AND** MUST 返回可解释错误，说明保护原因
