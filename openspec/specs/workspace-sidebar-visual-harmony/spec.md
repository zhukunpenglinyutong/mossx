# workspace-sidebar-visual-harmony Specification

## Purpose

统一工作区侧栏（rail + projects）的视觉层级、滚动语义与 topbar 联动规则，降低导航认知负担并保持操作区稳定。
## Requirements
### Requirement: 项目管理区必须保持单主焦点视觉语义

系统 MUST 在左侧项目管理区采用单主焦点规则，避免 workspace 与 thread 同时使用主高亮样式。

#### Scenario: active thread takes primary focus

- **GIVEN** 用户在某 workspace 内打开某条 thread
- **WHEN** 侧栏渲染 active 状态
- **THEN** active thread MUST 使用主高亮样式
- **AND** 所属 workspace MUST 仅使用次级上下文样式

#### Scenario: no active thread fallback

- **GIVEN** 当前 workspace 下没有 active thread
- **WHEN** 侧栏渲染 active 状态
- **THEN** workspace 行 MAY 使用主高亮样式作为回退

### Requirement: 项目管理区层级必须可辨识

系统 MUST 在 workspace、worktree、thread 三层之间提供稳定的视觉层级差异（字号、间距、色彩或图标强度）。

#### Scenario: hierarchy scan

- **GIVEN** 用户查看侧栏项目区
- **WHEN** 在不点击的情况下进行视觉扫描
- **THEN** 用户 MUST 能区分 workspace、worktree、thread 三类条目

### Requirement: 项目管理区密度节奏必须连续

系统 MUST 保持 market links 到 projects 列表的视觉节奏连续，避免突兀的面板割裂感。

#### Scenario: section transition

- **GIVEN** 左侧栏同时展示 market links 与 projects section
- **WHEN** 页面首次渲染
- **THEN** sections MUST 通过统一 spacing/divider 过渡
- **AND** MUST NOT 出现独立厚重容器造成的视觉割裂

### Requirement: 左侧图标栏必须独立且不参与内容滚动

系统 MUST 提供独立 rail 作为左侧全局入口区，并与项目列表滚动区域解耦。

#### Scenario: rail remains fixed while list scrolls

- **GIVEN** 侧栏中项目列表内容超过可视高度
- **WHEN** 用户滚动项目列表
- **THEN** rail MUST 保持固定位置
- **AND** 仅项目列表区域发生滚动

#### Scenario: rail supports collapsed and expanded states

- **GIVEN** 用户操作 rail 折叠按钮
- **WHEN** rail 在折叠态与展开态切换
- **THEN** rail MUST 保持图标可访问
- **AND** 不影响项目列表的滚动与点击行为

### Requirement: Topbar 标题迁移必须遵循侧栏可见性规则

系统 MUST 在侧栏展开时将项目标题入口迁移至侧栏头部，并在侧栏收起时恢复到主 topbar。

#### Scenario: sidebar expanded in workspace view

- **GIVEN** 用户处于工作区对话视图且侧栏处于展开状态
- **WHEN** 页面渲染顶部导航
- **THEN** 项目标题入口 MUST 显示在侧栏头部
- **AND** 主 topbar 右侧操作区 MUST 保持原位

#### Scenario: sidebar collapsed

- **GIVEN** 侧栏处于收起状态
- **WHEN** 页面渲染顶部导航
- **THEN** 项目标题入口 MUST 回到主 topbar 原位置

### Requirement: 左右 Topbar 高度与下拉可见性必须稳定

系统 MUST 保证侧栏头部与主 topbar 高度一致，并确保项目下拉在侧栏头部场景不被裁剪。

#### Scenario: topbar height parity

- **GIVEN** 页面同时显示侧栏头部与主 topbar
- **WHEN** 顶部区域渲染完成
- **THEN** 两侧 topbar MUST 使用同一高度基线
- **AND** 分割线 MUST 视觉对齐

#### Scenario: project dropdown visibility in sidebar header

- **GIVEN** 项目入口位于侧栏头部
- **WHEN** 用户展开项目下拉
- **THEN** 下拉 MUST 完整可见且可交互
- **AND** MUST NOT 被上层容器裁剪或遮罩

### Requirement: Sidebar Rail SHALL Provide Spec Hub Entry at Bottom

系统 SHALL 在左侧侧栏 rail 底部提供 Spec Hub icon 入口，使用户在会话工作流中可直接进入 Spec Hub。

#### Scenario: Bottom rail entry is visible in workspace session view

- **GIVEN** 用户位于任意 workspace 会话视图
- **WHEN** 左侧 rail 渲染完成
- **THEN** rail 底部 SHALL 展示 Spec Hub icon 入口
- **AND** 入口 SHALL 提供可识别 tooltip 或可访问性标签
- **AND** tooltip/可访问性标签文案 SHALL 通过 i18n key 渲染并随 locale 切换

#### Scenario: Open Spec Hub from bottom rail entry

- **GIVEN** 用户位于会话视图
- **WHEN** 用户点击 rail 底部 Spec Hub icon
- **THEN** 系统 SHALL 打开 Spec Hub 视图
- **AND** 欢迎页原有 Spec Hub 入口 SHALL 继续可用

### Requirement: 右侧文件树根节点视觉层级必须稳定可辨识
系统 MUST 在右侧文件树中为工作区根节点提供稳定且可辨识的视觉层级，避免与普通目录节点混淆。

#### Scenario: root visual hierarchy is distinguishable
- **WHEN** 用户查看右侧文件树顶部区域
- **THEN** 工作区根节点 MUST 在字号、字重、间距、图标强度中至少一项与普通目录形成稳定差异
- **AND** 该差异 MUST 在主题切换与刷新后保持一致

#### Scenario: root row operation anchors remain aligned
- **WHEN** 根节点行展示右侧操作入口（如刷新、新建或更多操作）
- **THEN** 操作入口 MUST 与现有文件树头部视觉基线对齐
- **AND** MUST NOT 遮挡根节点文本、折叠箭头或影响点击命中区

### Requirement: 顶部工具行布局必须容纳搜索框与操作区
系统 MUST 在文件树顶部工具行中同时容纳搜索输入框、文件计数与右侧操作按钮，保持可读与可点击性。

#### Scenario: top row composition remains readable
- **WHEN** 顶部工具行渲染根节点标题、搜索框、文件计数与操作按钮
- **THEN** 各元素 MUST 保持可见且层级清晰
- **AND** MUST NOT 出现元素互相遮挡或文本裁剪

#### Scenario: narrow width fallback remains usable
- **WHEN** 文件树容器处于常见窄宽度（如截图布局）
- **THEN** 搜索框输入与 placeholder MUST 保持可读可输入
- **AND** 右侧计数与按钮 MUST 保持可点击

### Requirement: 根节点顶部区吸顶层级必须稳定
系统 MUST 保证根节点顶部区在文件树滚动时保持吸顶固定，并维持稳定层级与可交互性。

#### Scenario: sticky top zone remains pinned
- **WHEN** 用户滚动文件列表
- **THEN** 根节点顶部区 MUST 固定在文件树视口顶部
- **AND** 文件内容 MUST 在其下方滚动而非推动顶部区离开视口

#### Scenario: sticky top zone does not lose hit targets
- **WHEN** 滚动过程中内容经过顶部区下方
- **THEN** 顶部区按钮与菜单触发区域 MUST 保持可点击
- **AND** MUST NOT 出现点击穿透或层级被覆盖

### Requirement: 项目折叠态 MUST 保持会话状态信号可见
系统 MUST 在 workspace/worktree 折叠态下保持会话状态信号可见，确保用户无需展开线程列表也能感知运行状态。

#### Scenario: collapsed workspace shows running signal
- **GIVEN** 某 workspace 或其 worktree 下存在至少一个进行中会话
- **WHEN** 该 workspace 处于折叠态
- **THEN** 对应 workspace 行 MUST 显示进行中状态信号
- **AND** 信号 MUST 不依赖子线程列表是否展开

#### Scenario: collapsed workspace shows recent-complete hint
- **GIVEN** 某 workspace 下有会话在近期窗口内完成
- **WHEN** 用户查看折叠态项目树
- **THEN** 对应 workspace 行 MUST 提供最近完成提示
- **AND** 提示 SHALL 在超过定义窗口后自动衰减

### Requirement: 项目级信号 MUST 反映 worktree 汇总状态

系统 MUST 将主 workspace 与其 worktree 会话状态、默认 active projection 与 degraded state 做聚合，避免用户遗漏子工作树中的活跃会话，或在不同 surface 上看到相互矛盾的项目会话事实。

#### Scenario: worktree running contributes to parent workspace indicator

- **GIVEN** 主 workspace 自身无进行中会话
- **AND** 其任一 worktree 存在进行中会话
- **WHEN** 侧栏渲染主 workspace 行
- **THEN** 主 workspace 行 MUST 呈现进行中信号

#### Scenario: all worktrees idle clears parent running indicator

- **WHEN** 主 workspace 及其所有 worktree 均无进行中会话
- **THEN** 主 workspace 行 MUST 清除进行中信号
- **AND** 不得残留过期运行态样式

#### Scenario: main workspace row uses shared project active projection

- **WHEN** 侧栏为某个 main workspace 渲染默认会话集合或数量提示
- **THEN** 该集合 MUST 基于 main workspace 与 child worktrees 的共享 active projection
- **AND** MUST NOT 仅依赖本地线程列表推断项目总量

#### Scenario: worktree row remains isolated from parent projection

- **WHEN** 侧栏为某个 worktree 渲染默认会话集合或数量提示
- **THEN** 该集合 MUST 只基于该 worktree 自身的 active projection
- **AND** MUST NOT 隐式混入 parent main workspace 或 sibling worktrees 的结果

#### Scenario: degraded active projection stays explainable

- **WHEN** 共享 active projection 存在 partial/degraded source
- **THEN** 侧栏 MUST 能为当前 workspace 行渲染可解释提示或等效状态
- **AND** MUST NOT 把该结果表现成“完整准确的项目会话总量”

#### Scenario: running child session keeps exited parent visible under hide-exited mode

- **WHEN** hide-exited mode is enabled for a workspace or worktree
- **AND** an exited ancestor row still owns a running, reviewing, or otherwise active descendant session
- **THEN** the ancestor row SHALL remain visible as hierarchy context
- **AND** only inactive exited leaf rows SHALL be hidden

### Requirement: exited session visibility toggle MUST be project-scoped and icon-level

系统 MUST 将 exited session visibility 视为 workspace/worktree row 级别的显示偏好，并在 leading icon 附近提供稳定的 icon-level affordance，而不是在 thread list 内渲染独立的常驻条带。

#### Scenario: workspace row exposes icon-level exited visibility toggle

- **GIVEN** 某 workspace 当前列表中存在至少一条 exited session
- **WHEN** 侧栏渲染该 workspace 行
- **THEN** 该 workspace 行 MUST 在 leading icon 附近提供 show/hide exited sessions 的 icon affordance
- **AND** keyboard 激活该 affordance 时 MUST NOT 触发父级 row 的 collapse / expand 热键
- **AND** thread list 内 MUST NOT 再渲染同语义的常驻 pill bar

#### Scenario: path-scoped visibility survives list rebuild

- **WHEN** workspace / worktree rows are rebuilt after refresh
- **THEN** exited visibility preference SHALL be restored by normalized workspace path
- **AND** sibling worktrees and parent workspace SHALL NOT share the same preference unless their normalized path is identical

### Requirement: Sidebar Root Session Visibility MUST Be Workspace Configurable

系统 MUST 允许每个 workspace 配置 sidebar 折叠态默认显示的 root 会话数量。该设置 MUST 由会话管理页维护，并在 workspace / worktree / folder tree 的线程列表中使用同一阈值语义。

#### Scenario: sidebar uses workspace-specific root visibility count
- **WHEN** 某个 workspace settings 配置了 `visibleThreadRootCount`
- **THEN** sidebar 折叠态 MUST 仅默认显示该数量以内的 unpinned root 会话
- **AND** 该阈值 MUST 同时作用于该 workspace 的根列表、worktree 列表与 folder tree root 列表

#### Scenario: sidebar falls back to default root visibility count
- **WHEN** workspace settings 不包含 `visibleThreadRootCount`
- **THEN** sidebar 折叠态 MUST 使用默认值 `20`
- **AND** 默认值语义 MUST 与显式保存 `20` 一致

#### Scenario: invalid workspace visibility count is clamped
- **WHEN** workspace settings 中的 `visibleThreadRootCount` 不是有效正整数，或超出支持范围
- **THEN** 系统 MUST 在消费前将其收敛到受支持范围内
- **AND** 系统 MUST NOT 因无效值导致 sidebar 空白、全量展开或分页语义漂移

#### Scenario: more button follows configured threshold
- **WHEN** 某个 workspace 的 root 会话数量超过当前生效阈值
- **THEN** sidebar MUST 显示 `More...`
- **AND** 仅当 root 会话数量严格大于当前阈值时才显示该入口

#### Scenario: collapsed state prefers local expansion before pagination
- **WHEN** 某个 workspace 仍有 `nextCursor`
- **AND** 当前折叠态下 root 会话数量已经超过当前生效阈值
- **THEN** sidebar MUST 优先展示 `More...` 来展开当前已加载结果
- **AND** MUST NOT 在该状态下直接展示 `Load older...`

#### Scenario: expanded state preserves existing pagination semantics
- **WHEN** 用户已经展开当前 workspace 的 root 会话列表
- **THEN** sidebar MUST 展示当前已加载的全部 root 会话
- **AND** 若存在 `nextCursor`，系统 MAY 继续展示 `Load older...`
- **AND** 该行为 MUST NOT 因可见阈值配置而改变原有分页语义

### Requirement: Main Topbar Composition MUST Reserve Stable Session Tab Zone

系统 MUST 在 desktop workspace chat 的主 topbar 标题区与右侧操作区之间保留稳定会话 tab 区域，并保持既有标题迁移规则不回退。

#### Scenario: sidebar expanded keeps title relocation and tab zone together
- **GIVEN** 用户位于 desktop workspace chat 且侧栏展开
- **WHEN** 主 topbar 渲染完成
- **THEN** 主 topbar MUST 保留会话 tabs 区域
- **AND** 右侧操作区 MUST 保持原有可点击行为

#### Scenario: sidebar collapsed keeps title return and tab zone coexistence
- **GIVEN** 用户位于 desktop workspace chat 且侧栏收起
- **WHEN** 主 topbar 渲染会话 tabs
- **THEN** 标题入口、会话 tabs、右侧操作区 MUST 同时可访问
- **AND** MUST NOT 相互覆盖

#### Scenario: phone and tablet keep existing topbar composition
- **WHEN** 用户位于 phone 或 tablet 布局
- **THEN** 系统 MUST 保持现有移动端顶部导航结构

### Requirement: Topbar Narrow-Width Fallback MUST Preserve Operability

在窄宽度布局下，系统 MUST 维持“active tab 可见 + 核心操作可点”。

#### Scenario: narrow width keeps active tab visible
- **GIVEN** 窗口宽度位于 `800px~1023px`
- **WHEN** topbar 可用宽度下降
- **THEN** active tab MUST 保持可见
- **AND** 非 active tabs MUST 允许收缩截断

#### Scenario: narrow width does not break core action hit targets
- **GIVEN** 窗口宽度位于 `800px~1279px`
- **WHEN** topbar 渲染会话 tabs
- **THEN** 运行控制、终端、solo 等核心按钮 MUST 可点击
- **AND** 核心按钮命中区 MUST NOT 小于 `28x28px`

### Requirement: Topbar Session Tab Group MUST Use Connected Square Buttons Without Outer Border

会话 tab 组 MUST 使用紧密连接的直角按钮风格，且不显示组外边框。

#### Scenario: tab group renders as connected square buttons
- **WHEN** topbar 会话 tabs 渲染
- **THEN** tabs MUST 以连接按钮组呈现（无圆角）
- **AND** tabs 之间 MAY 使用分隔语义

#### Scenario: tab group has no outer border
- **WHEN** topbar 会话 tabs 渲染
- **THEN** tab 组外框 MUST 不显示
- **AND** 不得因外框导致与标题区或操作区视觉冲突

### Requirement: Topbar Session Zone MUST Respect Platform Titlebar Insets

系统 MUST 在 Win/mac 下遵守既有 titlebar inset 与窗口控制区约束。

#### Scenario: macOS left inset contract remains valid
- **WHEN** 系统在 macOS desktop 渲染主 topbar
- **THEN** 会话 tabs 区域 MUST 遵循左侧 inset 规则
- **AND** MUST NOT 侵入 traffic-light 控件保留区

#### Scenario: Windows right controls inset contract remains valid
- **WHEN** 系统在 Windows desktop 渲染主 topbar
- **THEN** 会话 tabs 区域 MUST 为右侧窗口控制区预留空间
- **AND** MUST NOT 遮挡 close/minimize/maximize 控件

### Requirement: Desktop Layout Mode Preference MUST Support Default and Swapped Modes

系统 MUST 提供 desktop 布局模式偏好（`default` / `swapped`），并在不改变中心对话主视图的前提下切换左右面板位置。

#### Scenario: switched layout mirrors side panels while preserving center flow

- **WHEN** 用户将布局模式切换为 `swapped`
- **THEN** 左右侧栏与拖拽方向 MUST 进入镜像布局
- **AND** 中间消息区与输入区 MUST 保持连续可用

#### Scenario: invalid persisted layout mode falls back to default

- **WHEN** 持久化配置中的布局模式值非法或缺失
- **THEN** 系统 MUST 回退到 `default`
- **AND** 不得导致 topbar/titlebar 控件错位或点击失效

### Requirement: Swapped Sidebar Quick Entries MUST Keep Deterministic Ordering and Shortcut Labels

在 `swapped` 模式下，侧栏快捷入口（会话/看板）顺序与快捷键文案 MUST 保持稳定、可预测。

#### Scenario: swapped mode keeps quick-entry ordering contract

- **WHEN** 用户进入 `swapped` 布局
- **THEN** 侧栏快捷入口 MUST 维持既定排序规则
- **AND** 不得出现与默认布局不一致的顺序漂移

#### Scenario: swapped mode keeps shortcut labels aligned with actual actions

- **WHEN** 用户在 `swapped` 布局查看快捷键提示
- **THEN** 显示文案 MUST 与实际触发动作一致
- **AND** 不得出现入口与快捷键映射错配

### Requirement: Thread Pin Toggle Interaction MUST Be Hover-Revealed and Non-Disruptive

根线程行的 pin/unpin 入口 MUST 在悬停或键盘聚焦时显示，且 pin 操作不得误触发线程切换。

#### Scenario: root thread rows reveal pin toggle on hover/focus only

- **WHEN** 用户悬停或聚焦根线程行
- **THEN** 系统 MUST 显示图钉切换入口
- **AND** 非根线程行 MUST NOT 显示该入口

#### Scenario: clicking pin toggle does not select thread

- **WHEN** 用户点击图钉切换入口
- **THEN** 系统 MUST 仅执行 pin/unpin 状态切换
- **AND** MUST NOT 触发线程选中或导航

#### Scenario: unpin from pinned section updates lists without stale duplicates

- **WHEN** 用户在固定区点击某线程的 `Unpin`
- **THEN** 该线程 MUST 从固定区移除并回到常规线程列表
- **AND** 系统 MUST NOT 保留残留项或产生重复行

### Requirement: Sidebar Workspace Label MUST Support Optional Alias

系统 MUST 允许 workspace 拥有一个仅用于左侧 sidebar 展示的可选别名。该别名 MUST NOT 改变 workspace identity、路径、session 归属、runtime 连接、排序、分组或非 sidebar surface 的项目名称。

#### Scenario: sidebar shows alias when configured

- **WHEN** workspace settings contain a non-empty `projectAlias`
- **THEN** the left sidebar workspace row MUST display that alias as the workspace label
- **AND** the row SHOULD show a compact visual cue indicating the label is an alias
- **AND** the cue SHOULD expose the original workspace name through accessible text or tooltip
- **AND** the underlying workspace name and path MUST remain unchanged

#### Scenario: sidebar falls back to workspace name when alias is empty

- **WHEN** workspace settings do not contain `projectAlias` or it is empty after trimming
- **THEN** the left sidebar workspace row MUST display the existing workspace name
- **AND** the row MUST NOT show the alias visual cue

#### Scenario: setting alias does not affect non-sidebar surfaces

- **WHEN** a workspace alias is configured
- **THEN** workspace home, settings project management, session attribution, sorting, grouping, and runtime behavior MUST continue to use the existing workspace identity fields
