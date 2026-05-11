## Context

CodeMoss 当前是 Tauri + React 桌面应用，主窗体承载会话、工作区、Git、文件、设置、Spec Hub 等多个模块。随着入口增多，功能说明如果继续散落在 UI 文案或外部口头约定中，会导致新用户无法快速建立模块地图，也会让后续能力扩展缺少统一的说明维护位置。

本 change 将新增一个独立的客户端说明文档窗口。它不是业务模块本身，也不是在线文档系统，而是一个只读、离线可用、随客户端版本发布的内置说明模块。主窗体只负责提供入口；说明窗口负责阅读体验、分类导航和详情展示。

现有仓库已有 detached window 类能力，例如 Spec Hub 独立阅读窗口。该能力证明“主窗体入口 + 独立窗口 shell + 独立阅读 surface”的模式可行。本设计应复用这种窗口生命周期思路，但不复用 Spec Hub 的业务状态、artifact 模型或执行台。

## Goals / Non-Goals

**Goals:**

- 提供主窗体到客户端说明文档窗口的可发现入口。
- 保证说明窗口作为独立模块存在，打开、聚焦、关闭都不影响主窗体工作流。
- 用稳定的左树右详情阅读布局承载客户端模块说明。
- 使用内置只读文档数据，保证离线可读、版本一致、实现面可控。
- 让文档节点具备清晰的数据契约，便于后续补充模块说明而不改渲染逻辑。
- 提供默认选中、未知节点、空数据和数据异常的恢复态，避免白屏。

**Non-Goals:**

- 不实现在线文档服务、远程更新或外部 URL 嵌入。
- 不实现文档编辑器、用户自定义文档、评论或协作能力。
- 不实现全文搜索、标签筛选、版本切换或多语言文档后台。
- 不改变既有业务模块行为，不把说明窗口做成可执行的新手引导。
- 不复用 Spec Hub 的 change/artifact 执行模型，也不把本模块纳入 Spec Hub 命名空间。

## Decisions

### Decision 1: 使用独立 Tauri window，而不是主窗体内 tab

说明文档窗口 SHOULD 通过主窗体入口打开或聚焦一个稳定的 detached window identity。窗口内渲染独立的 documentation shell，并和主窗体路由、会话状态保持隔离。

**Alternatives considered:**

- 主窗体内 tab：实现成本低，但会挤占主要工作区，用户查看说明时容易中断当前任务。
- 外部浏览器打开文档：客户端代码少，但破坏桌面端体验，且离线与版本一致性差。

**Rationale:**

用户明确要求“独立窗口查看”，且说明文档天然是辅助阅读 surface。独立窗口能让用户一边操作主窗体，一边查模块说明，符合该模块的任务模型。

### Decision 2: 文档内容采用内置只读结构化数据

文档内容 SHOULD 以 TypeScript 结构化数据或等价静态资源随前端 bundle 发布。每个节点包含稳定 id、标题、摘要、详情 sections、入口位置、功能点和注意事项。

**Alternatives considered:**

- Markdown 文件直接读取：作者体验好，但在 Tauri 打包、路径解析、测试和未来 i18n 上会带来额外复杂度。
- 后端 JSON 文件存储：可扩展，但本期不需要用户态存储，也会增加 IPC 与错误面。
- 在线文档：更新快，但违背离线可用和版本一致目标。

**Rationale:**

本期需求是客户端内置说明，不是文档平台。结构化数据可以让树形导航和详情渲染共用同一份契约，也能让测试直接断言节点完整性。

### Decision 3: 左侧树由文档数据生成，右侧详情只渲染当前节点

文档树 SHOULD 由 `DocumentationNode[]` 生成。节点支持 `children` 表达一级模块与二级功能点；详情区根据 selected node id 查找对应节点并渲染内容。

**Alternatives considered:**

- 树和详情分别维护两份数据：实现直观，但容易出现树节点有入口、详情缺内容的漂移。
- 完全硬编码 JSX 页面：视觉自由度高，但后续补模块需要改组件，维护成本高。

**Rationale:**

树与详情共享数据源可以降低漂移。说明文档的主要变化应是内容新增，而不是 UI 逻辑变化。

### Decision 4: 窗口复用采用“打开或聚焦”语义

主窗体入口触发时，系统 MUST 打开或聚焦同一个客户端说明文档窗口，不应无限创建多个说明窗口。若窗口已存在，应聚焦并保留或恢复最近的选中节点。

**Alternatives considered:**

- 每次点击都创建新窗口：实现简单，但会制造窗口噪声，且用户难以判断哪个窗口是最新内容。
- 强制只允许主窗体内弹层：不会产生多窗口管理问题，但不满足独立窗口诉求。

**Rationale:**

说明文档是单例辅助 surface。复用窗口能降低用户认知负担，也符合现有 detached reader 类窗口的使用经验。

### Decision 5: 错误态以可恢复阅读状态呈现

当文档数据为空、selected id 失效或节点内容不完整时，窗口 MUST 显示可恢复空状态，并提供返回默认节点或重新选择的路径。组件不得因为内容缺失导致白屏。

**Alternatives considered:**

- 直接抛错交给 error boundary：能暴露问题，但用户体验差。
- 静默回退到第一个节点：体验平滑，但会掩盖数据契约问题。

**Rationale:**

说明窗口是辅助模块，失败不应影响主窗体。可恢复错误态既保护用户体验，也便于测试覆盖异常数据路径。

### Decision 6: 跨平台窗口实现必须沿用项目内 Tauri window 模式

说明文档窗口 MUST 使用项目内既有 Tauri window label / router / open-or-focus 模式接入，例如 `router.tsx` 中基于 window label 分发独立 surface 的方式。实现不得通过 shell command、系统 `open` / `start` 命令或平台专属脚本创建窗口。

**Alternatives considered:**

- 使用平台命令打开新进程或外部浏览器：实现看似简单，但 Windows/macOS 行为不可控，也会绕过 Tauri window 生命周期。
- 把说明页挂到主窗体弹层：跨平台风险低，但不满足独立窗口并行阅读的核心需求。

**Rationale:**

项目已有 detached file explorer 和 detached Spec Hub 的窗口模式。沿用该模式能让 Windows/macOS 的焦点、关闭、路由和打包行为被现有 CI 与 Tauri debug build 覆盖。

### Decision 7: 平台差异只允许存在于 window chrome 适配层

说明文档主内容、数据模型、树形导航和详情渲染 MUST 是平台无关的 React/TypeScript 逻辑。Windows/macOS 差异只允许出现在窗口 chrome、drag region、titlebar class、尺寸或 Tauri 配置适配层。

**Alternatives considered:**

- 在业务组件里散落 `isWindows` / `isMac` 分支：短期容易修 UI，但会污染说明模块核心逻辑。
- 完全忽略平台差异：实现更干净，但 macOS overlay titlebar 与 Windows 标准窗口交互确实存在差异。

**Rationale:**

边界守护的关键是把平台差异关在壳层，不让文档内容和选择逻辑变成跨平台条件分支泥潭。

### Decision 8: CI 门禁使用仓库现有命令，不新增平行检查体系

本 change 的验证 SHOULD 复用仓库现有 CI 命令：`npm run lint`、`npm run typecheck`、`npm run test`、`npm run check:runtime-contracts`、`npm run doctor:win`、`cargo test`、必要时 `npm run tauri -- build --debug --no-bundle`。新增 targeted tests 只补到现有测试体系中。

**Alternatives considered:**

- 新增独立 CI job 专门跑说明文档窗口：更显式，但本期没有新平台依赖或外部服务，单独 job 成本大于收益。
- 只跑 focused tests：速度快，但无法覆盖窗口接入对 router、Tauri API mock、Windows doctor 和 macOS build 的回归风险。

**Rationale:**

使用现有 CI 命令能降低维护成本，同时确保新增窗口不绕过已有质量门禁。

## Risks / Trade-offs

- [Risk] 内置文档内容可能很快落后于实际功能 → Mitigation: tasks 中明确首批模块清单和维护入口，后续新增模块要求同步更新文档数据。
- [Risk] 新增独立窗口可能重复造 detached shell 逻辑 → Mitigation: 复用现有窗口创建/聚焦工具或抽取最小 adapter，不复制 Spec Hub 业务逻辑。
- [Risk] 文档结构过度复杂会变成迷你 CMS → Mitigation: 本期只保留标题、摘要、入口、功能点、步骤、注意事项等只读字段。
- [Risk] 主窗体入口位置不当会造成发现性不足 → Mitigation: 实现前在任务中核对主窗体现有全局入口区，优先选择全局帮助/说明语义最清晰的位置。
- [Risk] 内容渲染过度自由导致样式漂移 → Mitigation: 详情区采用固定 section renderer，避免任意 HTML。
- [Risk] macOS overlay titlebar 的 drag region 吞掉树节点或按钮点击 → Mitigation: 交互元素显式设置非拖拽区域，并增加 window shell focused test 或手动验证项。
- [Risk] Windows window label、路径或大小写处理与 macOS 不一致 → Mitigation: label/id 使用 ASCII kebab-case；涉及路径示例或匹配时复用现有路径规范化 helper 并补 Windows fixture。
- [Risk] 新增文档窗口绕过 CI，只在本机 macOS 可用 → Mitigation: tasks 中强制 lint/typecheck/test/doctor:win/cargo test，窗口配置变更必须补 Tauri debug build 验证。

## Migration Plan

1. 新增文档数据契约与首批内置内容，不迁移任何用户数据。
2. 新增独立说明窗口 route / shell，并接入左树右详情渲染。
3. 在主窗体增加打开说明窗口入口，接入 open-or-focus 窗口语义。
4. 增加 focused tests 覆盖入口、窗口复用、树形选择、详情渲染和异常态。
5. 执行 CI gate：lint、typecheck、test、runtime contracts、Windows doctor、Rust tests；若改动 Tauri window 配置，再执行 macOS Tauri debug build。
6. 若发布后需要回滚，可移除主窗体入口并保留文档数据文件；该变更不涉及持久化 schema，回滚风险低。

## Open Questions

- 首批文档模块清单是否按当前主导航模块组织，还是按用户任务流组织。
- 主窗体入口最终放在 topbar、侧边栏底部、设置入口附近，还是全局帮助菜单。
- 是否需要在第一版记录最近选中的文档节点；若没有明确需求，本期默认不持久化。
