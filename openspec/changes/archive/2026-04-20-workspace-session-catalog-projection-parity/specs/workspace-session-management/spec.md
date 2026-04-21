# workspace-session-management Specification Delta

## MODIFIED Requirements

### Requirement: Session Management SHALL Read Workspace Session History With Real Pagination

系统 MUST 以 project-aware real session catalog 提供会话历史读取能力，并支持基于 cursor 或等效分页模型的真实分页；同时 MUST 暴露与主界面共享的 scope/projection summary，使 `strict + active` 默认视图与 sidebar/`Workspace Home` 可追溯到同一 project/worktree 口径。

#### Scenario: read first page from main workspace as project scope

- **WHEN** 用户选择某个 main workspace 并首次进入会话管理页
- **THEN** 系统 MUST 读取该 main workspace 与其 child worktrees 的真实会话目录第一页
- **AND** 结果 MUST 包含稳定会话标识、标题、引擎、更新时间、archive 状态与真实归属 `workspaceId`

#### Scenario: read first page from worktree as worktree-only scope

- **WHEN** 用户选择某个 worktree 并首次进入会话管理页
- **THEN** 系统 MUST 只读取该 worktree 自己的真实会话目录第一页
- **AND** 系统 MUST NOT 隐式并入其 parent main workspace 或 sibling worktrees 的会话

#### Scenario: subsequent page uses continuation cursor over aggregated result

- **WHEN** 用户继续加载下一页
- **THEN** 系统 MUST 基于上一页返回的 cursor 或等效 continuation token 读取聚合结果集的下一页
- **AND** 系统 MUST NOT 通过对当前已加载 UI 列表做本地切片伪装分页

#### Scenario: large project history remains queryable

- **GIVEN** 某 main workspace 与其 worktrees 拥有大量历史会话
- **WHEN** 用户按页读取项目级会话目录
- **THEN** 系统 MUST 保持稳定排序与可继续翻页
- **AND** 历史总量增大 MUST NOT 退化为一次性全量加载

#### Scenario: active strict summary aligns with shared main-surface projection

- **WHEN** 用户查看某 workspace 的 `strict + active` 默认视图
- **THEN** 系统 MUST 返回与默认主界面共享的 scope/projection summary
- **AND** 该 summary 的 scope 规则 MUST 与 sidebar / `Workspace Home` 默认 active projection 一致

#### Scenario: filtered total is distinct from current page visible

- **WHEN** 当前 filter/scope 下的完整结果多于当前页面可见条目
- **THEN** 系统 MUST 能区分 filtered total 与 current page visible
- **AND** 前端 MUST NOT 继续用当前页条目数冒充完整项目数量

#### Scenario: degraded source is exposed explicitly

- **WHEN** 某个 source/engine 历史不可用但其它结果仍可返回
- **THEN** 系统 MUST 在 catalog 或 summary 中暴露 partial/degraded marker
- **AND** 前端 MUST 能向用户解释当前结果并非完整项目全量
