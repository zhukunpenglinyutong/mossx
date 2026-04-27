## MODIFIED Requirements

### Requirement: Unified Cross-Engine Conversation Lifecycle Contract

The system MUST define consistent lifecycle semantics (delete, recent ordering, restart visibility, key tool card recoverability) across Claude, Codex, and OpenCode.

#### Scenario: Claude concurrent realtime session update prefers turn-bound pending lineage
- **WHEN** 当前引擎为 `Claude`
- **AND** 同一 workspace 下存在多个并行 pending 会话
- **AND** lifecycle consumer 收到带有 `sessionId` 的 realtime session update
- **AND** 事件同时携带可验证的 `turnId`
- **THEN** lifecycle consumer MUST 先按 `turnId` 匹配 pending lineage，再决定 canonical rebind
- **AND** 系统 MUST NOT 仅因当前 active tab 指向另一条 Claude 会话而把 update 误绑到错误会话
