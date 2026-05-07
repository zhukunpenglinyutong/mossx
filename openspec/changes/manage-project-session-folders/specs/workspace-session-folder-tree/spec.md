## ADDED Requirements

### Requirement: Project Sessions SHALL Support A Folder Tree Organization Layer

系统 MUST 为每个 project/workspace 提供独立的 session folder tree，用于组织该项目内的 sessions；folder tree MUST NOT 改变 session 的真实 owner workspace/project。

#### Scenario: create nested folders inside one project
- **WHEN** 用户在某个 project 下创建 folder 或 child folder
- **THEN** 系统 MUST 将 folder 持久化到该 project 的 folder tree 中
- **AND** 新 folder MUST NOT 出现在其它 project 的 folder tree 中

#### Scenario: folder tree survives refresh
- **WHEN** 用户刷新应用或重新打开项目
- **THEN** 系统 MUST 恢复该 project 的 folder tree、expandable hierarchy 与 session assignments
- **AND** folder hierarchy MUST 保持用户最后保存的父子关系

#### Scenario: folder organization does not change owner
- **WHEN** session 被分配到某个 folder
- **THEN** 系统 MUST 保持该 session 的真实 owner workspace/project 不变
- **AND** 后续 archive、delete、unarchive MUST 仍按真实 owner routing 执行

### Requirement: Folder CRUD SHALL Be Project Scoped And Safe

系统 MUST 支持 project scoped folder 创建、重命名、删除与层级调整，并对非法层级和跨 project target 做保护。

#### Scenario: rename folder inside current project
- **WHEN** 用户重命名当前 project 内的 folder
- **THEN** 系统 MUST 更新该 folder 的显示名称
- **AND** MUST NOT 修改 folder id、child folders 或已分配 sessions

#### Scenario: reject cyclic folder parenting
- **WHEN** 用户尝试把 folder 移动到自身或自身 descendant 之下
- **THEN** 系统 MUST 拒绝该操作
- **AND** MUST 返回可解释错误，说明 folder tree 不能形成循环

#### Scenario: delete non-empty folder is blocked by default
- **WHEN** 用户删除包含 child folders 或 sessions 的 folder
- **THEN** 系统 MUST 阻止删除
- **AND** MUST 提示用户先移动或清空 folder 内容
- **AND** 系统 MUST NOT 静默删除 folder 内的 sessions

### Requirement: Folder Tree SHALL Have Discoverable Entry Empty State And Deterministic Ordering

系统 MUST 让新手用户能发现 folder 能力，并用稳定排序展示 folder tree，避免 session 管理看起来随机或不可理解。

#### Scenario: new folder entry is discoverable from project row
- **WHEN** 用户查看或 hover 某个 project row
- **THEN** 系统 MUST 提供 `New folder` 或等价入口
- **AND** 该入口 MUST 明确作用于当前 project

#### Scenario: project without folders still shows root sessions
- **WHEN** 某 project 尚未创建任何 folder
- **THEN** 系统 MUST 继续展示 root sessions
- **AND** MUST NOT 将空 folder tree 渲染成 session 丢失或空项目

#### Scenario: default folder tree ordering is deterministic
- **WHEN** 系统渲染 project folder tree
- **THEN** folders MUST 排在 sessions 前
- **AND** folders MUST 以稳定规则排序
- **AND** sessions MUST 保持既有 session projection ordering

### Requirement: Sessions SHALL Move Between Folders Only Within The Same Project

系统 MUST 允许 session 在同一 project 的 root 与 folders 之间移动，但 MUST 禁止跨 project 移动或拖拽。

#### Scenario: move session into folder in same project
- **WHEN** 用户把当前 project 的 session 拖入同一 project 的 folder
- **THEN** 系统 MUST 更新该 session 的 folder assignment
- **AND** session MUST 出现在目标 folder 下

#### Scenario: move session back to project root
- **WHEN** 用户把 folder 内 session 拖回 project root
- **THEN** 系统 MUST 清除或更新该 session 的 folder assignment 为 root
- **AND** session MUST 继续属于原 project

#### Scenario: reject cross-project drag
- **WHEN** 用户把 session 拖到另一个 project 或另一个 project 的 folder
- **THEN** 系统 MUST 拒绝移动
- **AND** MUST 保留 session 原 folder assignment
- **AND** MUST 向用户说明不允许跨项目移动 session

#### Scenario: invalid cross-project target shows disabled drop feedback before drop
- **WHEN** 用户拖拽 session 悬停到另一个 project 或另一个 project 的 folder
- **THEN** UI MUST 在 drop 前显示不可投放反馈
- **AND** MUST NOT 将该 target 渲染为合法高亮目标

### Requirement: Sessions SHALL Be Movable Without Drag And Drop

系统 MUST 提供非拖拽移动路径，使用户可以通过菜单或等价控件把 session 移动到同 project folder/root。

#### Scenario: move session through menu
- **WHEN** 用户打开某条 session 的操作菜单并选择 `Move to folder`
- **THEN** 系统 MUST 展示当前 project 内可选 folder/root
- **AND** 用户 MUST 能完成同 project session folder assignment

#### Scenario: menu move excludes other projects
- **WHEN** 用户通过 `Move to folder` 选择目标
- **THEN** 系统 MUST 只展示当前 project 的 folder/root
- **AND** MUST NOT 提供其它 project folder 作为可选目标

### Requirement: Folder Tree Drag And Drop SHALL Preserve Projection Semantics

Folder tree 的 drag and drop MUST 只改变组织层 metadata，不得扩大或缩小当前 project session projection 的 membership。

#### Scenario: same-project folder move does not alter strict membership
- **WHEN** 用户在同一 project 内拖拽 session 到 folder
- **THEN** strict project session membership MUST 保持不变
- **AND** 变化范围 MUST 仅限 folder assignment 和 UI 位置

#### Scenario: filtered and paged catalogs remain stable after folder move
- **WHEN** 当前 session catalog 存在 keyword、engine、status filter 或 cursor pagination
- **AND** 用户移动某条 session 到 folder
- **THEN** 系统 MUST 保持 filter/pagination 语义稳定
- **AND** MUST NOT 用当前可见窗口冒充完整 folder/project total
