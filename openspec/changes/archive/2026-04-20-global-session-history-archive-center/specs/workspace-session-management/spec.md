## MODIFIED Requirements

### Requirement: Session Management SHALL Be A Dedicated Settings Surface

系统 MUST 提供独立的 `Session Management` 设置页入口，用于治理 workspace 级真实会话历史，并能引导用户访问全局历史 / 归档中心。

#### Scenario: dedicated session management links to global history center

- **WHEN** 用户进入 `Session Management`
- **THEN** 系统 MUST 提供进入全局历史 / 归档中心的明确入口
- **AND** 用户 MUST 能理解该入口用于查看不依赖当前 workspace strict 命中的历史

### Requirement: Archived Sessions SHALL Be Manageable Without Reappearing In Main UI By Default

已归档会话 MUST 在会话管理页与全局历史 / 归档中心中可查询、可恢复、可删除，但默认不得重新出现在客户端主界面的标准会话入口中。

#### Scenario: archived sessions remain visible in global management surface

- **WHEN** 用户切换到全局历史 / 归档中心的 `archived` 或 `all` 视图
- **THEN** 系统 MUST 展示已归档会话
- **AND** 用户 MUST 能继续对其执行 unarchive 或 delete

## ADDED Requirements

### Requirement: Strict Project Session View MUST Explain Empty State

当 strict project sessions 结果为空时，系统 MUST 明确告诉用户这表示“当前项目 strict 命中为空”，而不是“客户端完全没有历史”。

#### Scenario: strict project empty state links to global history

- **WHEN** 当前项目 strict project sessions 结果为空
- **AND** 客户端仍然存在全局可见的 Codex 历史
- **THEN** 系统 MUST 展示前往全局历史 / 归档中心的入口或指引
- **AND** MUST 说明 strict 为空不等于本机无历史

#### Scenario: strict project view remains fact-only

- **WHEN** 某条会话仅满足 inferred attribution 而不满足 strict path match
- **THEN** 系统 MUST NOT 将其直接混入 strict project sessions
- **AND** 前端 MUST 维持 strict 视图作为真实命中边界

### Requirement: Session Management SHALL Surface Project-Related Sessions Separately

`Session Management` 在项目语境下 MUST 支持单独展示 `inferred related sessions` 或等价 surface，使用户能查看与项目相关但非 strict 的历史。

#### Scenario: project session management shows related sessions separately

- **WHEN** 当前项目存在 inferred related sessions
- **THEN** 系统 MUST 提供独立于 strict project sessions 的 related surface
- **AND** 用户 MUST 能看出这些结果属于推断归属

#### Scenario: related-surface governance keeps mutation consistency

- **WHEN** 用户在 related surface 对某条会话执行 archive、unarchive 或 delete
- **THEN** 系统 MUST 与全局历史 / 归档中心保持一致的 mutation 结果
- **AND** strict project sessions 的事实边界 MUST 不因此被污染
