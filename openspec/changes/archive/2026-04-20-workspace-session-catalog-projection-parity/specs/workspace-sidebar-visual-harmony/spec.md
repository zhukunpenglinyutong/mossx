# workspace-sidebar-visual-harmony Specification Delta

## MODIFIED Requirements

### Requirement: 项目级信号 MUST 反映 worktree 汇总状态

系统 MUST 将主 workspace 与其 worktree 会话状态、默认 active projection 与 degraded state 做聚合，避免用户遗漏子工作树中的活跃会话，或在不同 surface 上看到相互矛盾的项目会话事实。

#### Scenario: worktree running contributes to parent workspace indicator

- **GIVEN** 主 workspace 自身无进行中会话
- **AND** 其任一 worktree 存在进行中会话
- **WHEN** 侧栏渲染主 workspace 行
- **THEN** 主 workspace 行 MUST 呈现进行中信号

#### Scenario: all worktrees idle clears parent running indicator

- **WHEN** 主 workspace 及其所有 worktree 均无进行中会话
- **THEN** 主 workspace 行 MUST 清除进行中信号
- **AND** 不得残留过期运行态样式

#### Scenario: main workspace row uses shared project active projection

- **WHEN** 侧栏为某个 main workspace 渲染默认会话集合或数量提示
- **THEN** 该集合 MUST 基于 main workspace 与 child worktrees 的共享 active projection
- **AND** MUST NOT 仅依赖本地线程列表推断项目总量

#### Scenario: worktree row remains isolated from parent projection

- **WHEN** 侧栏为某个 worktree 渲染默认会话集合或数量提示
- **THEN** 该集合 MUST 只基于该 worktree 自身的 active projection
- **AND** MUST NOT 隐式混入 parent main workspace 或 sibling worktrees 的结果

#### Scenario: degraded active projection stays explainable

- **WHEN** 共享 active projection 存在 partial/degraded source
- **THEN** 侧栏 MUST 能为当前 workspace 行渲染可解释提示或等效状态
- **AND** MUST NOT 把该结果表现成“完整准确的项目会话总量”
