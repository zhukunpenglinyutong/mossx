## ADDED Requirements

### Requirement: Session Management SHALL Include Folder Assignment Metadata

项目级 session management payload MUST 包含 folder assignment 或等价组织 metadata，使前端能够在 folder tree 中稳定渲染 sessions，同时保留真实 owner workspace/project。

#### Scenario: project catalog entry includes folder assignment
- **WHEN** 系统返回某 project 的 session catalog entry
- **THEN** entry MUST 包含 stable session identity、真实 owner workspace/project 与 folder assignment
- **AND** 缺少 assignment 的 session MUST 被视为位于 project root

#### Scenario: archive status remains independent from folder assignment
- **WHEN** 用户 archive 或 unarchive 某条 folder 内 session
- **THEN** 系统 MUST 更新该 session 的 archive 状态
- **AND** MUST NOT 因 archive 状态变化丢失 folder assignment

### Requirement: Session Management Mutations SHALL Respect Folder Organization Without Rewriting Ownership

Session folder move、archive、unarchive、delete 等 mutation MUST 共享 owner-aware routing，不得由 folder target 推导或改写真实 owner。

#### Scenario: folder move uses source entry owner
- **WHEN** 用户移动某条 session 到同 project folder
- **THEN** mutation MUST 以该 session entry 的真实 owner workspace/project 校验权限和作用域
- **AND** MUST NOT 以目标 folder path 猜测 owner

#### Scenario: assignment rejects session outside target project scope
- **WHEN** 调用方请求把某条 session 分配到 project A 的 folder/root
- **AND** 该 session 的真实 owner workspace/project scope 不属于 project A
- **THEN** 系统 MUST 拒绝该 assignment
- **AND** MUST NOT 写入 project A 的 folder assignment metadata
- **AND** 错误 MUST 明确表达 source session 不属于目标 project scope

#### Scenario: assignment rejects unresolved source owner
- **WHEN** 调用方请求移动一条无法从 catalog 或 attribution resolver 解析 owner 的 session
- **THEN** 系统 MUST 拒绝 folder assignment
- **AND** MUST 保留原 assignment metadata 不变
- **AND** MUST 返回可解释错误，提示 source session owner unresolved

#### Scenario: delete removes assignment with session
- **WHEN** 用户删除某条 session 且 delete 成功
- **THEN** 系统 MUST 移除该 session 的 folder assignment metadata
- **AND** folder tree 中 MUST NOT 保留指向已删除 session 的 dangling reference

#### Scenario: failed move preserves previous assignment
- **WHEN** session folder move mutation 失败
- **THEN** 系统 MUST 保留移动前的 folder assignment
- **AND** 前端 MUST 能恢复或保持原 UI 位置

### Requirement: Session Management Metadata Mutations SHALL Be Workspace Atomic

Folder CRUD、session folder assignment、archive/delete assignment cleanup 等 metadata mutation MUST 在同一 workspace scope 内以原子 read-modify-write 方式执行，避免并发操作互相覆盖。

#### Scenario: concurrent folder mutation preserves both successful writes
- **WHEN** 同一 workspace 下连续或并发执行两个合法 folder metadata mutation
- **THEN** 两个 mutation 成功返回后，metadata MUST 包含两个 mutation 的结果
- **AND** 后写 MUST NOT 用旧 snapshot 覆盖先写结果

#### Scenario: failed validation does not write partial metadata
- **WHEN** folder metadata mutation 在 validation 阶段失败
- **THEN** 系统 MUST NOT 写入 partial folder 或 assignment state
- **AND** 现有 metadata MUST 保持不变
