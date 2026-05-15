# status-panel-checkpoint-module Specification

## Purpose

Defines the status-panel-checkpoint-module behavior contract, covering Bottom Status Panel MUST Replace Legacy Edits Tab With A Checkpoint Result Surface.

## Requirements
### Requirement: Bottom Status Panel MUST Replace Legacy Edits Tab With A Checkpoint Result Surface

系统 MUST 用新的 `Checkpoint` 结果模块替换底部 `status panel` 中旧的 `Edits` 主语义，并使用更贴近用户判断习惯的本地化 tab 文案，例如 `结果 / Result`。

#### Scenario: dock status panel shows checkpoint instead of legacy edits

- **WHEN** 用户打开底部 `dock` 状态面板
- **THEN** 系统 MUST 展示新的 `结果` tab
- **AND** 系统 MUST NOT 继续把旧 `Edits` 作为用户主语义展示

#### Scenario: replacing edits does not replace right-side session activity

- **WHEN** 系统引入新的 `Checkpoint` 结果模块后
- **THEN** 右侧 `session activity` MUST 保持独立存在
- **AND** `Checkpoint` MUST NOT 退化为右侧 activity 的缩小复刻

#### Scenario: popover status panel also stops exposing legacy edits semantics

- **WHEN** 用户打开 composer 上方的 popover status panel
- **THEN** 系统 MUST 使用与 `dock` 一致的 `Checkpoint/结果` 语义
- **AND** popover MUST NOT 残留 legacy `Edits` 主语义

#### Scenario: popover may stay compact while preserving verdict parity

- **WHEN** `Checkpoint` 在 popover status panel 中渲染
- **THEN** 系统 MAY 使用更紧凑的布局
- **AND** 其 verdict 与 evidence MUST 与 dock 版本保持同源一致

### Requirement: Checkpoint Surface MUST Use Layered Data Ownership

`Checkpoint` 模块 MUST 采用 `facts -> verdict -> summary` 分层 ownership，而不是让大模型直接自由生成整个模块。

#### Scenario: deterministic subsystems write structured facts

- **WHEN** `Checkpoint` 需要展示文件、命令、任务或验证信息
- **THEN** 这些事实 MUST 来自 deterministic system producers
- **AND** 系统 MUST NOT 依赖大模型直接编写这些原始事实字段

#### Scenario: verdict is computed by fixed rules instead of model opinion

- **WHEN** 系统需要判定当前状态属于 `running / blocked / needs_review / ready`
- **THEN** verdict MUST 由固定规则计算
- **AND** 大模型 MUST NOT 单独决定最终 verdict

#### Scenario: model summary remains optional and bounded

- **WHEN** 系统启用模型摘要能力
- **THEN** 模型输出 MUST 仅限于 `summary / risk wording / next action wording` 等解释层内容
- **AND** 当模型不可用时模块 MUST 继续以 deterministic fallback 文案工作

### Requirement: Checkpoint Surface MUST Reuse Canonical File-Change Facts Instead Of Re-Deriving Them

`Checkpoint` 模块 MUST 继续消费 canonical conversation file-change facts，而不是为新的结果模块重新造一套独立的文件统计逻辑。若当前 workspace 已提供 Git working tree facts，`Checkpoint` 的 evidence、key changes 与文件明细 MUST 优先使用同一组 working tree facts，避免结果区和 Git 区出现文件数量或 `+/-` 统计漂移。

#### Scenario: checkpoint evidence reuses canonical file aggregate

- **WHEN** `Checkpoint` 计算文件数量与 `+/-` totals
- **THEN** 这些数字 MUST 来自共享 canonical file-change source
- **AND** MUST NOT 通过新的独立推断器重新计算

#### Scenario: key changes file detail stays traceable to canonical entries

- **WHEN** `Checkpoint` 在 `Key Changes` 中展示 secondary file detail
- **THEN** 每个文件条目 MUST 能追溯到 canonical file entries
- **AND** MUST 与消息区和右侧 activity panel 的文件身份保持一致

#### Scenario: checkpoint and git working tree file counts stay aligned

- **WHEN** workspace Git status has provided current working tree files and totals
- **THEN** `Checkpoint` MUST use those working tree files as canonical file facts
- **AND** the file list, key changes, and totals rendered in the same result panel MUST stay aligned
- **AND** stale historical tool file changes MUST NOT override current Git working tree facts

### Requirement: Checkpoint Surface MUST Present A Stable Fixed Skeleton

`Checkpoint` 模块 MUST 使用固定 UI 骨架，而不是让每轮结构自由漂移。

#### Scenario: collapsed state compresses verdict and evidence into one scannable row

- **WHEN** `Checkpoint` 处于折叠态
- **THEN** 系统 MUST 在一行内展示当前 verdict 与关键 evidence
- **AND** MUST NOT 默认堆叠长文件列表或重复文件名

#### Scenario: expanded state keeps fixed sections

- **WHEN** 用户展开 `Checkpoint`
- **THEN** 系统 MUST 稳定展示 `Verdict / Evidence / Key Changes / Risks / Next Action`
- **AND** 这些 section 的顺序 MUST 保持稳定

#### Scenario: file changes become secondary detail instead of primary surface

- **WHEN** 当前回合涉及多个文件修改
- **THEN** 文件明细 MAY 作为 `Key Changes` 下的 secondary detail 存在
- **AND** 文件列表 MUST NOT 再作为整个模块的 primary information layer

### Requirement: Checkpoint Verdict MUST Prefer Truthfulness Over Completeness

`Checkpoint` 模块 MUST 显式区分 `pass / fail / running / not_run / not_observed`，避免用看似完整的摘要掩盖缺失事实。

#### Scenario: missing validation data is surfaced honestly

- **WHEN** 系统没有观察到 lint、typecheck、tests 或 build 的执行事实
- **THEN** 对应 evidence MUST 显示为 `Not observed` 或等效本地化文案
- **AND** 系统 MUST NOT 将其渲染为通过状态

#### Scenario: validation not triggered is displayed as not run

- **WHEN** 某类验证明确未被触发
- **THEN** 对应 evidence MUST 显示为 `Not run` 或等效本地化文案
- **AND** verdict 计算 MUST 把这一事实纳入考虑

#### Scenario: high-value conclusions remain traceable

- **WHEN** 模块展示风险、失败或 ready-like 结论
- **THEN** 这些结论 SHOULD 能追溯到对应 evidence source
- **AND** 用户 MUST 能继续打开相关 diff、命令或风险入口

### Requirement: Checkpoint Surface MUST Optimize For Convenience And Scanability

`Checkpoint` 模块 MUST 优先帮助用户做下一步决策，而不是再次堆叠所有底层 telemetry。Evidence 区域 MUST 使用紧凑、可扫读的布局，只展示验证事实；文件数量与 `+/-` 汇总由 `文件变化` 区域承载，避免同屏重复。`review_diff` MAY appear both as a recommended next action and as file-list controls, but all entries MUST route to the same checkpoint diff review behavior.

#### Scenario: next actions stay short and actionable

- **WHEN** `Checkpoint` 生成当前回合的下一步建议
- **THEN** 系统 MUST 将推荐动作限制在少量高价值入口
- **AND** 每个动作 MUST 指向已有真实操作或详情入口

#### Scenario: review diff next action opens checkpoint diff review

- **WHEN** `Checkpoint` renders a `review_diff` next action
- **AND** the user clicks it
- **THEN** the module MUST open the checkpoint diff review modal
- **AND** the same file set MUST be available from the file-change list diff controls

#### Scenario: git-backed commit action opens a reusable commit confirmation dialog

- **WHEN** `Checkpoint` renders a result while the Git area has staged or unstaged file changes
- **AND** the user clicks the commit action
- **THEN** the module MUST open a commit confirmation dialog instead of silently calling commit
- **AND** the dialog MUST reuse the existing Git commit message state, commit generation callback, file selection behavior, and commit callback
- **AND** the dialog file-list header MUST expose one checkbox that toggles all selectable commit files
- **AND** the header checkbox MUST show an indeterminate state when only part of the selectable file set is selected
- **AND** locked hybrid staged/unstaged file entries MUST remain selected and MUST NOT be cleared by the batch toggle
- **AND** the final commit button MUST remain disabled until a commit message and at least one selected file are present
- **AND** selecting unstaged files MUST route through the existing scoped commit operation rather than implementing a second staging workflow
- **AND** the commit flow MUST NOT implement a second staging workflow

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

### Requirement: Checkpoint Surface MUST Preserve Existing Dock Visual Language

`Checkpoint` 模块 MUST 保持现有底部 `dock/status panel` 的视觉语言，不得引入与当前产品气质不协调的胶囊式或营销式控件。

#### Scenario: module keeps icon-accented dock style

- **WHEN** 系统渲染 `Checkpoint` tab 与展开内容
- **THEN** 界面 MUST 延续现有 dock/status panel 的字号、层级、边框与 icon-accent 风格
- **AND** 新模块 MUST NOT 形成一套割裂的新视觉系统

#### Scenario: module avoids pill-shaped action styling

- **WHEN** 系统渲染 `Checkpoint` 中的 action 与 evidence controls
- **THEN** 控件 MUST 使用与现有面板一致的 text / ghost / icon+label 风格
- **AND** MUST NOT 使用胶囊风格按钮或药丸式主操作群

