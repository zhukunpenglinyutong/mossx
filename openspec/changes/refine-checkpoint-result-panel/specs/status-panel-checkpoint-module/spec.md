## MODIFIED Requirements

### Requirement: Checkpoint Surface MUST Reuse Canonical File-Change Facts Instead Of Re-Deriving Them

`Checkpoint` 模块 MUST 继续消费 canonical conversation file-change facts，而不是为新的结果模块重新造一套独立的文件统计逻辑。若当前 workspace 已提供 Git working tree facts，`Checkpoint` 的 evidence、key changes 与文件明细 MUST 优先使用同一组 working tree facts，避免结果区和 Git 区出现文件数量或 `+/-` 统计漂移。

#### Scenario: checkpoint evidence reuses canonical file aggregate

- **WHEN** `Checkpoint` 展示文件数量与 `+/-` evidence
- **THEN** 这些数字 MUST 来自共享 canonical file-change source
- **AND** MUST NOT 通过新的独立推断器重新计算

#### Scenario: key changes file detail stays traceable to canonical entries

- **WHEN** `Checkpoint` 在 `Key Changes` 中展示 secondary file detail
- **THEN** 每个文件条目 MUST 能追溯到 canonical file entries
- **AND** MUST 与消息区和右侧 activity panel 的文件身份保持一致

#### Scenario: checkpoint and git working tree file counts stay aligned

- **WHEN** workspace Git status has provided current working tree files and totals
- **THEN** `Checkpoint` evidence MUST use those working tree files as canonical file facts
- **AND** the evidence summary MUST match the file list rendered in the same result panel
- **AND** stale historical tool file changes MUST NOT override current Git working tree facts

### Requirement: Checkpoint Surface MUST Optimize For Convenience And Scanability

`Checkpoint` 模块 MUST 优先帮助用户做下一步决策，而不是再次堆叠所有底层 telemetry。Evidence 区域 MUST 使用紧凑、可扫读的布局，只展示验证事实；文件数量与 `+/-` 汇总由 `文件变化` 区域承载，避免同屏重复。

#### Scenario: next actions stay short and actionable

- **WHEN** `Checkpoint` 生成当前回合的下一步建议
- **THEN** 系统 MUST 将推荐动作限制在少量高价值入口
- **AND** 每个动作 MUST 指向已有真实操作或详情入口

#### Scenario: git-backed commit action opens a reusable commit confirmation dialog

- **WHEN** `Checkpoint` renders a result while the Git area has staged or unstaged file changes
- **AND** the user clicks the commit action
- **THEN** the module MUST open a commit confirmation dialog instead of silently calling commit
- **AND** the dialog MUST reuse the existing Git commit message state, commit generation callback, file selection behavior, and commit callback
- **AND** the final commit button MUST remain disabled until a commit message and at least one selected file are present
- **AND** selecting unstaged files MUST route through the existing scoped commit operation rather than implementing a second staging workflow
- **AND** the next-action area MUST NOT render a separate review-diff action because diff review remains available from the file-change list itself

#### Scenario: novice user can understand current state without reading raw file diffs

- **WHEN** 新手用户首次查看 `Checkpoint`
- **THEN** 模块 MUST 能通过 headline 与 summary 解释当前回合处于什么状态
- **AND** 用户 MUST 无需先理解 `+/-` 行数含义才能做下一步动作

#### Scenario: evidence row renders validation groups without repeated file summary

- **WHEN** `Checkpoint` renders evidence with required and optional validation groups
- **THEN** the evidence area MUST omit repeated file summary text
- **AND** required validations MUST render on their own row
- **AND** optional validations MUST render on their own row
- **AND** validation groups MUST NOT be pushed into a detached right-aligned column
- **AND** the layout MAY wrap tokens onto the next line on narrow screens
