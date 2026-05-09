## ADDED Requirements

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
