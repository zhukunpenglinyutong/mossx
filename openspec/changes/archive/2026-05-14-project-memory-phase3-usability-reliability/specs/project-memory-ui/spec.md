## MODIFIED Requirements

### Requirement: 记忆列表显示

系统 MUST 以高密度 workbench 列表展示记忆，包含 record kind、health/review 状态、engine、title、summary、时间、标签等关键信息，并避免长文本撑高列表项。

#### Scenario: 紧凑列表项基本信息

- **GIVEN** 一条 conversation turn 记忆包含完整 `userInput` 和长 `assistantResponse`
- **WHEN** 系统在 Project Memory 左侧列表渲染该记忆
- **THEN** 列表项 SHALL 显示 record kind badge
- **AND** SHALL 显示 engine 或来源标识
- **AND** SHALL 显示 title 作为一行主标题
- **AND** SHALL 将 summary 限制在固定行数内
- **AND** SHALL 显示更新时间、importance、health/review 状态中的关键元信息
- **AND** SHALL NOT 直接展示完整 `assistantResponse`

#### Scenario: 列表项选中状态

- **GIVEN** 用户点击列表中的某一项
- **WHEN** 该项被选中
- **THEN** 应高亮显示选中项
- **AND** 右侧详情区应显示该记忆的完整信息

#### Scenario: 空列表提示

- **GIVEN** 当前 workspace 没有记忆
- **OR** 筛选后无匹配结果
- **WHEN** 列表为空
- **THEN** 应显示空状态提示
- **AND** 提示文案如 "暂无记忆"

#### Scenario: 百条记忆可扫描

- **GIVEN** 当前 workspace 有 100 条记忆
- **WHEN** 用户打开 Project Memory 弹窗
- **THEN** 左侧列表 SHALL 保持固定列宽和可滚动区域
- **AND** 单条长内容 SHALL NOT 改变列表整体布局
- **AND** 用户 SHALL 能在不打开详情的情况下比较多条候选的标题、类型、状态和时间

### Requirement: 详情区显示和编辑

系统 MUST 在右侧详情区显示选中记忆的完整信息；conversation turn 默认只读，manual note 保持可编辑，legacy 使用兼容展示。

#### Scenario: Conversation turn 完整只读展示

- **GIVEN** 用户选中一条 `recordKind="conversation_turn"` 的记忆
- **WHEN** 详情区加载完成
- **THEN** 详情区 SHALL 显示完整用户输入
- **AND** SHALL 显示完整 AI 回复
- **AND** SHALL 显示 threadId、turnId、engine、时间等元信息
- **AND** SHALL NOT 显示自由编辑正文的保存入口

#### Scenario: Manual note 可编辑

- **GIVEN** 用户选中一条 `recordKind="manual_note"` 的记忆
- **WHEN** 详情区加载完成
- **THEN** 系统 SHALL 显示可编辑 title/detail 控件
- **AND** 用户保存时 SHALL 调用 `project_memory_update`

#### Scenario: 删除记忆确认

- **GIVEN** 用户点击删除按钮
- **WHEN** 触发删除操作
- **THEN** 应弹出确认对话框
- **AND** 对话框文案应说明此操作不可撤销或明确删除影响

#### Scenario: 复制整轮内容

- **GIVEN** 用户选中一条 conversation turn 记忆
- **WHEN** 用户点击复制整轮内容
- **THEN** 复制文本 SHALL 包含完整用户输入
- **AND** SHALL 包含完整 AI 回复
- **AND** SHALL 包含 threadId 和 turnId

### Requirement: 设置面板

系统 MUST 在项目记忆设置面板中将历史“对话记忆上下文注入”呈现为已废弃的固定关闭态，并引导用户使用 Composer 底部 Memory Reference one-shot toggle。

#### Scenario: 显示默认关闭且置灰

- **WHEN** 用户打开项目记忆设置面板
- **THEN** “启用对话记忆上下文注入”开关 SHALL 显示为关闭
- **AND** 开关控件 SHALL 呈现禁用样式

#### Scenario: 用户不可点击切换

- **WHEN** 用户点击该历史开关
- **THEN** 系统 SHALL 不发生状态切换

#### Scenario: 引导使用 Composer Memory Reference

- **WHEN** 用户查看项目记忆设置面板
- **THEN** 系统 SHALL 显示说明：记忆参考改为 Composer 本次发送开关
- **AND** 说明 SHALL NOT 暗示系统会静默自动注入记忆

## ADDED Requirements

### Requirement: Workbench 布局

系统 SHALL 将 Project Memory 弹窗组织为高密度 workbench 布局，支持浏览、筛选、详情、整理和诊断入口。

#### Scenario: 打开 workbench

- **WHEN** 用户打开 Project Memory 弹窗
- **THEN** 系统 SHALL 显示顶部工具栏
- **AND** SHALL 显示左侧记忆列表
- **AND** SHALL 显示右侧详情区
- **AND** SHALL 显示 review/health 相关筛选入口

#### Scenario: Quick tags 可折叠

- **GIVEN** 当前 workspace 有大量 quick tags
- **WHEN** 系统渲染 Project Memory 顶部区域
- **THEN** quick tags SHALL 限制默认展示数量或行数
- **AND** 用户 SHALL 可以展开查看更多标签
- **AND** quick tags SHALL NOT 挤占列表和详情主要工作区域

#### Scenario: 来源定位入口

- **GIVEN** 一条 conversation turn 记忆包含 threadId 和 turnId
- **WHEN** 用户查看详情
- **THEN** 系统 SHALL 提供跳回或定位原对话的入口
- **AND** 若无法定位原对话，系统 SHALL 显示不可用状态而不是静默失败
