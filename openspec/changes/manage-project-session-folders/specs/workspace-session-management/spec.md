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

#### Scenario: delete removes assignment with session
- **WHEN** 用户删除某条 session 且 delete 成功
- **THEN** 系统 MUST 移除该 session 的 folder assignment metadata
- **AND** folder tree 中 MUST NOT 保留指向已删除 session 的 dangling reference

#### Scenario: failed move preserves previous assignment
- **WHEN** session folder move mutation 失败
- **THEN** 系统 MUST 保留移动前的 folder assignment
- **AND** 前端 MUST 能恢复或保持原 UI 位置
