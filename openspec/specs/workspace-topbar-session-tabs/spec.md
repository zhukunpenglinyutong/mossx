# workspace-topbar-session-tabs Specification

## Purpose

Defines the workspace-topbar-session-tabs behavior contract, covering Workspace Chat Topbar SHALL Expose Opened Session Tabs.

## Requirements
### Requirement: Workspace Chat Topbar SHALL Expose Opened Session Tabs

系统 MUST 在 desktop workspace chat 主 topbar 提供会话 tab 区域。

#### Scenario: tab strip appears when activated sessions exist
- **WHEN** 用户位于 desktop workspace chat 且已有至少一个激活会话
- **THEN** topbar MUST 渲染会话 tab 区域
- **AND** 每个 tab MUST 提供可识别会话标识

#### Scenario: non-workspace surfaces do not render session tabs
- **WHEN** 用户位于非 workspace chat 视图（如 home/settings）
- **THEN** 系统 MUST NOT 渲染该 tab 区域

#### Scenario: phone and tablet keep existing navigation
- **WHEN** 用户位于 phone 或 tablet 布局
- **THEN** 系统 MUST NOT 渲染 desktop topbar session tabs

### Requirement: Topbar Session Tab Admission MUST Follow Active-Thread Event Contract

系统 MUST 仅以 active-thread 切换事件作为 topbar tab 准入条件。

#### Scenario: activated thread enters rotation window
- **WHEN** 用户通过现有链路切换到某个 thread
- **THEN** 该 thread MUST 进入 topbar 轮转窗口

#### Scenario: non-activated thread does not enter topbar window
- **WHEN** 某 thread 仅存在列表但从未激活
- **THEN** 该 thread MUST NOT 自动进入 topbar 窗口

### Requirement: Topbar Session Tabs SHALL Enforce Deterministic Rotation Window

系统 MUST 对 topbar 会话 tabs 采用 `max=5` 的确定性轮转窗口，并确保 active 会话可见。

#### Scenario: activating sixth session rotates out oldest non-active tab
- **GIVEN** topbar 已显示 5 个会话 tabs
- **WHEN** 用户激活第 6 个不同会话
- **THEN** topbar MUST 保持 5 个 tabs
- **AND** MUST 淘汰最旧且非当前 active 的 tab

#### Scenario: re-activating existing tab does not create duplicates
- **WHEN** 用户激活已在窗口中的会话
- **THEN** 系统 MUST 更新其最近激活顺序
- **AND** topbar MUST NOT 产生重复 tab

#### Scenario: active session remains visible during rotation
- **WHEN** 轮转窗口发生淘汰
- **THEN** 当前 active 会话 MUST 保持可见

#### Scenario: eviction tie is resolved deterministically
- **GIVEN** 存在多个并列“最旧且非 active”候选
- **WHEN** 系统执行轮转淘汰
- **THEN** 系统 MUST 先按 `activationOrdinal` 升序选择淘汰项
- **AND** 序号并列时 MUST 按 `workspaceId::threadId` 字典序兜底

### Requirement: Topbar Session Rotation Window SHALL Be Global Across Workspaces

系统 MUST 使用跨 workspace 全局窗口，允许不同 workspace 会话并存于同一 tab 组。

#### Scenario: activation across workspaces coexists in one window
- **GIVEN** workspace A 与 workspace B 都有激活会话
- **WHEN** 用户跨 workspace 交替激活会话
- **THEN** topbar MUST 在同一窗口中展示它们（受 `max=5` 约束）

#### Scenario: cross-workspace activation still keeps deterministic eviction
- **WHEN** 全局窗口超出 4 个会话
- **THEN** 系统 MUST 按统一轮转规则淘汰
- **AND** MUST NOT 因 workspace 边界导致不确定行为

### Requirement: Topbar Tab Switch AND Highlight SHALL Use Workspace+Thread Identity

系统 MUST 以 `workspaceId + threadId` 作为切换与高亮判定身份键。

#### Scenario: clicking tab switches by explicit workspace-thread pair
- **WHEN** 用户点击某个非 active tab
- **THEN** 系统 MUST 使用该 tab 自带的 `workspaceId/threadId` 切换上下文

#### Scenario: active highlight does not mismatch across workspaces
- **GIVEN** 多个 workspace 都存在同名/相似会话
- **WHEN** active 会话变化
- **THEN** 仅匹配相同 `workspaceId + threadId` 的 tab 可高亮

### Requirement: Topbar Tab Label MUST Use Deterministic Fallback and Truncation

系统 MUST 使用固定文案链和固定截断策略生成 tab 文本。

#### Scenario: title is used when available
- **WHEN** thread 标题可解析且非空
- **THEN** tab 文案 MUST 使用该标题

#### Scenario: empty title falls back to localized untitled label
- **WHEN** thread 标题为空或不可解析
- **THEN** tab 文案 MUST 回退到本地化 `Untitled Session + shortThreadId`

#### Scenario: display label truncates after seven characters
- **WHEN** tab 文本超过 7 个字
- **THEN** 展示文本 MUST 以 `...` 结尾
- **AND** 完整文本 MUST 可从 tooltip/aria 获取

### Requirement: Topbar Tab MUST Provide Close Action Without Lifecycle Side Effects

系统 MUST 将 topbar tab 的关闭能力定义为“窗口管理”，而不是 thread 生命周期操作。

#### Scenario: single close still removes tab from topbar window only

- **WHEN** 用户点击 tab 的 `X`
- **THEN** 该 tab MUST 从 topbar 窗口移除
- **AND** 系统 MUST NOT 删除 thread
- **AND** 系统 MUST NOT 终止会话运行

#### Scenario: close all removes every visible topbar tab only

- **WHEN** 用户在某个 topbar tab 上触发 `关闭全部标签`
- **THEN** 当前 topbar 窗口中的所有 tab MUST 被移除
- **AND** 系统 MUST NOT 删除任何 thread
- **AND** 系统 MUST NOT 终止任何会话运行

#### Scenario: close completed removes only non-processing visible tabs

- **WHEN** 用户触发 `关闭全部已完成标签`
- **THEN** 系统 MUST 仅移除当前 topbar 窗口中 `isProcessing = false` 的 tab
- **AND** `isProcessing = true` 的 tab MUST 被保留
- **AND** `isProcessing` 状态未知（缺失/未初始化）的 tab MUST 被保留
- **AND** 该动作 MUST NOT 删除 thread 或终止会话运行

#### Scenario: close left removes only tabs left of the target tab

- **GIVEN** topbar 窗口中存在位于目标 tab 左侧的可见 tabs
- **WHEN** 用户触发 `关闭左侧标签`
- **THEN** 系统 MUST 仅移除目标 tab 左侧的可见 tabs
- **AND** 目标 tab 与其右侧 tabs MUST 保留

#### Scenario: close right removes only tabs right of the target tab

- **GIVEN** topbar 窗口中存在位于目标 tab 右侧的可见 tabs
- **WHEN** 用户触发 `关闭右侧标签`
- **THEN** 系统 MUST 仅移除目标 tab 右侧的可见 tabs
- **AND** 目标 tab 与其左侧 tabs MUST 保留

#### Scenario: active close falls back to adjacent remaining tab

- **GIVEN** 当前 active tab 被单个关闭或批量关闭动作移出 topbar 窗口
- **WHEN** 关闭后 topbar 窗口仍存在剩余 tabs
- **THEN** 系统 MUST 优先选择关闭前位置右侧最近的剩余 tab
- **AND** 若右侧不存在，则 MUST 选择左侧最近的剩余 tab

#### Scenario: closing active tab with no remaining tabs clears topbar highlight only

- **WHEN** 当前 active tab 被关闭后 topbar 窗口已无剩余 tab
- **THEN** 系统 MUST 清空 topbar 当前高亮
- **AND** MUST NOT 因此删除 thread 或终止会话运行

### Requirement: Topbar Session Tabs SHALL Expose Batch Close Context Menu

系统 MUST 在每个可见 topbar tab 上提供右键上下文菜单，以支持批量关闭动作。

#### Scenario: tab context menu exposes close actions

- **WHEN** 用户在某个 topbar tab 上打开上下文菜单
- **THEN** 菜单 MUST 提供 `关闭标签`、`关闭左侧标签`、`关闭右侧标签`、`关闭全部标签`、`关闭全部已完成标签`

#### Scenario: keyboard context menu trigger is supported on desktop

- **WHEN** 用户在聚焦的 topbar tab 上按下 `ContextMenu` 键或 `Shift+F10`
- **THEN** 系统 MUST 打开与鼠标右键等价的上下文菜单

#### Scenario: unavailable batch actions are disabled

- **WHEN** 目标 tab 左侧没有 tab、右侧没有 tab，或当前窗口没有已完成 tab
- **THEN** 对应批量关闭动作 MUST 以禁用态呈现
- **AND** 系统 MUST NOT 以 silent no-op 方式吞掉该操作

### Requirement: Phase-One Topbar Tabs MUST Avoid Introducing Overflow Interaction

第一阶段系统 MUST 保持固定 5 槽轮转模型，不引入 `+N` overflow 菜单。

#### Scenario: more than five sessions still uses rotation only
- **WHEN** 激活会话数量超过 5
- **THEN** 系统 MUST 按轮转规则更新主窗口
- **AND** MUST NOT 展示新的 `+N` overflow 入口

### Requirement: Phase-One Topbar Window State SHALL Be Runtime-Local

第一阶段 topbar 轮转窗口状态 MUST 仅存在于运行时，不做重启恢复。

#### Scenario: app restart resets topbar session window
- **WHEN** 用户重启应用后再次进入 workspace chat
- **THEN** topbar 会话窗口 MUST 以空状态启动
- **AND** 后续内容 MUST 由新的激活事件重建

### Requirement: Topbar Session Tabs SHALL Be Win/mac Titlebar Compatible

系统 MUST 保持 Win/mac 下 tabs 区域与 titlebar 控件、拖拽区兼容。

#### Scenario: macOS traffic-light controls remain unobstructed
- **WHEN** 应用运行在 macOS desktop
- **THEN** tabs 区域 MUST NOT 覆盖左侧窗口控制区

#### Scenario: Windows window controls remain clickable
- **WHEN** 应用运行在 Windows desktop
- **THEN** tabs 区域 MUST NOT 覆盖右侧窗口控制区

#### Scenario: tab click target is not swallowed by drag region
- **WHEN** 用户点击 topbar tab 或 tab 关闭按钮
- **THEN** 点击事件 MUST 被组件接收
- **AND** MUST NOT 因 drag region 配置导致失效

