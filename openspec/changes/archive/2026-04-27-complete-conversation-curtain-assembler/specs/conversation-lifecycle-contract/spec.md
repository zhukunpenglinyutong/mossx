## ADDED Requirements

### Requirement: Codex History Reconcile MUST Consume Assembled History State

在 `Codex` 会话中，post-turn history reconcile MUST 先经过 shared assembly contract，再暴露给 lifecycle consumers；它只能补 canonical facts / metadata，不能重新承担 primary duplicate repair。

#### Scenario: reconcile hydrates through assembler before lifecycle consumers read state

- **WHEN** `Codex` turn completion 触发 delayed history reconcile
- **THEN** reconcile 返回的 history snapshot MUST 先经过 `ConversationAssembler.hydrateHistory()`
- **AND** lifecycle consumers MUST 读取 assembled state 而不是 raw history items

#### Scenario: reconcile backfills canonical facts without changing converged rows

- **WHEN** 本地 realtime state 已经对 user / assistant / reasoning 完成 semantic convergence
- **AND** reconcile 只补回 canonical id、structured metadata 或缺失 activity facts
- **THEN** conversation lifecycle state MUST 保持相同的 visible row cardinality
- **AND** 系统 MUST NOT 因 reconcile 再次出现重复 assistant、reasoning 或 user rows

### Requirement: Codex Realtime Rendering MUST Preserve Input Responsiveness Without Waiting For History

在 `Codex` 会话中，realtime curtain 的 render scheduling MUST 以本地 render cadence 完成 progressive reveal，并优先保持 composer 输入可操作；系统 MUST NOT 依赖 history reconcile 才恢复最终 Markdown 结构或输入响应。

#### Scenario: active typing may defer live curtain status but input remains responsive

- **WHEN** `Codex` thread 正在 realtime streaming
- **AND** 用户同时在 composer 中继续输入或进行 IME composition
- **THEN** 系统 MAY defer live status、usage 或 snapshot render cadence
- **AND** composer 输入 MUST 继续保持可操作
- **AND** 输入内容、selection、attachment state MUST NOT 因 live curtain 更新被回退或阻塞

#### Scenario: staged markdown reveal converges to final structure before history reconcile

- **WHEN** `Codex` assistant 正在输出长文本或结构化 Markdown 内容
- **THEN** 系统 MAY 使用 staged Markdown throttle 逐步显示结构
- **AND** completion 后的最终 Markdown 结构 MUST 在本地 realtime render 路径中收敛
- **AND** 系统 MUST NOT 依赖 post-turn history reconcile 才让标题、列表或强调结构恢复正确
