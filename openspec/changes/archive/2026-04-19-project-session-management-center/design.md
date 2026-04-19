## Context

当前项目已经具备若干与会话历史相关的基础能力，但它们分属不同目标：

- `list_threads` 已经在 `Codex` 侧具备“live list + local summaries merge + nextCursor”的统一骨架。
- 设置页中的 `ProjectSessionManagementSection` 只是在 `OtherSection` 里消费 `workspaceThreadsById[selectedWorkspaceId]`，本质还是主界面线程列表的一个切片。
- `archive_thread` 在 `Codex` 侧已经存在，但它目前更多被当作底层动作存在，还没有被提升成“统一会话治理模型”的一部分。
- 主界面线程列表 helper 已经会过滤 `archived`/`archivedAt`，但这个过滤是局部实现细节，不是一个被明确定义的 catalog visibility contract。

这意味着现在缺的不是某个按钮，而是中间那层“统一 session catalog”。只要 catalog 不独立，设置页就无法获得真实分页和治理语义；只要 archive visibility 不是 catalog 级 contract，主界面就只能依赖散落在 helper 里的过滤规则。

## Goals / Non-Goals

**Goals:**

- 引入 workspace-scoped `Session Catalog`，将“真实历史会话目录”与“主界面活跃会话列表”分层。
- 为设置页提供独立的 `Session Management` 页面与查询模型。
- 统一 archive / unarchive / delete 的用户语义和持久化语义。
- 保证 archive 后默认主界面不可见，并且该规则重启后仍成立。
- 尽量复用现有 `Codex` 历史统一能力与 file-based persistence，而不是重新造一套存储系统。

**Non-Goals:**

- 不把所有引擎的底层存储格式统一成一个物理文件格式。
- 不在本次设计里重做聊天主界面整体布局。
- 不在第一阶段解决跨设备同步、云端归档或 server-side indexing。

## Decisions

### Decision 1: 建立独立 `Session Catalog`，不要继续直接复用主界面线程列表

采用三层视角：

- `History Source Layer`
  - 各引擎自己的真实历史来源，例如 Codex 的 live/local sessions、Claude/Gemini/OpenCode 的历史文件或服务返回。
- `Session Catalog Layer`
  - 统一聚合后的 workspace-scoped catalog entry，承载分页、筛选、archive metadata、visibility 语义。
- `Main Surface Projection Layer`
  - Sidebar / Workspace Home / Topbar 只消费 catalog 中 `visibility = active` 的投影结果。

原因：

- 分页必须在 catalog 层完成；前端对主线程列表再分页没有意义。
- archive 影响的是“默认可见性”，不是单一某个组件的私有过滤。

备选方案：

- 继续让设置页直接消费 `threadsByWorkspace`
  - 优点：快
  - 缺点：永远无法提供真实分页和稳定 archive contract

### Decision 2: archive 采用“原生能力优先 + 统一 metadata 兜底”的双层模型

规则：

- 对 `Codex`：
  - 优先调用现有 `thread/archive`
  - 同步写入 catalog metadata，记录 `archivedAt` 与默认不可见状态
- 对其他引擎：
  - 如果已有原生 archive/delete 能力，则走原生能力
  - 如果没有，则允许仅通过 catalog metadata 标记 `archivedAt`

原因：

- 这能避免强迫所有引擎先实现同一套物理 archive 协议。
- UI 只消费统一 metadata，不需要理解底层 archive 是“移动文件”还是“逻辑隐藏”。

备选方案：

- 要求所有引擎必须先实现原生 archive 才能上线
  - 缺点：范围失控，交付会被最慢引擎拖死

### Decision 3: 会话管理页使用 cursor-based query，不做一次性全量预载

统一 command 建议：

- `list_workspace_sessions(workspace_id, query, cursor, limit)`
- `archive_workspace_sessions(workspace_id, session_ids)`
- `unarchive_workspace_sessions(workspace_id, session_ids)`
- `delete_workspace_sessions(workspace_id, session_ids)`

统一 query 维度：

- keyword
- engine
- status: `active | archived | all`
- sort: `updatedAt desc` 默认

统一返回字段：

- `sessionId`
- `workspaceId`
- `engine`
- `title`
- `updatedAt`
- `archivedAt`
- `source`
- `sourceLabel`
- `sizeBytes`
- `threadKind`
- `nextCursor`

原因：

- 这能把 settings、search、后续 export 等能力都收敛到同一个 API surface。

### Decision 4: 主界面默认只消费 active projection，archive 不参与默认展示

影响范围：

- Sidebar 线程列表
- Workspace Home recent list
- Topbar session tabs 的可恢复窗口

规则：

- archived session 不再出现在这些默认 surfaces 中。
- 如果用户当前正打开某个 session 并将其 archive，系统可以允许当前上下文继续可见直到离开，但一旦刷新列表/重启后，该会话不再自动回到默认列表。

原因：

- 这能满足“archive 了的会话，客户端里主界面不要显示”的核心诉求。
- 同时避免 archive 动作直接粗暴打断当前上下文。

备选方案：

- archive 后立即强制关闭当前上下文并清空 tabs
  - 缺点：破坏性过强，用户体验差

### Decision 4.1: active-only projection 返回空结果后，空态本身也是稳定态

实现中已经验证一个真实边界：当 workspace 只剩 archived sessions，而主界面按 contract 仅展示 active projection 时，默认结果会稳定为空。

规则：

- 一旦某 workspace 的主界面线程列表已经完成过一次 hydrate，即使当前 active projection 结果为空，也必须视为“加载完成”。
- 系统 MUST 展示稳定 empty state，而不是把“空列表”误判为“尚未加载完成”。
- 手动刷新、force reload、工作区重连后的显式刷新路径仍然可以重新拉取。

原因：

- archived-only 是本提案定义下的合法 steady state，不是异常态。
- 若把“空结果”当作“未加载”，主界面会进入重复请求和 skeleton 闪烁，破坏 archive visibility 的最终体验。

实现备注：

- 该决策已经在前端通过独立 guard helper 落地，并补充了回归测试，确保 archived-only workspace 不会持续重复刷新。

### Decision 5: catalog metadata 继续走 file-based persistence，并复用 lock + atomic write

建议：

- 为 workspace 建立独立 catalog metadata 文件，记录 archive state 与必要索引信息。
- 所有写入仍使用现有 `with_storage_lock + write_string_atomically` 模式。

原因：

- 当前项目已经明确采用 file-based persistence，现有 storage contract 足够支撑这次变更。
- 引入数据库会让本提案从“会话治理重构”膨胀成“存储基础设施迁移”。

## Risks / Trade-offs

- [Risk] 不同引擎的真实历史来源质量不一致，可能导致 catalog 完整度先天不同
  → Mitigation: 首期先统一 contract 与 visibility；对不完整源允许 `partialSource` / degraded marker，而不是伪装成全量成功。

- [Risk] archive 语义在不同引擎间可能出现“物理 archive”与“逻辑 archive”混用
  → Mitigation: UI 只认 catalog metadata；backend adapter 自己处理引擎差异。

- [Risk] 主界面过滤 archived sessions 后，可能与现有 topbar window runtime-local 状态产生边缘冲突
  → Mitigation: 在 topbar 恢复/裁剪逻辑中增加 active-only projection 过滤，并补回归测试。

- [Risk] 首期新增独立设置页会牵动 `SettingsView` 导航结构
  → Mitigation: 保持 feature-local slice，不在首期大改整个 settings shell。

- [Risk] 若 catalog query 同时承担主界面读取，可能放大线程列表刷新成本
  → Mitigation: 主界面仍可保留现有快速路径，但 visibility contract 必须由 catalog metadata 驱动；后续再评估统一读取。

## Migration Plan

1. 新增 `workspace-session-management` capability 与 backend catalog contract。
2. 让设置页先切换到新的独立 query path，验证分页 / archive / delete / unarchive。
3. 将 sidebar / home / topbar 的默认可见性统一接入 active-only filtering。
4. 补充重启场景与部分失败重试场景的回归测试。
5. 若发现个别引擎 catalog 信息不足，先通过 degraded marker 暴露，再逐步补强 adapter。

## Implementation Notes (2026-04-19)

当前实现已补充以下与提案强相关的行为修正：

- 设置页 workspace 选择器改为稳定显示项目名称，不再回退显示原始 workspace id。
- engine 默认筛选文案收口为“全部引擎”。
- 批量 archive / unarchive / delete 失败时，设置页必须显式给出错误提示，不允许 silent failure。
- 批量 delete 返回结果按输入 session 顺序稳定输出，避免前端把部分失败映射到错误对象。
- archived-only workspace 的主界面左侧空态不再重复刷新。

回滚策略：

- 若独立 catalog query 出现高风险问题，可保留已有主线程列表读取路径，同时禁用 archive/unarchive 入口，回退到只读管理态。
- 若 archive visibility 过滤引发主界面误隐藏，可临时只在设置页展示 archive 状态，不立即接管主界面默认投影。

## Resolved Defaults For Implementation

为了让实现可以真正开工，而不是继续停留在抽象层，本提案在进入 implementation 前先冻结以下默认决策：

- `Shared Session`
  - 首期不纳入 archive/unarchive 可写治理。
  - 在会话管理页中可只读展示，或直接延后接入 catalog。
  - 原因：其 thread kind 与 native session 不同，强行首期一起做会把范围扩散到 shared binding lifecycle。

- `archive 当前正在查看的 session`
  - 采用软语义：当前上下文可暂时保留，直到用户切走、刷新主列表或重启后才从默认主界面消失。
  - 原因：满足“主界面默认不显示 archived”的产品目标，同时避免 archive 操作演变成强制打断当前工作流。

- `Claude/Gemini/OpenCode` 的 catalog metadata 丰富度
  - 首期允许按引擎渐进补齐。
  - `sessionId / title / updatedAt / engine / archivedAt` 为 P0 必填字段。
  - `sizeBytes / sourceLabel` 为 P1 增强字段，不阻塞第一阶段实现。

## Execution Readiness Gate

只有满足以下条件，才建议进入代码实现：

- 已冻结 backend catalog command 命名与 payload 字段，不再在实现中临时发明新字段。
- 已确认首期 `Shared Session` 不进入可写治理范围。
- 已接受“archive 当前打开会话采用软语义”这一产品约束。
- 已接受首期主界面过滤范围至少覆盖 sidebar、workspace home recent list、topbar tab recovery。
- 已接受首期允许非 Codex 引擎在 metadata 丰富度上渐进补齐，而不是一次性齐平。

若以上任一条件被推翻，应先回到 proposal/design 重新收口，而不是直接写代码。
