## MODIFIED Requirements

### Requirement: 候选信息可读与可比较

系统 MUST 在 `@@` 候选中提供足够信息支持用户选择，并以左侧 compact preview + 右侧完整详情的方式控制信息密度。

#### Scenario: 候选卡片信息完整

- **WHEN** 系统渲染记忆候选项
- **THEN** 每项 SHALL 至少展示标题与摘要片段
- **AND** SHALL 展示关键元信息（如 kind、优先级、更新时间、标签、engine 中的一组或多组）

#### Scenario: 左侧候选 compact preview

- **GIVEN** 候选记忆包含很长的 AI 回复
- **WHEN** 系统渲染 `@@` 候选左侧列表
- **THEN** 左侧候选项 SHALL 将标题限制为 1 行
- **AND** SHALL 将摘要限制为 2 到 3 行
- **AND** SHALL 将 metadata 压缩为 1 行
- **AND** SHALL NOT 因长正文撑高单条候选

#### Scenario: 选择前可查看细节

- **WHEN** 用户仅高亮或聚焦某条候选但未选择
- **THEN** 系统 SHALL 在右侧详情区提供该候选的完整细节预览
- **AND** 预览行为 SHALL NOT 改变该候选的选中状态

#### Scenario: 右侧详情保持完整展开

- **GIVEN** 用户高亮一条 conversation turn 记忆候选
- **WHEN** 右侧详情区渲染
- **THEN** 右侧 SHALL 能展示完整用户输入和完整 AI 回复
- **AND** Phase 3 的左侧 compact preview 改动 SHALL NOT 裁剪右侧详情内容

#### Scenario: 同屏候选数量

- **GIVEN** 输入框上方有足够高度显示 `@@` 候选弹层
- **WHEN** 候选列表包含 8 条以上记忆
- **THEN** 左侧列表 SHALL 稳定展示至少 5 条候选
- **AND** 剩余候选 SHALL 通过列表滚动访问

## ADDED Requirements

### Requirement: `@@` 候选跨平台布局稳定性

系统 SHALL 以平台无关的 CSS 和文本裁剪策略渲染 `@@` 候选，避免不同操作系统字体、滚动条和换行差异破坏布局。

#### Scenario: 长英文 token 不撑破候选

- **GIVEN** 候选标题或摘要包含很长的英文 token、路径或代码符号
- **WHEN** 系统渲染左侧 compact preview
- **THEN** 文本 SHALL 被 clamp、wrap 或 overflow 处理
- **AND** SHALL NOT 横向撑破候选面板

#### Scenario: Windows 和 macOS 滚动条差异不影响右侧详情

- **WHEN** `@@` 候选弹层在 Windows 或 macOS 渲染
- **THEN** 左侧列表 SHALL 保持独立滚动容器
- **AND** 右侧详情 SHALL 保持可滚动和可阅读
