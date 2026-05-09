## MODIFIED Requirements

### Requirement: Session Provenance and Jump Actions

每条活动 MUST 暴露 session 来源，并 SHOULD 提供跳转到现有详情视图的入口；对于文件修改事件，右侧 activity panel MUST 展示完整文件集合，而不是只保留压缩摘要。

#### Scenario: file-change event exposes complete file list

- **WHEN** activity panel 渲染一次包含多个文件的 `file-change` 事件
- **THEN** 该事件 MAY 保留 event-level summary
- **AND** 展开态 MUST 展示该次变更涉及的全部文件
- **AND** 文件数量 MUST 与对应消息幕布 `File changes` 卡片保持一致

#### Scenario: file rows show canonical per-file diff stats

- **WHEN** activity panel 渲染某个 `file-change` 事件下的文件条目
- **THEN** 每个文件条目 MUST 展示该文件的路径与 `additions / deletions` 摘要
- **AND** 这些统计 MUST 来自共享 canonical file-change source

#### Scenario: historical activity panel keeps complete file list after reopen

- **WHEN** 用户重新打开一个历史上已展示过多文件 `file-change` 的 `Codex` 会话
- **THEN** activity panel MUST 继续展示完整文件列表
- **AND** MUST NOT 在历史 reopening 后退化为只展示 primary file summary
