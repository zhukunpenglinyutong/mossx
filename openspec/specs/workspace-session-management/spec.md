# workspace-session-management Specification

## Purpose
TBD - created by archiving change project-session-management-center. Update Purpose after archive.
## Requirements
### Requirement: Session Management SHALL Be A Dedicated Settings Surface

系统 MUST 提供独立的 `Session Management` 设置页入口，用于治理 workspace 级真实会话历史，而不是继续把该能力限制在 `Other` 分组里的局部 section。

#### Scenario: open dedicated session management settings page

- **WHEN** 用户进入设置并打开 `Session Management`
- **THEN** 系统 MUST 展示独立的会话管理视图
- **AND** 该视图 MUST 具备 workspace 选择、查询条件、结果列表与批量操作区

#### Scenario: legacy inline section no longer acts as primary management surface

- **WHEN** 用户需要执行真实历史查询、分页或 archive 治理
- **THEN** 系统 MUST 将其路由到独立会话管理页
- **AND** 旧的 inline section MUST NOT 继续承载完整管理职责

### Requirement: Session Management SHALL Read Workspace Session History With Real Pagination

系统 MUST 以 workspace-scoped real session catalog 提供会话历史读取能力，并支持基于 cursor 或等效分页模型的真实分页。

#### Scenario: read first page from workspace session catalog

- **WHEN** 用户选择某个 workspace 并首次进入会话管理页
- **THEN** 系统 MUST 读取该 workspace 的真实会话目录第一页
- **AND** 结果 MUST 包含稳定会话标识、标题、引擎、更新时间与 archive 状态

#### Scenario: subsequent page uses continuation cursor

- **WHEN** 用户继续加载下一页
- **THEN** 系统 MUST 基于上一页返回的 cursor 或等效 continuation token 读取下一页
- **AND** 系统 MUST NOT 通过对当前已加载 UI 列表做本地切片伪装分页

#### Scenario: large history remains queryable

- **GIVEN** 某 workspace 拥有大量历史会话
- **WHEN** 用户按页读取会话目录
- **THEN** 系统 MUST 保持稳定排序与可继续翻页
- **AND** 历史总量增大 MUST NOT 退化为一次性全量加载

### Requirement: Session Management SHALL Support Query And Selection Workflow

系统 MUST 支持会话查询、状态筛选、多选与批量操作前的选择工作流。

#### Scenario: filter by keyword engine and status

- **WHEN** 用户输入关键词并切换引擎或状态过滤条件
- **THEN** 系统 MUST 返回匹配条件的会话结果
- **AND** 状态过滤至少 MUST 支持 `active`、`archived` 与 `all`

#### Scenario: multi-select sessions across current result set

- **WHEN** 用户在当前结果列表中选择多条会话
- **THEN** 系统 MUST 维护稳定的选中集合
- **AND** 用户 MUST 能对选中集合执行批量 archive、unarchive 或 delete

### Requirement: Session Management SHALL Support Archive Unarchive And Delete

系统 MUST 支持对单条或多条会话执行 archive、unarchive 与 delete，并以结构化结果处理部分失败与重试。

#### Scenario: archive selected sessions successfully

- **WHEN** 用户对选中会话执行 archive 且后端成功
- **THEN** 这些会话 MUST 在当前结果集中切换为 archived 状态
- **AND** 若当前视图为 `active`，这些会话 MUST 从结果列表移除

#### Scenario: unarchive selected sessions successfully

- **WHEN** 用户对 archived 会话执行 unarchive 且后端成功
- **THEN** 这些会话 MUST 恢复为 active 状态
- **AND** 若当前视图为 `archived`，这些会话 MUST 从结果列表移除

#### Scenario: batch operation partially fails

- **WHEN** 用户执行批量 archive、unarchive 或 delete
- **AND** 后端返回部分失败
- **THEN** 系统 MUST 仅更新成功项
- **AND** 失败项 MUST 保留在列表中并保持选中态以支持重试
- **AND** 系统 MUST 展示失败摘要与错误分类

#### Scenario: operation is non-reentrant while in progress

- **WHEN** 系统已提交 archive、unarchive 或 delete 请求且尚未完成
- **THEN** 系统 MUST 禁用相关提交动作
- **AND** MUST 阻止重复提交同一批操作

### Requirement: Archived Sessions SHALL Be Manageable Without Reappearing In Main UI By Default

已归档会话 MUST 在会话管理页中可查询、可恢复、可删除，但默认不得重新出现在客户端主界面的标准会话入口中。

#### Scenario: archived sessions remain visible in management view

- **WHEN** 用户切换到 `archived` 或 `all` 视图
- **THEN** 系统 MUST 展示已归档会话
- **AND** 用户 MUST 能继续对其执行 unarchive 或 delete

#### Scenario: archived sessions are hidden from default main surfaces

- **WHEN** 某会话处于 archived 状态
- **THEN** 该会话 MUST NOT 出现在默认主界面会话入口中
- **AND** 至少包括 sidebar、workspace home recent list 与 topbar session tab 恢复集合

#### Scenario: restart preserves archived default invisibility

- **WHEN** 用户重启应用后重新打开同一 workspace
- **THEN** 已 archived 会话 MUST 继续保持默认不可见
- **AND** 系统 MUST NOT 因重建线程列表而把它们回填进主界面默认列表

#### Scenario: active-only projection empty state does not thrash refresh

- **GIVEN** 某 workspace 的主界面默认会话投影已经完成一次 hydrate
- **AND** 当前 active projection 结果为空，因为该 workspace 只剩 archived sessions
- **WHEN** 系统渲染 sidebar / 主界面左侧会话列表
- **THEN** 系统 MUST 将该状态视为稳定空态
- **AND** MUST NOT 因结果为空而持续重复触发自动刷新或 skeleton 闪烁

