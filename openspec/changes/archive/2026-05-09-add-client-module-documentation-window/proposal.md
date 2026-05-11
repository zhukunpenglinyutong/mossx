## Why

当前客户端功能入口越来越多，用户需要在真实界面中摸索每个模块的用途、边界和典型操作路径，学习成本偏高。新增一个独立的客户端说明文档窗口，可以把模块说明从业务界面中剥离出来，让用户在不中断主窗口工作的情况下查阅功能说明。

## 目标与边界

### 目标

- 在主窗体提供一个明确的入口，用于打开客户端说明文档独立窗口。
- 独立窗口采用“左侧树形分类 + 右侧详情说明”的阅读结构。
- 文档内容覆盖客户端主要模块的功能说明、使用场景、入口位置与关键注意事项。
- 独立窗口与主窗体并行存在，关闭说明窗口不得影响主窗体当前工作流。
- 文档数据优先作为内置只读内容随客户端发布，保证离线可用、版本一致。

### 边界

- 本期只做客户端内置说明文档阅读，不做在线文档站点、不依赖远程服务。
- 本期不做文档编辑器、富文本 CMS、用户自定义文档或协作评论。
- 本期不要求接入搜索、全文索引、Markdown 文件热更新或多语言文档管理后台。
- 本期不改变现有模块的业务行为，只新增说明入口和独立阅读窗口。
- 本期不把说明文档窗口复用为 Spec Hub、设置页或文件预览器。
- 本期不得新增用户态持久化 schema、远程文档服务、后台同步任务或运行时进程。
- 本期不得引入平台特化的单一路径写法；所有窗口、路径、快捷键和样式行为必须同时考虑 Windows 与 macOS。

## 非目标

- 不重构主窗体导航体系。
- 不重做 Settings、Spec Hub、File Explorer 等既有模块的信息架构。
- 不引入新的后端存储模型保存文档内容。
- 不把用户操作步骤做成可执行的新手引导或自动化 tour。
- 不在本期覆盖远程更新、A/B 实验或基于角色的文档可见性。

## What Changes

- 主窗体新增客户端说明文档入口，用户点击后打开或聚焦一个独立窗口。
- 新增独立说明文档窗口 shell，支持与主窗体并行存在。
- 说明窗口左侧展示树形分类，按客户端模块组织说明节点。
- 说明窗口右侧展示所选节点的详细内容，包括：
  - 模块用途
  - 主要入口
  - 核心功能点
  - 典型使用流程
  - 注意事项或限制
- 说明窗口需要支持默认选中、空状态和未知节点兜底，避免空白页。
- 文档内容以内置结构化数据或静态内容形式发布，随版本演进维护。
- 新增实现必须纳入现有 CI 门禁，不得绕过 lint、typecheck、test、Windows doctor、macOS Tauri debug build 等既有检查链路。

## 首批文档内容范围

### 统一详情内容项

每个可选中的文档节点至少需要维护以下内容项：

- 模块定位：这个模块解决什么问题，适合在什么场景使用。
- 入口位置：用户从主窗体哪里进入，是否存在快捷入口或关联入口。
- 核心功能点：该模块当前提供的主要能力。
- 典型使用流程：用户完成常见任务时的推荐步骤。
- 注意事项：限制、前置条件、风险提示或容易误解的行为。
- 关联模块：与该模块强相关的其他客户端模块。

### 首批一级模块与功能点

- 工作区与首页
  - 工作区列表与分组
  - 最近会话与项目入口
  - workspace app 打开方式
  - workspace 切换与基础状态
- 对话与会话
  - 多引擎会话入口
  - 会话历史与线程列表
  - 实时消息流与历史加载
  - 会话停止、恢复与失败提示
  - 最新用户消息与跳转
- Composer 输入区
  - 文本输入与发送快捷键
  - 文件/路径引用
  - note card 引用
  - prompt history
  - queued follow-up 与输入保留
  - dictation 语音输入
- AI 引擎与模型
  - Claude Code
  - Codex
  - Gemini / vendor 配置
  - OpenCode
  - 模型选择与 reasoning effort
  - engine control plane 与 runtime 隔离
- Runtime 与终端
  - Runtime pool
  - Runtime console
  - terminal shell 配置
  - runtime log viewer
  - runtime notice dock
  - CLI doctor / 环境校验
- 文件与代码阅读
  - 文件树
  - detached file explorer
  - 文件预览与代码查看
  - Markdown / 文档预览
  - 文件打开方式
  - code annotation / line reference
- Git 与版本协作
  - Git status / diff
  - commit 选择与提交
  - Git history
  - branch 管理与 compare
  - PR workflow
  - push preview / reset 相关安全提示
- Spec Hub 与规范工作流
  - Spec Hub workbench
  - OpenSpec change 浏览
  - artifact 阅读与验证
  - detached Spec Hub window
  - spec root / external spec location
  - verify / sync / archive 基础流程
- 项目记忆与上下文
  - Project Memory CRUD
  - 自动捕获与消费
  - context ledger
  - source navigation
  - conversation context reference
- 任务与状态面板
  - task center / task run history
  - Kanban
  - plan / checkpoint
  - status panel
  - session activity
  - operation facts
- 搜索与导航
  - 全局搜索入口
  - 搜索 provider / ranking
  - 文件、会话、上下文跳转
  - 快捷键导航
- 设置中心
  - 基础设置
  - 外观与 UI visibility
  - 快捷键
  - 打开方式
  - Web 服务
  - 邮件发送
  - 项目管理
  - Runtime Environment
  - MCP / Skills
  - 供应商与模型配置
- 扩展能力
  - MCP server inventory
  - Skills 浏览
  - Commands
  - Computer Use
  - Live edit preview
  - Collaboration mode
- 通知、更新与关于
  - 系统通知
  - 完成提醒
  - update check
  - about / version 信息
  - debug / diagnostics

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 在主窗体内新增一个说明面板或 tab | 实现简单，不需要独立窗口生命周期 | 会挤占主工作流空间，用户查文档时容易丢失当前上下文 | 不采用 |
| B | 新增独立说明文档窗口，内置只读结构化文档数据 | 与主工作流解耦，离线可用，回归面可控，符合“独立模块”诉求 | 需要新增窗口路由、窗口复用和文档内容维护约定 | **采用** |
| C | 打开外部在线文档站或嵌入远程文档页面 | 内容更新灵活，客户端代码少 | 依赖网络，版本容易和客户端不一致，离线不可用，桌面端体验割裂 | 不采用 |
| D | 做完整文档中心，支持编辑、搜索、远程同步和多语言 | 长期能力完整 | 明显超出当前需求，会引入存储、同步、权限和发布复杂度 | 本期不采用 |

## CI 门禁与跨平台边界守护

### CI 门禁

实现完成前必须至少通过以下现有命令或 CI job 对应命令：

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run check:runtime-contracts`
- `npm run doctor:win`
- `cargo test`，工作目录为 `src-tauri`
- 如改动窗口创建、Tauri 配置或 macOS window shell，必须验证 `npm run tauri -- build --debug --no-bundle`
- 如改动 OpenSpec artifact，必须验证 `openspec validate add-client-module-documentation-window --strict --no-interactive`

### Windows/macOS 兼容性写法

- Window label、route key、storage key、document node id 必须使用稳定 ASCII kebab-case，不使用中文、空格、路径分隔符或平台相关字符。
- 窗口打开逻辑必须使用 Tauri window API 或项目既有 open-or-focus adapter，不得通过 shell command、`open`、`start` 或平台特定脚本打开。
- 窗口尺寸、最小尺寸、焦点、关闭行为必须在 Windows 与 macOS 上语义一致；macOS 可保留 overlay titlebar / drag region 差异，但不得破坏 Windows 标准窗口交互。
- macOS 自定义 titlebar / drag region 必须显式标注可拖拽区域与不可拖拽交互控件，避免按钮、树节点、链接区域被误拖拽吞事件。
- Windows 不得出现由新增逻辑触发的可见 console window；如涉及 Rust command 或进程调用，必须沿用现有 Windows no-console 工具。
- 文档内容里的路径示例必须同时覆盖 POSIX 与 Windows 语义，不能硬编码 `/Users/...`、反斜杠路径或大小写敏感假设。
- 文件路径展示或匹配如进入实现范围，必须使用现有路径规范化 helper，并覆盖 Windows separator / drive letter / case-insensitive 场景。

### 边界守护

- 不允许新增远程请求、webview 外链加载、在线 iframe 或第三方文档 SDK。
- 不允许新增用户可编辑文档存储、数据库迁移、workspace settings 字段或 app settings 字段。
- 不允许让说明窗口启动、停止、切换或重置 AI runtime。
- 不允许让说明窗口修改会话、Git、文件树、Spec Hub、Project Memory、Settings 等业务模块状态。
- 不允许复用 Spec Hub artifact/change 模型表达客户端说明文档；本模块必须保留独立 read-only documentation model。
- 不允许为了说明窗口引入新的生产依赖；若确需新增依赖，必须先补充维护活跃度、bundle 影响和替代方案评估。

## Capabilities

### New Capabilities

- `client-documentation-window`: 定义客户端说明文档独立窗口的入口、窗口复用、树形分类、详情阅读、内置文档数据和安全兜底行为。

### Modified Capabilities

- （无）

## 验收标准

- 主窗体 MUST 提供可发现的客户端说明文档入口。
- 用户点击入口后，系统 MUST 打开或聚焦同一个客户端说明文档独立窗口，而不是重复创建多个不可控窗口。
- 说明窗口 MUST 使用左侧树形分类 + 右侧详情说明布局。
- 左侧树形分类 MUST 至少能表达一级模块和二级功能点。
- 右侧详情 MUST 展示当前选中节点的模块用途、核心功能点和入口说明。
- 首批内置文档 MUST 覆盖“首批文档内容范围”列出的一级模块。
- 每个一级模块 MUST 至少包含 2 个二级功能点；若某模块当前能力不足 2 个功能点，必须在内容中显式说明合并原因。
- 每个可选中文档节点 MUST 至少包含模块定位、入口位置、核心功能点、注意事项和关联模块。
- 说明窗口 MUST 在未选中、节点失效或文档数据异常时展示可恢复的空状态，而不是空白页或崩溃。
- 关闭说明窗口 MUST NOT 关闭主窗体，也 MUST NOT 清空主窗体当前会话、工作区或运行态数据。
- 文档内容 MUST 随客户端内置发布，基础阅读能力 MUST 离线可用。
- 本期实现 MUST NOT 引入远程文档服务、文档编辑存储或用户自定义文档 schema。
- 质量门禁至少覆盖：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run check:runtime-contracts`
  - `npm run doctor:win`
  - `cargo test`，工作目录为 `src-tauri`
  - 受影响窗口入口、窗口复用、树形选择、详情渲染、Windows/macOS 兼容性的 focused tests
  - 如涉及 Tauri window command、Tauri config 或 macOS window shell，补充对应 Rust / IPC / `npm run tauri -- build --debug --no-bundle` 验证

## Impact

- Frontend:
  - 主窗体文档入口组件或菜单
  - 独立说明文档窗口路由 / shell
  - 树形分类组件与详情阅读组件
  - 内置文档数据结构与渲染适配
  - 相关样式与 i18n 文案
- Backend / Tauri:
  - 可能新增或复用独立窗口创建、聚焦、路由传参能力
  - 若使用纯前端 route 打开窗口，则后端影响保持最小
- Contracts:
  - additive window open/focus contract
  - additive read-only documentation data contract
- Specs:
  - new `client-documentation-window`
