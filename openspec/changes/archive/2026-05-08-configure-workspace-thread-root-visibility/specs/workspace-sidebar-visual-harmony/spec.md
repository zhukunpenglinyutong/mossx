## ADDED Requirements

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
