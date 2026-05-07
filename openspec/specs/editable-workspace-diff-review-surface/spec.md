# editable-workspace-diff-review-surface Specification

## Purpose
TBD - created by archiving change add-editable-workspace-diff-review-surface. Update Purpose after archive.
## Requirements
### Requirement: Workspace-Backed Diff Review MUST Support In-Place Editing

系统 MUST 为当前 workspace working tree 的文本 diff review 提供直接编辑能力，使用户可以在同一 review surface 内完成 `review -> edit -> save -> refresh`。

#### Scenario: editable review opens for workspace-backed text diff

- **WHEN** 用户从受支持的 workspace diff review 入口打开一个可写文本文件
- **THEN** 系统 MUST 允许用户在同一 review surface 内进入 `edit` mode
- **AND** 用户 MUST NOT 被迫先退出 review 再单独打开文件 editor

#### Scenario: diff and edit stay inside the same review shell

- **WHEN** 用户从 `diff` mode 切换到 `edit` mode
- **THEN** 当前 review shell MUST 保持同一文件上下文
- **AND** 文件 rail、关闭语义与当前 review 会话 MUST 保持连续

### Requirement: Editable Review Eligibility MUST Be Explicit

系统 MUST 只对满足条件的 workspace-backed review target 开放 editable mode，不得把历史或只读 diff 伪装成可写。

#### Scenario: historical or non-workspace diff stays read-only

- **WHEN** 当前 diff 来自 commit history、PR compare、rewind review 或其他非 live workspace review surface
- **THEN** 系统 MUST 保持只读 review
- **AND** MUST NOT 暴露可执行保存的 editable mode

#### Scenario: deleted or non-editable file stays read-only

- **WHEN** 当前 review file 为 deleted、binary、image、pdf 或 preview-only document
- **THEN** 系统 MUST 保持只读
- **AND** MUST 提供稳定的 read-only reason 或等效受限语义

### Requirement: Editable Review MUST Reuse Existing Workspace File Save Contract

editable review 的保存链路 MUST 复用现有 workspace file editor contract，而不是创建并行写入系统。

#### Scenario: save uses workspace file write pipeline

- **WHEN** 用户在 editable review 中保存当前文件
- **THEN** 系统 MUST 复用现有 workspace file save contract
- **AND** MUST 保持 dirty-state、save shortcut 与失败提示语义一致

#### Scenario: unsaved changes remain protected during close or file switch

- **WHEN** 用户在 editable review 中存在未保存修改并尝试关闭 review 或切换文件
- **THEN** 系统 MUST 触发与现有 file editor 等价的未保存保护
- **AND** MUST NOT 静默丢弃用户修改

### Requirement: Editable Review MUST Refresh Live Diff After Save

用户保存后，review surface MUST 切换到最新 workspace diff，而不是继续展示进入 review 时的旧 patch snapshot。

#### Scenario: save refreshes the current file diff

- **WHEN** 用户在 editable review 中成功保存当前文件
- **THEN** 系统 MUST 刷新当前文件的 live workspace diff
- **AND** 当前 review surface 的 patch、changed-line markers 与 `+/-` 统计 MUST 反映最新状态

#### Scenario: resolved diff shows no stale patch

- **WHEN** 用户保存后当前文件已不再存在差异
- **THEN** 系统 MUST 显示“无差异”或等效空态
- **AND** MUST NOT 继续渲染保存前的旧 diff 内容

