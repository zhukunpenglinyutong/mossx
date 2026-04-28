## ADDED Requirements

### Requirement: Claude Lifecycle Consumers MUST Canonicalize Verified Thread Identity Before State Mutation

在统一 `conversation lifecycle` contract 下，`Claude` 的 lifecycle consumers MUST 在修改 active、loaded、processing、turn-settlement 等 thread-scoped state 之前，先解析已验证的 canonical thread identity。

#### Scenario: approval and request user input continuations use canonical thread identity
- **WHEN** `Claude` lifecycle consumer 处理 approval continue、`requestUserInput` submit、turn completion、turn error 或等价 continuation settlement
- **AND** 当前事件携带的 thread id 已存在已验证 alias 或 pending-to-finalized mapping
- **THEN** consumer MUST 在写入 processing / loaded / active-turn state 前先切换到 canonical thread identity
- **AND** 用户可见生命周期状态 MUST 保持附着在同一条 conversation 上

#### Scenario: selection resume consumes recovered canonical thread identity
- **WHEN** 用户激活某条 `Claude` conversation 并触发异步 resume、history reopen 或 equivalent hydrate
- **AND** resume path 返回的 authoritative thread identity 与初始选中 id 不同
- **THEN** lifecycle state MUST 将 active selection 与 loading ownership 迁移到 recovered canonical thread
- **AND** stale thread MUST NOT 继续被标记为当前 loaded active conversation

### Requirement: Claude Lifecycle MUST Prefer Explicit Reconcile Over False Loaded Success

当 `Claude` 的 canonical identity 在 reopen 或 continue 期间无法被安全确认时，生命周期状态 MUST 进入显式 reconcile / failure，而不是表现为“已成功打开但内容消失”。

#### Scenario: unresolved claude reopen does not settle as empty success
- **WHEN** `Claude` history reopen 或 continuation 期间无法安全确认 canonical thread identity
- **THEN** 生命周期 MUST 进入 explicit reconcile、recoverable failure 或等价分支
- **AND** 系统 MUST NOT 将当前会话 settle 为一个无内容、无说明、但看似已成功加载的状态
