# project-memory-ui Specification Delta

## MODIFIED Requirements

### Requirement: 记忆列表显示
系统 MUST 在列表中区分 conversation turn、manual note 与 legacy memory。

#### Scenario: 列表项显示 record kind
- **GIVEN** Project Memory 列表返回多个 record kinds
- **WHEN** 系统渲染列表项
- **THEN** 每个列表项 SHOULD 显示 `Turn`、`Note` 或 `Legacy` 类型提示
- **AND** conversation turn SHOULD 显示 thread/turn 相关元信息
- **AND** engine MAY 作为来源元信息显示，但 MUST NOT 改变 record kind

#### Scenario: 标题回退优先使用完整回复和输入
- **GIVEN** conversation turn memory 缺少显式标题
- **WHEN** 系统渲染列表项标题
- **THEN** 标题 MUST 按 `assistantResponse 首行 -> userInput 首行 -> summary -> Untitled Memory` 回退

### Requirement: 详情区显示和编辑
系统 MUST 将 conversation turn memory 展示为结构化完整回看视图。

#### Scenario: conversation turn 显示完整用户输入
- **GIVEN** 用户打开一条 conversation turn memory
- **WHEN** 系统渲染详情
- **THEN** MUST 显示完整 `userInput`
- **AND** MUST NOT 只显示旧 detail 中的用户输入片段

#### Scenario: conversation turn 显示完整 AI 回复
- **GIVEN** 用户打开一条 conversation turn memory
- **WHEN** 系统渲染详情
- **THEN** MUST 显示完整 `assistantResponse`
- **AND** MUST NOT 只显示 assistant summary 或 digest detail

#### Scenario: conversation turn 默认只读
- **GIVEN** 当前详情项为 conversation turn memory
- **WHEN** 系统渲染操作区
- **THEN** SHOULD NOT 显示自由编辑 detail 的保存入口
- **AND** SHOULD 以复制、定位来源、删除为主要操作

#### Scenario: manual note 保留编辑能力
- **GIVEN** 当前详情项为 manual note
- **WHEN** 系统渲染详情
- **THEN** MAY 保留标题、详情、标签等编辑入口
- **AND** MUST NOT 将 manual note 强制渲染成 turn 结构

### Requirement: 复制体验
系统 MUST 支持复制完整 conversation turn。

#### Scenario: 复制完整问答
- **GIVEN** 用户点击 conversation turn 的复制按钮
- **WHEN** 系统生成复制文本
- **THEN** 文本 MUST 包含完整用户输入
- **AND** MUST 包含完整 AI 回复
- **AND** MUST 附带 `threadId/turnId` 以便回溯

### Requirement: 搜索和筛选 Toolbar
系统 MUST 继续支持既有搜索和筛选，并逐步扩展到 canonical fields。

#### Scenario: 搜索覆盖 turn canonical fields
- **GIVEN** 用户输入搜索词
- **WHEN** 系统刷新 Project Memory 列表
- **THEN** 搜索 SHOULD 覆盖 `userInput`
- **AND** SHOULD 覆盖 `assistantResponse`
- **AND** SHOULD 保持对 legacy `title/summary/detail/cleanText` 的兼容搜索
