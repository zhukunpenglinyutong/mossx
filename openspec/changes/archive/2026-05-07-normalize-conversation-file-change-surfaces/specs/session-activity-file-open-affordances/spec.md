## ADDED Requirements

### Requirement: Activity Panel Primary File Click MUST Open The File And Maximize The Editor Surface

右侧 `workspace session activity` 文件条目的主点击 MUST 打开目标文件，并在当前布局支持时切换到 editor/file surface 的最大化状态。

#### Scenario: primary click opens file and maximizes editor

- **WHEN** 用户点击 activity panel 文件条目的主区域
- **THEN** 系统 MUST 复用既有文件打开链路打开目标文件
- **AND** 在当前 editor/file surface 支持 maximize 时，系统 MUST 切换到最大化状态

#### Scenario: maximize unavailable falls back to existing open behavior

- **WHEN** 用户点击 activity panel 文件条目的主区域
- **AND** 当前平台、布局或 surface 不支持 meaningful maximize
- **THEN** 系统 MUST 继续完成既有打开行为
- **AND** MUST NOT 因 maximize 不可用而导致文件无法打开

### Requirement: Activity Panel MUST Provide A Separate Diff Preview Affordance

右侧 `workspace session activity` 文件条目 MUST 提供独立 diff icon 按钮，用于打开该文件的 diff 预览窗体。

#### Scenario: diff icon opens diff preview without replacing current layout

- **WHEN** 用户点击 activity panel 文件条目的 diff icon
- **THEN** 系统 MUST 打开该文件的 diff 预览窗体或等效 diff modal
- **AND** 当前主布局上下文 MUST 保持可恢复

#### Scenario: primary click and diff icon remain semantically separate

- **WHEN** 用户点击文件主区域或 diff icon
- **THEN** 主区域 MUST 表示“打开文件并最大化”
- **AND** diff icon MUST 表示“打开 diff 预览”
- **AND** 两个入口 MUST NOT 互相覆盖或交换语义

### Requirement: Activity Panel File Affordances MUST Reuse Existing Routing Contracts

右侧文件打开与 diff 预览的新增 affordance MUST 建立在既有 path routing 与 diff-entry contract 上，而不是创建并行打开系统。

#### Scenario: activity panel reuses existing file and diff open pipelines

- **WHEN** activity panel 触发文件打开或 diff 预览
- **THEN** 系统 MUST 复用既有 `onOpenDiffPath`、workspace file-open、external spec open 或等效现有链路
- **AND** 其他入口的既有打开行为 MUST 保持不变

#### Scenario: unresolvable target fails recoverably

- **WHEN** 用户点击的文件路径无法解析为可用打开目标或 diff 目标
- **THEN** 系统 MUST 提供 recoverable hint
- **AND** activity panel 其余内容与交互 MUST 保持可用
