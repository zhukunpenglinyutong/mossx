# client-documentation-window Specification

## Purpose

定义客户端说明文档独立窗口的入口、阅读布局、内置内容、隔离边界、跨平台兼容性与 CI 门禁，确保用户可在不打断主工作流的情况下查看客户端各模块功能说明。

## Requirements

### Requirement: Main Window SHALL Open Client Documentation Window
系统 SHALL 在主窗体提供客户端说明文档入口，并通过该入口打开或聚焦独立说明文档窗口。

#### Scenario: Documentation entry is hidden by default
- **WHEN** 用户尚未显式打开顶部工具控制中的客户端说明文档入口
- **THEN** 主窗体 SHALL NOT 默认展示客户端说明文档入口
- **AND** 系统 SHALL 在界面显示设置中提供该入口的可见性开关

#### Scenario: Visibility setting enables documentation entry
- **WHEN** 用户在界面显示设置中打开客户端说明文档入口
- **THEN** 主窗体 SHALL 展示客户端说明文档入口
- **AND** 用户 SHALL 能通过该入口打开或聚焦客户端说明文档独立窗口

#### Scenario: Open documentation window from main window
- **WHEN** 用户在主窗体触发客户端说明文档入口
- **THEN** 系统 SHALL 打开客户端说明文档独立窗口
- **AND** 主窗体 SHALL 保持当前工作流可用

#### Scenario: Reuse existing documentation window
- **GIVEN** 客户端说明文档独立窗口已经存在
- **WHEN** 用户再次在主窗体触发客户端说明文档入口
- **THEN** 系统 SHALL 聚焦既有说明文档窗口
- **AND** 系统 SHALL NOT 创建多个不可控的重复说明窗口

#### Scenario: Closing documentation window preserves main window state
- **GIVEN** 客户端说明文档独立窗口已打开
- **WHEN** 用户关闭说明文档窗口
- **THEN** 主窗体 SHALL 继续保持打开
- **AND** 主窗体当前会话、工作区和运行态数据 SHALL NOT 因关闭说明窗口被清空

### Requirement: Documentation Window SHALL Render Tree And Detail Layout
客户端说明文档窗口 SHALL 使用左侧树形分类和右侧详情说明的阅读布局。

#### Scenario: Render two-pane documentation layout
- **WHEN** 客户端说明文档窗口加载完成
- **THEN** 左侧 SHALL 展示树形分类区域
- **AND** 右侧 SHALL 展示当前选中节点的详情说明区域
- **AND** 一级模块 SHALL 展示对应模块 icon，帮助用户快速识别模块类别

#### Scenario: Tree supports module and feature levels
- **WHEN** 系统渲染说明文档树形分类
- **THEN** 树形分类 SHALL 支持一级客户端模块节点
- **AND** 树形分类 SHALL 支持一级模块下的二级功能点节点

#### Scenario: Selecting tree node updates detail pane
- **WHEN** 用户选择左侧树形分类中的一个文档节点
- **THEN** 右侧详情区域 SHALL 展示该节点对应的功能说明
- **AND** 右侧详情 SHALL NOT 继续显示先前节点的过期内容

### Requirement: Documentation Detail SHALL Describe Client Module Functions
客户端说明文档详情 SHALL 以只读方式描述客户端模块的用途、入口、核心功能、典型流程和注意事项。

#### Scenario: Detail shows required module fields
- **WHEN** 用户查看任一有效文档节点
- **THEN** 详情区域 SHALL 展示该节点的用途说明
- **AND** 详情区域 SHALL 展示该节点的入口位置
- **AND** 详情区域 SHALL 展示该节点的核心功能点

#### Scenario: Detail can include workflow and limitations
- **WHEN** 文档节点包含典型使用流程或注意事项
- **THEN** 详情区域 SHALL 展示这些流程或注意事项
- **AND** 详情区域 SHALL 以只读内容呈现，不提供编辑入口

#### Scenario: Detail includes detailed module usage steps
- **WHEN** 用户查看任一首批一级模块
- **THEN** 详情区域 SHALL 展示“模块使用说明”
- **AND** 模块使用说明 SHALL 包含可执行的多步骤说明，而不是仅展示摘要

#### Scenario: Detail includes association metadata
- **WHEN** 用户查看任一有效文档节点
- **THEN** 详情区域 SHALL 展示该节点的关联模块
- **AND** 关联模块 SHALL 帮助用户理解当前功能与其他客户端模块的协作关系

#### Scenario: Documentation content is versioned with client
- **WHEN** 用户离线打开客户端说明文档窗口
- **THEN** 基础说明内容 SHALL 可读
- **AND** 说明内容 SHALL 来自随当前客户端版本发布的内置文档数据

### Requirement: Documentation Content SHALL Cover Initial Client Module Inventory
客户端说明文档 MUST 覆盖首批客户端模块清单，避免只交付空壳阅读窗口。

#### Scenario: Initial documentation includes required top-level modules
- **WHEN** 系统加载内置客户端说明文档数据
- **THEN** 文档树 MUST 包含界面工具栏与显示控制、工作区与首页、对话与会话、Composer 输入区、AI 引擎与模型、Runtime 与终端、文件与代码阅读、Git 与版本协作、Spec Hub 与规范工作流、项目记忆与上下文、任务与状态面板、搜索与导航、设置中心、扩展能力、通知更新与关于这些一级模块

#### Scenario: Top-level modules include feature children
- **WHEN** 系统渲染任一首批一级模块
- **THEN** 该一级模块 MUST 至少包含 2 个二级功能点
- **AND** 若模块当前能力不足 2 个功能点，文档内容 MUST 显式说明合并原因

#### Scenario: Required detail fields exist for selectable nodes
- **WHEN** 系统校验内置客户端说明文档数据
- **THEN** 每个可选中文档节点 MUST 包含模块定位
- **AND** 每个可选中文档节点 MUST 包含入口位置
- **AND** 每个可选中文档节点 MUST 包含核心功能点
- **AND** 每个可选中文档节点 MUST 包含注意事项
- **AND** 每个可选中文档节点 MUST 包含关联模块
- **AND** 每个首批一级模块 MUST 包含模块 icon
- **AND** 每个首批一级模块 MUST 包含不少于 6 步的模块使用说明

#### Scenario: UI visibility controls are documented
- **WHEN** 系统提供可隐藏的 UI visibility control
- **THEN** 客户端说明文档 MUST 包含该 control 对应的说明节点
- **AND** 说明节点 MUST 描述入口位置、用途、核心功能、使用流程和隐藏后的影响
- **AND** 顶部运行控制、顶部工具控制、右侧活动工具栏、底部活动面板和幕布状态区的入口 MUST 被覆盖

### Requirement: Documentation Window SHALL Fail Safely
客户端说明文档窗口 MUST 在文档数据缺失、选中节点失效或内容异常时展示可恢复状态，而不是白屏或崩溃。

#### Scenario: Empty documentation data shows recoverable state
- **WHEN** 客户端说明文档数据为空
- **THEN** 说明窗口 MUST 展示可恢复的空状态
- **AND** 说明窗口 MUST NOT 渲染空白页

#### Scenario: Unknown selected node shows fallback state
- **WHEN** 当前选中文档节点 id 不存在于文档数据中
- **THEN** 说明窗口 MUST 展示未知节点的兜底状态
- **AND** 用户 MUST 能重新选择可用节点

#### Scenario: Malformed node does not crash window
- **WHEN** 某个文档节点缺少非关键说明字段
- **THEN** 说明窗口 MUST 继续渲染可用字段
- **AND** 说明窗口 MUST NOT 因单个节点内容不完整而崩溃

### Requirement: Documentation Module SHALL Stay Isolated From Business Modules
客户端说明文档模块 SHALL 作为独立只读阅读 surface 存在，不改变既有业务模块行为或持久化 schema。

#### Scenario: Opening documentation does not mutate business state
- **WHEN** 用户打开或浏览客户端说明文档窗口
- **THEN** 系统 SHALL NOT 修改当前会话内容
- **AND** 系统 SHALL NOT 修改当前 workspace 配置
- **AND** 系统 SHALL NOT 启动、停止或重置任何 AI runtime

#### Scenario: Implementation does not introduce user-editable documentation storage
- **WHEN** 本能力实现完成
- **THEN** 系统 SHALL NOT 新增用户自定义文档存储 schema
- **AND** 系统 SHALL NOT 要求远程文档服务才能完成基础阅读

#### Scenario: Documentation window remains separate from Spec Hub
- **WHEN** 用户打开客户端说明文档窗口
- **THEN** 系统 SHALL NOT 进入 Spec Hub change、artifact 或 execution console workflow
- **AND** 客户端说明文档窗口 SHALL 使用独立的文档节点模型

### Requirement: Documentation Window SHALL Preserve Windows And macOS Compatibility
客户端说明文档窗口 MUST 在 Windows 与 macOS 上保持一致的核心阅读语义，并将平台差异限制在窗口壳层适配中。

#### Scenario: Window identity uses platform-safe keys
- **WHEN** 系统定义客户端说明文档窗口 label、route key、storage key 或 document node id
- **THEN** 这些 key MUST 使用稳定 ASCII kebab-case
- **AND** 这些 key MUST NOT 包含中文、空格、路径分隔符或平台保留字符

#### Scenario: Window opens through Tauri window contract
- **WHEN** 用户触发客户端说明文档入口
- **THEN** 系统 MUST 通过 Tauri window API 或项目既有 open-or-focus adapter 打开或聚焦窗口
- **AND** 系统 MUST NOT 通过 shell command、平台 `open` 命令、Windows `start` 命令或外部浏览器完成基础打开行为

#### Scenario: macOS drag region does not swallow interactive controls
- **WHEN** 客户端说明文档窗口运行在 macOS 且使用自定义 titlebar 或 drag region
- **THEN** 窗口壳层 MUST 明确标注可拖拽区域
- **AND** 树节点、按钮、链接和可滚动详情区域 MUST 保持可点击、可聚焦、可选择

#### Scenario: Windows does not show console windows for documentation behavior
- **WHEN** 客户端说明文档窗口在 Windows 上打开、聚焦、关闭或渲染内容
- **THEN** 系统 MUST NOT 因本模块启动可见 console window
- **AND** 若实现涉及 Rust command 或子进程，MUST 沿用项目现有 no-console Windows command 工具

#### Scenario: Path examples remain cross-platform
- **WHEN** 说明文档内容展示路径、命令或文件位置示例
- **THEN** 内容 MUST 同时考虑 Windows 与 POSIX 表达
- **AND** 内容 MUST NOT 将 `/Users/...`、drive letter、反斜杠或大小写敏感行为作为唯一假设

### Requirement: Documentation Change SHALL Pass CI And Boundary Gates
客户端说明文档实现 MUST 纳入仓库现有 CI 门禁，并不得突破本 change 的边界守护。

#### Scenario: Required frontend gates pass
- **WHEN** 本 change 完成实现
- **THEN** `npm run lint` MUST pass
- **AND** `npm run typecheck` MUST pass
- **AND** `npm run test` MUST pass
- **AND** `npm run check:runtime-contracts` MUST pass

#### Scenario: Required platform gates pass
- **WHEN** 本 change 完成实现
- **THEN** `npm run doctor:win` MUST pass
- **AND** `cargo test` in `src-tauri` MUST pass
- **AND** 若实现改动 Tauri window command、Tauri config 或 macOS window shell，`npm run tauri -- build --debug --no-bundle` MUST pass

#### Scenario: OpenSpec gate passes
- **WHEN** 本 change 的 artifacts 或实现任务发生变化
- **THEN** `openspec validate add-client-module-documentation-window --strict --no-interactive` MUST pass

#### Scenario: Boundary guard rejects out-of-scope behavior
- **WHEN** 本 change 完成实现
- **THEN** 系统 MUST NOT 新增远程文档请求、在线 iframe、第三方文档 SDK 或 webview 外链加载作为基础阅读路径
- **AND** 系统 MUST NOT 新增用户可编辑文档存储、数据库迁移、workspace settings 字段或 app settings 字段
- **AND** 系统 MUST NOT 让说明窗口启动、停止、切换或重置 AI runtime
