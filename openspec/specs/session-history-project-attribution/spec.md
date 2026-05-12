# session-history-project-attribution Specification

## Purpose
TBD - created by archiving change global-session-history-archive-center. Update Purpose after archive.
## Requirements
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

### Requirement: Project Attribution SHALL Prioritize Codex And Claude Code Histories With Gemini Best Effort

系统 MUST 对 `Codex` 与 `Claude Code` 本地历史执行 P0 project attribution，并用统一分类表达 `strict-match`、`inferred-related` 与 `unassigned`；`Gemini` 历史 SHOULD 进入同一模型，但 MUST 以 best-effort 可见性和 degraded/unassigned fallback 为边界。

#### Scenario: codex and claude history entries expose attribution classification
- **WHEN** 系统扫描 Codex 或 Claude Code 历史
- **THEN** 每条可读 entry MUST 暴露 engine、canonical session identity 与 attribution classification
- **AND** classification MUST 使用统一的 `strict-match`、`inferred-related` 或 `unassigned` 语义

#### Scenario: gemini history uses best effort attribution
- **WHEN** 系统扫描 Gemini 历史
- **THEN** 可读且 metadata 足够的 entry SHOULD 暴露 engine、canonical session identity 与 attribution classification
- **AND** metadata 不足时 MUST 保留为 `unassigned` 或 source degraded
- **AND** Gemini attribution 不完整 MUST NOT 阻塞 Codex 或 Claude Code 历史正确显示

#### Scenario: unresolved engine history remains visible
- **WHEN** 某条 Codex、Claude Code 或 Gemini 历史缺少足够 metadata 或候选 project 不唯一
- **THEN** 系统 MUST 将其标记为 `unassigned`
- **AND** MUST NOT 强行归属到任意 project

### Requirement: Claude Code Project History SHALL Use Transcript Evidence For Attribution

Claude Code 历史归属 MUST 读取可用 transcript/session metadata，并结合 cwd、project path、git root、workspace catalog 或等价证据，避免具备项目证据的 Claude Code session 在对应项目中漏显。

#### Scenario: claude transcript cwd strict matches project
- **WHEN** Claude Code transcript 或 session metadata 暴露 cwd
- **AND** cwd strict 命中某个 project/workspace 边界
- **THEN** 系统 MUST 将该 Claude Code session 归类为该 project 的 `strict-match`
- **AND** project session catalog MUST 能显示该 session

#### Scenario: claude git root equals workspace root is strict
- **WHEN** Claude Code transcript cwd 不直接等于 workspace path
- **AND** 该 cwd 的 git root 等于某 workspace root
- **THEN** 系统 MUST 将该 Claude Code session 归类为该 workspace/project 的 `strict-match`
- **AND** attribution reason MUST 说明来自 git root evidence

#### Scenario: claude known worktree maps to strict project projection
- **WHEN** Claude Code transcript cwd 位于 known child worktree
- **THEN** 系统 MUST 将该 Claude Code session 归入该 worktree owner scope
- **AND** main project projection MUST 能按既有 worktree aggregation 规则显示该 session

#### Scenario: claude transcript maps through git root
- **WHEN** Claude Code transcript cwd 不直接等于 workspace path
- **AND** Claude project directory、parent-scope 或 known workspace mapping 能唯一指向某个 project
- **THEN** 系统 MUST 将该 session 归类为 `inferred-related`
- **AND** payload MUST 暴露 attribution reason

#### Scenario: ambiguous claude mapping stays unassigned
- **WHEN** Claude Code transcript metadata 同时匹配多个候选 projects
- **THEN** 系统 MUST 将该 session 标记为 `unassigned`
- **AND** MUST NOT 选择第一个候选 project 作为归属

#### Scenario: claude metadata parse failure degrades source only
- **WHEN** 某个 Claude Code transcript 无法解析
- **THEN** 系统 MUST 暴露 Claude history degraded marker
- **AND** MUST NOT 因单条或单源解析失败清空 Codex/Gemini 或其它 Claude entries

### Requirement: Multi Engine Attribution SHALL Preserve Engine Specific Identity

统一 project attribution MUST 保留 engine-specific identity 与 source metadata，避免不同 engine 的同名 session 或相似 transcript 被错误 dedupe。

#### Scenario: same textual title across engines remains separate
- **WHEN** Codex、Claude Code 与 Gemini 存在相同 title 或相似首条 prompt
- **THEN** 系统 MUST 依据 engine + canonical identity 保持独立 entries
- **AND** MUST NOT 仅凭标题或 prompt 把不同 engine histories 合并

#### Scenario: mutation routes through canonical owner
- **WHEN** 用户从 project view 对某条 Codex、Claude Code 或 Gemini session 执行 archive、unarchive、delete 或 folder move
- **THEN** 系统 MUST 使用该 entry 的 canonical identity 与 owner workspace/project 路由 mutation
- **AND** MUST NOT 通过当前 UI folder 或 engine tab 猜测 owner

### Requirement: Claude Project Attribution MUST Not Require Large Media Parsing

Claude Code project attribution MUST derive workspace membership from bounded transcript metadata and MUST NOT require full parsing of large inline base64 media payloads.

#### Scenario: attribution uses metadata without image payload
- **WHEN** a Claude transcript includes cwd, workspace path, git root, timestamp, or equivalent metadata outside a large image payload
- **THEN** project attribution MUST use that metadata without materializing the base64 image string
- **AND** the session MUST remain eligible for strict-match or inferred-related classification

#### Scenario: oversized media line degrades only that transcript evidence
- **WHEN** attribution encounters a JSONL line whose content exceeds the safe summary parsing budget
- **THEN** the system MUST avoid full media parsing for that line
- **AND** it MUST continue scanning other bounded evidence in the same transcript when possible
- **AND** it MUST NOT force the entire workspace history source into an empty result

#### Scenario: metadata parse failure remains explainable
- **WHEN** Claude attribution cannot parse enough safe metadata from a transcript because of malformed or oversized content
- **THEN** the system MUST classify or omit that transcript according to existing attribution rules
- **AND** it MUST preserve an explainable degraded reason for diagnostics

