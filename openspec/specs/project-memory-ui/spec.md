# Project Memory UI

## Purpose

提供项目记忆管理的图形化界面,采用 Modal-First 交互模式,支持搜索、筛选、列表、详情、创建、分页等完整操作。
## Requirements
### Requirement: Modal-First 交互模式

系统 MUST 采用全屏管理弹窗模式,点击 Memory Tab 自动打开弹窗,关闭弹窗自动切回 Git Tab。

#### Scenario: 点击 Tab 打开弹窗

- **GIVEN** 用户在侧边栏看到 Memory Tab
- **WHEN** 用户点击 Memory Tab
- **THEN** 应立即打开全屏管理弹窗
- **AND** 弹窗应覆盖主内容区
- **AND** 自动加载当前 workspace 的记忆列表

#### Scenario: 关闭弹窗自动切换 Tab

- **GIVEN** Memory 管理弹窗已打开
- **WHEN** 用户点击弹窗右上角关闭按钮
- **THEN** 应关闭弹窗并隐藏
- **AND** 自动切换回 Git Tab
- **AND** 恢复之前的内容视图

#### Scenario: ESC 快捷键关闭弹窗

- **GIVEN** Memory 管理弹窗已打开
- **WHEN** 用户按下 ESC 键
- **THEN** 应触发关闭弹窗操作
- **AND** 行为与点击关闭按钮一致

---

### Requirement: 弹窗 Header 操作

系统 MUST 在弹窗 Header 提供标题、刷新、设置、关闭等核心操作。

#### Scenario: 显示标题和记忆计数

- **GIVEN** 当前 workspace 有 50 条记忆
- **WHEN** 打开管理弹窗
- **THEN** Header 应显示 "项目记忆"
- **AND** 显示记忆总数 "(50)"

#### Scenario: 刷新按钮重新加载列表

- **GIVEN** 记忆列表已加载
- **WHEN** 用户点击 Header 的刷新按钮
- **THEN** 应重新调用 `project_memory_list`
- **AND** 更新列表显示
- **AND** 保持当前筛选条件不变

#### Scenario: 设置按钮展开设置面板

- **GIVEN** 设置面板默认折叠
- **WHEN** 用户点击 Header 的设置按钮
- **THEN** 应展开设置面板
- **AND** 显示 workspace 自动采集开关
- **AND** 再次点击应折叠面板

#### Scenario: 关闭按钮

- **GIVEN** 管理弹窗已打开
- **WHEN** 用户点击 Header 的关闭按钮 (X)
- **THEN** 应关闭弹窗
- **AND** 触发自动切换 Tab 逻辑

---

### Requirement: 搜索和筛选 Toolbar

系统 MUST 提供搜索输入框、Kind 下拉、Importance 下拉、Tag 输入等筛选控件。

#### Scenario: 关键词搜索

- **GIVEN** 用户在搜索框输入 "数据库"
- **WHEN** 输入防抖结束后触发搜索
- **THEN** 应调用 `project_memory_list` 并传入 query="数据库"
- **AND** 列表应更新为匹配结果

#### Scenario: Kind 筛选下拉

- **GIVEN** Kind 下拉选项包含 "全部"、"笔记"、"对话"、"已知问题"、"技术决策"、"项目上下文"
- **WHEN** 用户选择 "已知问题"
- **THEN** 应调用 `project_memory_list` 并传入 kind="known_issue"
- **AND** 列表应仅显示 kind 为 "known_issue" 的记忆

#### Scenario: Importance 筛选下拉

- **GIVEN** Importance 下拉选项包含 "全部"、"高"、"中"、"低"
- **WHEN** 用户选择 "高"
- **THEN** 应调用 `project_memory_list` 并传入 importance="high"
- **AND** 列表应仅显示 importance 为 "high" 的记忆

#### Scenario: Tag 筛选输入

- **GIVEN** 用户在 Tag 输入框输入 "performance"
- **WHEN** 输入防抖结束后触发筛选
- **THEN** 应调用 `project_memory_list` 并传入 tag="performance"
- **AND** 列表应仅显示包含 "performance" 标签的记忆

#### Scenario: 组合筛选

- **GIVEN** 用户同时设置 kind="known_issue" 和 importance="high"
- **WHEN** 触发筛选
- **THEN** 应调用 `project_memory_list` 并传入两个筛选条件
- **AND** 列表应仅显示同时满足两个条件的记忆

---

### Requirement: 记忆列表显示

系统 MUST 以卡片形式展示记忆列表,包含 kind badge、importance、title、summary、时间等关键信息。

#### Scenario: 列表项基本信息

- **GIVEN** 一条记忆数据
- **WHEN** 在列表中渲染该记忆
- **THEN** 应显示 kind badge(如 "笔记"、"已知问题")
- **AND** 显示 importance 标识(如高优先级用红色标记)
- **AND** 显示 title 作为主标题
- **AND** 显示 summary 作为副文本
- **AND** 显示创建时间或更新时间

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
- **AND** 提示文案如 "暂无记忆,点击下方新增记忆"

---

### Requirement: 详情区显示和编辑

系统 MUST 在右侧详情区显示选中记忆的完整信息,支持编辑和删除操作。

#### Scenario: 显示详情信息

- **GIVEN** 用户选中一条记忆
- **WHEN** 详情区加载完成
- **THEN** 应显示 title 输入框(可编辑)
- **AND** 显示 detail 文本域(可编辑)
- **AND** 显示保存和删除按钮

#### Scenario: 编辑并保存

- **GIVEN** 用户修改 title 为 "新标题"
- **AND** 修改 detail 为 "新详情"
- **WHEN** 用户点击保存按钮
- **THEN** 应调用 `project_memory_update`
- **AND** 更新成功后刷新列表
- **AND** 详情区显示更新后的内容

#### Scenario: 删除记忆确认

- **GIVEN** 用户点击删除按钮
- **WHEN** 触发删除操作
- **THEN** 应弹出确认对话框
- **AND** 对话框文案如 "确定删除这条记忆吗?此操作不可撤销"

#### Scenario: 确认删除后执行

- **GIVEN** 用户在确认对话框点击"确定"
- **WHEN** 执行删除操作
- **THEN** 应调用 `project_memory_delete`
- **AND** 删除成功后从列表移除该项
- **AND** 清空详情区或选中下一项

---

### Requirement: 创建记忆区域

系统 MUST 在弹窗底部提供创建区域,包含 Title 输入框、Detail 文本域、新增按钮。

#### Scenario: 填写并创建记忆

- **GIVEN** 用户在创建区域填写 title="测试记忆"
- **AND** 填写 detail="这是测试详情"
- **WHEN** 用户点击"新增"按钮
- **THEN** 应调用 `project_memory_create`
- **AND** 创建成功后清空输入框
- **AND** 刷新列表并选中新创建的记忆

#### Scenario: 必填字段验证

- **GIVEN** 用户未填写 title
- **WHEN** 用户点击"新增"按钮
- **THEN** 应阻止提交
- **AND** 显示错误提示 "请输入标题"

---

### Requirement: 分页控制

系统 MUST 提供分页控件,支持上一页、下一页、页码显示等操作。

#### Scenario: 显示分页信息

- **GIVEN** 当前 page=0, pageSize=50, total=100
- **WHEN** 渲染分页控件
- **THEN** 应显示 "1-50 of 100"
- **AND** 显示上一页和下一页按钮

#### Scenario: 下一页操作

- **GIVEN** 当前 page=0
- **WHEN** 用户点击"下一页"按钮
- **THEN** 应设置 page=1
- **AND** 调用 `project_memory_list` 加载第二页数据
- **AND** 更新分页信息为 "51-100 of 100"

#### Scenario: 上一页操作

- **GIVEN** 当前 page=1
- **WHEN** 用户点击"上一页"按钮
- **THEN** 应设置 page=0
- **AND** 调用 `project_memory_list` 加载第一页数据
- **AND** 更新分页信息为 "1-50 of 100"

#### Scenario: 首页禁用上一页

- **GIVEN** 当前 page=0
- **WHEN** 渲染分页控件
- **THEN** "上一页"按钮应禁用
- **AND** 点击无效果

#### Scenario: 末页禁用下一页

- **GIVEN** 当前 page=1 且 total=100, pageSize=50
- **WHEN** 渲染分页控件
- **THEN** "下一页"按钮应禁用
- **AND** 点击无效果

---

### Requirement: 设置面板

系统 MUST 在项目记忆设置面板中将“对话记忆上下文注入”呈现为默认关闭且不可交互状态。

#### Scenario: 显示默认关闭且置灰

- **WHEN** 用户打开项目记忆设置面板
- **THEN** “启用对话记忆上下文注入”开关 SHALL 显示为关闭
- **AND** 开关控件 SHALL 呈现禁用样式（置灰）

#### Scenario: 用户不可点击切换

- **WHEN** 用户点击该开关
- **THEN** 系统 SHALL 不发生状态切换
- **AND** 不应写入新的注入开关配置

#### Scenario: workspace 切换行为一致

- **WHEN** 用户切换到其他 workspace 后再次打开设置面板
- **THEN** 该开关 SHALL 仍保持关闭且禁用状态

---

### Requirement: 加载状态和错误处理

系统 MUST 提供加载状态指示和友好的错误提示。

#### Scenario: 列表加载状态

- **GIVEN** 正在加载记忆列表
- **WHEN** API 请求进行中
- **THEN** 应显示加载动画或骨架屏
- **AND** 禁用用户操作

#### Scenario: 加载失败错误提示

- **GIVEN** API 请求失败(如网络错误)
- **WHEN** 捕获错误
- **THEN** 应显示错误提示 "加载失败,请重试"
- **AND** 提供重试按钮

#### Scenario: 操作成功提示

- **GIVEN** 创建/更新/删除操作成功
- **WHEN** API 返回成功
- **THEN** 应显示成功提示(如 "保存成功")
- **AND** 提示 3 秒后自动消失

---

### Requirement: 响应式布局

系统 MUST 支持不同窗口尺寸下的响应式布局。

#### Scenario: 标准窗口布局(≥1200px)

- **GIVEN** 窗口宽度 ≥ 1200px
- **WHEN** 渲染管理弹窗
- **THEN** 列表区占 38% 宽度
- **AND** 详情区占 62% 宽度

#### Scenario: 小窗口布局(<1200px)

- **GIVEN** 窗口宽度 < 1200px
- **WHEN** 渲染管理弹窗
- **THEN** 列表和详情应垂直堆叠
- **OR** 提供 Tab 切换在列表和详情间切换

---

### Requirement: 国际化支持

系统 MUST 支持中英文切换,所有 UI 文本从 i18n 资源文件加载。

#### Scenario: 中文界面

- **GIVEN** 用户语言设置为中文
- **WHEN** 打开管理弹窗
- **THEN** 所有文本应显示中文
- **AND** Kind 标签显示 "笔记"、"对话"、"已知问题" 等

#### Scenario: 英文界面

- **GIVEN** 用户语言设置为英文
- **WHEN** 打开管理弹窗
- **THEN** 所有文本应显示英文
- **AND** Kind 标签显示 "Note"、"Conversation"、"Known Issue" 等

### Requirement: 历史会话记忆摘要兼容展示

系统 MUST 将旧格式记忆注入前缀统一渲染为“记忆上下文摘要”卡片，保证历史与实时样式一致；当同一轮已经存在 assistant 侧 memory summary item 时，系统 MUST 避免在 user bubble 中重复渲染第二张等价摘要卡片。

#### Scenario: 兼容旧用户注入前缀

- **WHEN** 用户消息以旧前缀开头（如 `[对话记录] ... 用户输入/助手输出摘要/助手输出 ...`）
- **THEN** 系统 SHALL 将该前缀内容解析为摘要卡片
- **AND** 消息正文 SHALL 仅展示真实用户输入文本

#### Scenario: 兼容 XML 注入前缀

- **WHEN** 用户消息包含前置 `<project-memory ...>...</project-memory>` 注入块
- **THEN** 系统 SHALL 将注入块内容映射为摘要卡片
- **AND** 注入块后续正文 SHALL 按普通用户消息渲染

#### Scenario: 同一轮 realtime summary 不重复渲染

- **WHEN** Codex 发送链已经为本轮插入一条 assistant `记忆上下文摘要` 卡片
- **AND** 稍后 authoritative user message 仍携带等价的 injected memory wrapper
- **THEN** 幕布 SHALL 只渲染一张等价 `记忆上下文摘要` 卡片
- **AND** user bubble SHALL 仅显示真实用户输入文本

#### Scenario: 仅助手摘要消息隐藏复制按钮

- **WHEN** 助手消息仅包含摘要卡片且无正文
- **THEN** 系统 SHALL 隐藏正文复制按钮
- **AND** 用户消息即使带摘要卡片也 SHALL 保持原有复制行为

### Requirement: Composer-Adjacent Memory Feedback SHALL Stay Ledger-Traceable

系统 MUST 让用户从 Composer 附近看到的手动记忆反馈与 Context Ledger 使用同一套来源语义，而不要求重做现有项目记忆管理面板。

#### Scenario: manual memory selection keeps stable provenance in ledger

- **WHEN** 用户通过 `@@` 选择某条项目记忆
- **THEN** Composer 附近的 ledger surface SHALL 使用稳定标题回退与 memory provenance 展示该记忆
- **AND** 该展示 SHALL NOT 依赖修改原始项目记忆详情结构

#### Scenario: composer feedback and ledger stay in sync

- **WHEN** 当前发送的手动记忆选择集合发生变化
- **THEN** 现有 Composer 反馈与 ledger surface SHALL 同步更新
- **AND** 用户 SHALL NOT 看到两套不同步的选择结果

