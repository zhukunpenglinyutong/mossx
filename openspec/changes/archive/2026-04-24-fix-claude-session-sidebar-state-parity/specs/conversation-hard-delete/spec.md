## MODIFIED Requirements

### Requirement: 删除失败必须可观测

系统 MUST 对删除失败提供可见反馈，并携带可分类错误码。

#### Scenario: claude session not found triggers reconcile instead of permanent contradiction
- **GIVEN** 用户请求删除一条 `Claude` 会话
- **WHEN** 后端返回 `SESSION_NOT_FOUND` 或等价 not-found 错误
- **THEN** 系统 MUST 显示可观测失败反馈
- **AND** 系统 MUST 同时触发 authoritative refresh、ghost cleanup 或等价 reconcile
- **AND** 左侧栏 MUST NOT 长期保留与真实状态矛盾的 ghost entry

### Requirement: 引擎差异必须收敛到统一删除语义

系统 MUST 对 Claude、Codex、OpenCode 提供统一“删除成功/失败”语义，差异仅存在于后端执行细节。

#### Scenario: claude delete failure does not leave sidebar and reality diverged
- **GIVEN** 目标会话是 `Claude` 会话
- **WHEN** 删除请求命中 not-found、stale binding 或等价 truth mismatch
- **THEN** 系统 MUST 让用户看到统一的删除失败语义
- **AND** 后续 sidebar 状态 MUST 收敛回与真实 `Claude` session truth 一致的结果
