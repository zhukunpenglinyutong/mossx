## ADDED Requirements

### Requirement: Embedded Spec Hub SHALL Open a Detached Reader Window

系统 SHALL 允许用户把当前 Spec Hub 阅读上下文打开到一个专用 detached window，而不是要求用户在新的主窗体中重新导航到目标规范。

#### Scenario: Open detached Spec Hub from embedded workbench

- **GIVEN** 用户当前正在嵌入式 Spec Hub 中浏览某个 workspace / spec root / change
- **WHEN** 用户触发 `Open in window`
- **THEN** 系统 SHALL 打开或聚焦一个 detached Spec Hub window
- **AND** detached window SHALL 接收当前 workspace、resolved spec root、selected change、active artifact 与 active spec source 上下文

#### Scenario: Reuse existing detached Spec Hub window identity

- **GIVEN** detached Spec Hub window 已经存在
- **WHEN** 用户再次从嵌入式 Spec Hub 触发 `Open in window`
- **THEN** 系统 SHALL 复用同一个 detached Spec Hub window identity
- **AND** 该窗口 SHALL 切换到最新请求的阅读上下文并获得焦点

### Requirement: Embedded and Detached Spec Hub Surfaces Can Coexist

系统 SHALL 支持嵌入式 Spec Hub 与 detached Spec Hub window 并行存在，且两者不会互相关闭、抢占或污染对方的前台 surface。

#### Scenario: Main window keeps working while detached window stays open

- **GIVEN** detached Spec Hub window 已打开
- **WHEN** 用户在主窗体切换到聊天、Git、文件或其他 surface
- **THEN** detached Spec Hub window SHALL 继续保持打开
- **AND** 主窗体不需要继续停留在 Spec Hub 才能保留该独立窗口

#### Scenario: Closing detached window does not remove embedded Spec Hub

- **GIVEN** 用户同时拥有嵌入式 Spec Hub 与 detached Spec Hub window
- **WHEN** 用户关闭 detached window
- **THEN** detached Spec Hub window SHALL 被关闭
- **AND** 主窗体中的嵌入式 Spec Hub SHALL 保持可用

### Requirement: Detached Spec Hub Window SHALL Provide Reader-Focused Browsing

detached Spec Hub window MUST 作为阅读优先的 surface 运行，支持 change / artifact / spec source 浏览，但不要求执行台默认展开才参与阅读流程。

#### Scenario: Detached window renders reader-only Spec Hub surface

- **WHEN** detached Spec Hub window 渲染完成
- **THEN** 它 SHALL 展示当前 scope 的 change browsing 与 artifact viewing 能力
- **AND** 它 SHALL NOT 依赖 execution console 才能完成规范阅读

#### Scenario: Detached reader keeps legacy control-center toggle available

- **WHEN** 用户在 detached Spec Hub window 中查看 artifact
- **THEN** reader header SHALL 保留现有 control center toggle
- **AND** control center pane SHALL 默认处于折叠状态
- **AND** 用户展开后 SHALL 继续使用同一套既有执行台内容，而不是进入另一套 detached-only 行为

#### Scenario: Detached browsing context stays isolated from embedded surface

- **GIVEN** 用户同时打开嵌入式与 detached Spec Hub
- **WHEN** 用户在 detached window 中切换 change、artifact 或 spec source
- **THEN** detached window SHALL 更新自己的阅读上下文
- **AND** 主窗体当前可见的嵌入式 Spec Hub 选择 SHALL 保持不变，除非用户在那里显式切换

### Requirement: Detached Spec Hub Window SHALL Use a Stable Detached Reader Shell

detached Spec Hub window MUST 具备稳定的独立窗口壳层与完整的 reader layout contract，避免内容只表现成主窗体里的一块嵌入面板。

#### Scenario: Detached shell occupies the full window and keeps reader controls visible

- **WHEN** detached Spec Hub window 挂载完成
- **THEN** detached shell SHALL 占满独立窗口可用空间
- **AND** reader header 中的 outline toggle SHALL 保持可见
- **AND** 左侧 change pane 的折叠 / 调宽行为 SHALL 在 detached surface 中继续可用

#### Scenario: Drag region remains usable on macOS overlay titlebar

- **GIVEN** detached Spec Hub window 运行在 macOS desktop
- **WHEN** 用户在 detached menubar 区域尝试拖动窗口
- **THEN** menubar drag region SHALL 可用
- **AND** 非交互文案区域 SHALL 不因文本选中或层级覆盖而导致拖动失效
- **AND** menubar SHALL 提供手动 drag fallback，以避免 overlay titlebar 下的拖动句柄失灵

#### Scenario: Text-node targets do not break macOS drag fallback

- **GIVEN** detached Spec Hub window 运行在 macOS desktop
- **AND** 用户按下的是 menubar 标题文字等非交互文案区域
- **WHEN** 该鼠标事件的目标不是 `HTMLElement` 而是文本节点
- **THEN** detached window 的手动 drag fallback SHALL 仍然生效
- **AND** 它 SHALL NOT 因为 target 缺少 `closest()` 而中断拖动流程

#### Scenario: Detached window height stays aligned with detached file explorer baseline

- **WHEN** 系统首次创建 detached Spec Hub window
- **THEN** 该窗口 SHALL 使用与 detached file explorer 一致的紧凑默认高度基线
- **AND** 它 SHALL NOT 仅因 reader surface 存在而默认创建一个明显更高的窗口

### Requirement: Detached Spec Hub Session Handoff SHALL Be Recoverable

系统 MUST 为 detached Spec Hub window 持久化最近一次阅读 session snapshot，以支持冷启动恢复、事件晚到恢复和错误态回退。

#### Scenario: Detached window restores latest requested context on startup

- **WHEN** 系统创建 detached Spec Hub window 且 route 先于 live session event 完成挂载
- **THEN** detached window SHALL 从最近一次持久化 snapshot 恢复阅读上下文
- **AND** 恢复结果 SHALL 指向最近一次请求的 workspace / spec root / change / artifact 范围

#### Scenario: Invalid detached snapshot shows recoverable unavailable state

- **WHEN** detached Spec Hub window 读取到缺失、损坏或已失效的 session snapshot
- **THEN** detached window SHALL 呈现可恢复的 unavailable state
- **AND** 它 SHALL NOT 渲染空白页面或误导性的旧内容
