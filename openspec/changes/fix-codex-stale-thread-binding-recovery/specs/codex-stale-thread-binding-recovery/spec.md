# codex-stale-thread-binding-recovery Specification Delta

## ADDED Requirements

### Requirement: Verified Codex Thread Replacement MUST Survive Restart

当 `Codex` stale thread 已被恢复到新的 canonical `threadId` 后，系统 MUST 将该 replacement 作为可恢复事实持久化，而不是只保留在当前进程内存里。

#### Scenario: persisted alias remaps stale thread after restart
- **WHEN** 某个 `Codex` 线程已经验证 `oldThreadId -> canonicalThreadId`
- **AND** 用户重启应用后重新打开同一 workspace 或历史会话
- **THEN** 生命周期入口 MUST 优先把旧 `threadId` canonicalize 到持久化的 `canonicalThreadId`
- **AND** 系统 MUST NOT 再次优先调用已知失效的旧 `threadId`

#### Scenario: alias chain resolves to latest canonical target
- **WHEN** 一个 stale `threadId` 在多次恢复中形成链式 replacement
- **THEN** 持久化 alias 读取结果 MUST 收敛到最新 canonical `threadId`
- **AND** reopen / restore 路径 MUST 不再经过过时的中间 thread id

### Requirement: Recover-Only Rebind MUST Be Available Without Forced Resend

当 `thread not found` 属于 stale binding 问题且系统已经具备安全 rebind 能力时，用户 MUST 可以只恢复当前会话绑定，而不是被迫 resend 上一条 prompt。

#### Scenario: stale thread recovery card offers recover-only action
- **WHEN** reconnect surface 识别到当前失败属于 `thread not found`
- **AND** 系统提供了安全的 thread rebind callback
- **THEN** UI MUST 展示 recover-only 动作
- **AND** 用户 MUST 能在不 resend 上一条 prompt 的情况下先恢复当前会话绑定

#### Scenario: no verified replacement keeps conservative failure semantics
- **WHEN** 系统无法确认安全 replacement thread
- **THEN** reconnect surface MUST 保持保守失败语义
- **AND** 系统 MUST NOT 通过启发式猜测把当前会话误绑到其他线程

### Requirement: Manual Runtime Recovery MUST Start A Fresh Recovery Cycle

当 `Codex` runtime 已因为 repeated stale health probe 进入 automatic recovery quarantine 时，用户手动触发的恢复动作 MUST 开启一轮 fresh explicit recovery cycle，而不是继续被上一轮 automatic backoff 继承阻塞。

#### Scenario: user-triggered reconnect bypasses automatic quarantine
- **WHEN** automatic recovery 已因 repeated stale health probe 进入 quarantine
- **AND** 用户显式点击 `重新连接 runtime` 或等价 recover action
- **THEN** 后端 MUST 将这次恢复视为 explicit recovery
- **AND** 这次恢复 MUST NOT 继续消费或继承上一轮 automatic quarantine gate
