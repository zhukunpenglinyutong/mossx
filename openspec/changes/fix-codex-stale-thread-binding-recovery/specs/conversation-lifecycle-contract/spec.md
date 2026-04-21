## ADDED Requirements

### Requirement: Workspace Restore MUST Canonicalize Active Codex Thread Binding

在统一 conversation lifecycle contract 下，workspace restore / reopen MUST NOT 把已经确认失效的 `Codex` `threadId` 继续当成当前 active binding。

#### Scenario: restore repairs persisted active thread binding before lifecycle use
- **WHEN** workspace restore 已拿到 thread list 或 last-good visible snapshot
- **AND** 当前 persisted `activeThreadId` 已存在已验证的 canonical replacement
- **THEN** 系统 MUST 在后续 lifecycle consumer 使用该 id 前先完成 canonical rebind
- **AND** workspace MUST NOT 以旧 stale `threadId` 进入“看似 restored、实际无法 resume”的状态

#### Scenario: canonical active thread map stays consistent after restore
- **WHEN** 系统发现 `activeThreadIdByWorkspace` 中保存的是已知 stale `threadId`
- **THEN** 系统 MUST 将其收敛为 canonical `threadId` 或显式清空
- **AND** 生命周期读取方 MUST 看到一致的 current active binding
