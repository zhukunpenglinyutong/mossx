## MODIFIED Requirements

### Requirement: Realtime-History Semantic Equivalence For Tool Cards

Tool card semantics MUST stay equivalent between realtime rendering, history replay, the right-side activity panel, and the bottom status panel.

#### Scenario: file-change facts stay aligned across realtime history activity and status surfaces

- **WHEN** realtime stream emits a `fileChange` card with multiple files and diff stats
- **THEN** persisted history SHALL preserve enough file metadata for replay
- **AND** tool card、activity panel、status panel SHALL share the same canonical file count and aggregate `+/-`

#### Scenario: per-file stats stay aligned across surfaces

- **WHEN** 同一个 `fileChange` 事实在 tool card、activity panel、status panel 中被渲染
- **THEN** 同一路径的 `status`、`additions`、`deletions` SHALL 保持一致
- **AND** system SHALL continue using `filePath` as the shared canonical identity

#### Scenario: visual presentation may differ while semantics stay equal

- **WHEN** tool card、activity panel、status panel 以不同视觉结构展示同一 `fileChange` 事实
- **THEN** system MAY 保持这些 surface 各自的布局与交互差异
- **AND** file identity、file count、aggregate diff stats SHALL remain semantically equivalent
