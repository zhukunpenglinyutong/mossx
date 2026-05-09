## ADDED Requirements

### Requirement: OpenCode Status Panel Edits Tab MUST Reuse Canonical Conversation File Facts

在 OpenCode conversation mode 中，底部 `status panel` 的 `Edits` 视图 MUST 复用 canonical conversation file-change contract，而不是维护独立统计口径。

#### Scenario: edits tab shows the full canonical file set

- **WHEN** 当前 conversation turn 的 file-change facts 涉及多个文件
- **THEN** `Edits` 视图 MUST 展示完整 canonical file set
- **AND** MUST NOT 因独立 summary 逻辑而缩减文件数量

#### Scenario: edits tab aggregate matches message card and activity panel

- **WHEN** `status panel` 展示当前 turn 或当前 thread 的文件修改 aggregate `+/-`
- **THEN** 这些 aggregate MUST 与消息幕布 `File changes` 卡片和右侧 activity panel 保持一致
- **AND** per-file `status / additions / deletions` MUST 继续保持一致

#### Scenario: historical reopen keeps edits tab parity

- **WHEN** 用户重新打开存在历史 file-change 事实的 OpenCode conversation
- **THEN** `Edits` 视图 MUST 与消息幕布、activity panel 保持同样的文件数量与 `+/-`
- **AND** MUST NOT 在历史 reopening 后退化为不同统计口径
