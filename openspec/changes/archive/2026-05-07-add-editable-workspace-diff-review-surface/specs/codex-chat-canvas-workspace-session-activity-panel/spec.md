## MODIFIED Requirements

### Requirement: Session Provenance and Jump Actions

每条活动 MUST 暴露 session 来源，并 SHOULD 提供跳转到现有详情视图的入口。

#### Scenario: file-change event links to existing diff or file view

- **WHEN** activity panel 渲染文件修改事件
- **THEN** 事件 MUST 至少展示文件路径与增删摘要
- **AND** SHOULD 提供跳转到现有 diff 或 file view 的入口

#### Scenario: command event links to existing command detail surface

- **WHEN** activity panel 渲染命令事件
- **THEN** 事件 MUST 展示命令摘要与当前状态
- **AND** SHOULD 提供跳转到已有 tool card 或 runtime console 的入口

#### Scenario: command event supports lightweight output peek

- **WHEN** 命令事件处于运行中或刚完成
- **THEN** activity panel MAY 轻量展开最近少量输出或错误片段
- **AND** 该轻展开 MUST NOT 取代已有完整 command detail surface

#### Scenario: activity review diff can enter editable mode for live workspace files

- **WHEN** 用户从 activity panel 打开某个 live workspace file-change 的 review diff
- **THEN** 该 review flow MUST 能进入 editable review mode
- **AND** 保存后 MUST 刷新该文件的 live diff，而不是继续展示旧 snapshot
