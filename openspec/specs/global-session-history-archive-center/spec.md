# global-session-history-archive-center Specification

## Purpose
TBD - created by archiving change global-session-history-archive-center. Update Purpose after archive.
## Requirements
### Requirement: The Client SHALL Provide A Global Codex Session History Archive Center

系统 MUST 提供一个不依赖当前 workspace 命中的全局 Codex 历史治理入口，用于查看当前客户端本机可见的 Codex 历史。

#### Scenario: open global session history without selecting a project

- **WHEN** 用户进入全局历史 / 归档中心
- **THEN** 系统 MUST 返回当前客户端本机可见的 Codex 历史结果
- **AND** 用户 MUST NOT 需要先命中某个 workspace/project 才能查看历史

#### Scenario: global center includes active and archived sessions

- **WHEN** 用户打开全局历史 / 归档中心
- **THEN** 系统 MUST 同时支持读取 `active` 与 `archived` Codex 会话
- **AND** 用户 MUST 可以切换 `active`、`archived` 与 `all` 视图

### Requirement: Global Session History Archive Center SHALL Support Query And Stable Paging

全局历史 / 归档中心 MUST 支持筛选、关键词查询和稳定分页。

#### Scenario: filter global history by source status and keyword

- **WHEN** 用户在全局中心设置 `source`、`status` 与关键词过滤条件
- **THEN** 系统 MUST 返回匹配条件的历史结果
- **AND** 过滤条件至少 MUST 支持 `source`、`status`、`keyword`

#### Scenario: repeated reads preserve deterministic ordering

- **WHEN** 用户以相同过滤条件重复读取全局历史
- **THEN** 系统 MUST 返回确定性排序结果
- **AND** 若底层数据未变化，结果顺序 MUST 保持稳定

#### Scenario: global history pages with continuation cursor

- **WHEN** 用户继续加载下一页全局历史
- **THEN** 系统 MUST 基于上一页返回的 cursor 或等效 continuation token 返回下一页
- **AND** MUST NOT 通过对当前 UI 列表本地切片伪装分页

### Requirement: Global Session History Archive Center SHALL Preserve Canonical Session Identity

全局历史 / 归档中心中的会话结果 MUST 暴露稳定的 canonical session identity，以支撑 dedupe 与跨视图治理一致性。

#### Scenario: duplicate scan origins collapse to one canonical entry

- **WHEN** 同一 logical session 同时从多个 source 或 roots 被扫描到
- **THEN** 系统 MUST 只返回一个 canonical entry
- **AND** 该 entry MUST 保留足够的来源信息用于解释为何被合并

#### Scenario: canonical identity remains stable across refresh

- **WHEN** 用户刷新全局历史且底层数据未变化
- **THEN** 同一 logical session 的 canonical identity MUST 保持稳定
- **AND** 前端 MUST 能依此复用选择态与状态更新

### Requirement: Global Session History Archive Center SHALL Support Archive Unarchive And Protected Delete

全局历史 / 归档中心 MUST 支持 archive、unarchive 与 delete，但 destructive delete 在 owner 无法唯一解析时 MUST 进入保护态。

#### Scenario: archive and unarchive from global center

- **WHEN** 用户在全局中心对某条会话执行 archive 或 unarchive
- **THEN** 系统 MUST 将操作路由到该会话的真实 canonical identity
- **AND** 其它视图中的同一会话状态 MUST 同步更新

#### Scenario: archive and unarchive are blocked when archive scope is not uniquely resolvable

- **WHEN** 用户在全局中心对某条会话执行 archive 或 unarchive
- **AND** 系统无法唯一解析该会话对应的 archive metadata 作用域
- **THEN** 系统 MUST 阻止该操作
- **AND** MUST 返回可解释的保护性错误，而不是把 archive 状态写入错误作用域

#### Scenario: delete blocked when owner resolution is ambiguous

- **WHEN** 用户在全局中心尝试删除一条无法唯一解析 owner workspace 的会话
- **THEN** 系统 MUST 阻止 delete
- **AND** MUST 向用户返回可解释的保护性错误，而不是静默失败或误删

#### Scenario: delete succeeds when owner resolution is unique

- **WHEN** 用户在全局中心删除一条 owner 可唯一解析的会话
- **THEN** 系统 MUST 只删除该 canonical identity 对应的真实会话
- **AND** MUST NOT 误删其它 roots/source 中的无关 entry

### Requirement: Global Session History Archive Center SHALL Degrade Gracefully

全局历史 / 归档中心 MUST 在部分 roots/source 扫描失败时继续返回可用结果，并暴露降级信息。

#### Scenario: one root fails but others remain visible

- **WHEN** 某个 Codex history root 扫描失败
- **AND** 其它 roots 仍成功返回结果
- **THEN** 系统 MUST 继续返回成功 roots 的历史
- **AND** MUST 暴露 partial-source 或等效 degradation marker

#### Scenario: metadata-missing entry remains visible

- **WHEN** 某条会话缺失 `cwd`、git root 或 source metadata
- **THEN** 该会话仍 MUST 出现在全局中心
- **AND** 系统 MUST NOT 因 metadata 缺失而 crash

### Requirement: Global Session History Archive Center SHALL Query Codex Claude Code And Gemini With Priority Boundaries

全局历史 / 归档中心 MUST 支持按 engine 查询 `Codex` 与 `Claude Code` 本地历史；`Gemini` MUST 以 best-effort 方式纳入 engine filter，并保持每个 engine source 的 degraded 状态可解释。

#### Scenario: global center filters by engine
- **WHEN** 用户在全局历史中心选择 Codex、Claude Code、Gemini 或 all engines
- **THEN** 系统 MUST 返回匹配 engine filter 的 session histories
- **AND** 每条 entry MUST 暴露 engine identity

#### Scenario: one engine scan failure does not hide other engines
- **WHEN** Claude Code history scan 失败
- **AND** Codex 或 Gemini history scan 成功
- **THEN** 系统 MUST 继续返回成功 engine 的结果
- **AND** MUST 暴露 Claude Code source degraded marker

#### Scenario: gemini degradation does not block codex or claude
- **WHEN** Gemini history scan 失败或 metadata 不足
- **AND** Codex 或 Claude Code history scan 成功
- **THEN** 系统 MUST 继续返回 Codex 或 Claude Code 的结果
- **AND** MUST NOT 因 Gemini best-effort source 不完整而降低 Codex/Claude Code attribution correctness

### Requirement: Global And Project History Views SHALL Share Canonical State

同一 canonical session 在 global history、project strict view、project related view 与 folder tree 中 MUST 共享 archive/delete/assignment 状态，不得形成互相矛盾的 UI truth。

#### Scenario: archive in global reflects in project folder view
- **WHEN** 用户在 global history center archive 某条属于当前 project folder 的 session
- **THEN** project folder view MUST 在刷新或状态同步后反映 archived 状态
- **AND** 若当前 project view 只显示 active sessions，该 session MUST 从 active view 移除

#### Scenario: delete in project removes global entry
- **WHEN** 用户在 project folder view 删除某条 session 且 delete 成功
- **THEN** global history center MUST 不再显示该 canonical session as active or archived
- **AND** 系统 MUST 清理该 session 的 folder assignment metadata

