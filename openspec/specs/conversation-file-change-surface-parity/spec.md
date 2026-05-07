# conversation-file-change-surface-parity Specification

## Purpose
TBD - created by archiving change normalize-conversation-file-change-surfaces. Update Purpose after archive.
## Requirements
### Requirement: Conversation File-Change Facts MUST Normalize Into Shared Canonical Entries

系统 MUST 在消息幕布、右侧 `workspace session activity`、底部 `status panel` 读取 conversation file-change 事实前，先归一为共享 canonical file entries。

#### Scenario: multi-file change produces complete canonical entries

- **WHEN** 同一次 conversation file-change fact 包含多个受影响文件
- **THEN** 系统 MUST 为每个文件生成独立 canonical entry
- **AND** canonical entry MUST 至少包含 `filePath`、`status`、`additions`、`deletions`
- **AND** bundle aggregate MUST 与这些 entries 可追溯一致

#### Scenario: sparse historical payload uses shared fallback extraction

- **WHEN** 历史 replay 的 file-change payload 缺少部分 diff 或 path 证据
- **THEN** 系统 MAY 使用 fallback extraction
- **AND** 该 fallback MUST 由共享 canonical adapter 统一完成
- **AND** 不同 surface MUST NOT 各自推断出不同的文件集合或 `+/-`

### Requirement: Conversation File-Change Surfaces MUST Stay In Parity

同一 conversation file-change fact 在消息幕布、右侧 activity panel、底部 status panel 的文件数量与 diff 统计 MUST 保持一致。

#### Scenario: file counts match across all surfaces

- **WHEN** 同一 file-change fact 同时出现在消息幕布、右侧 activity panel、底部 status panel
- **THEN** 三个 surface MUST 展示相同的受影响文件数量
- **AND** 右侧 activity panel MUST NOT 因 summary 压缩而少展示文件

#### Scenario: per-file stats match across all surfaces

- **WHEN** 同一路径在多个 surface 上被渲染
- **THEN** 该路径的 `status`、`additions`、`deletions` MUST 保持一致
- **AND** 系统 MUST 继续以 `filePath` 作为跨 surface 的 canonical identity

#### Scenario: aggregate additions and deletions are normalized

- **WHEN** surface 需要显示某次 file-change event 或当前 thread 的 aggregate `+/-`
- **THEN** aggregate MUST 来自同一 canonical entries source
- **AND** 消息幕布 header、右侧 summary、底部 `Edits` 汇总 MUST 保持一致

### Requirement: Surface Parity MUST Survive History Reopen And Replay

系统 MUST 在 conversation 历史 reopening / replay 场景下继续保持 file-change parity，而不是只在实时阶段一致。

#### Scenario: reopened conversation keeps the same file-change parity

- **WHEN** 用户重新打开一个已存在 file-change 历史的 conversation
- **THEN** 消息幕布、右侧 activity panel、底部 status panel MUST 继续展示一致的文件数量与 `+/-`
- **AND** 系统 MUST NOT 在历史 reopening 后退化为只剩 summary 或不完整文件列表

