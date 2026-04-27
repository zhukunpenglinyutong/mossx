## ADDED Requirements

### Requirement: Codex Idempotent Message Convergence MUST Survive Assembly Migration

在 `ConversationAssembler` 成为 realtime/history 共同装配边界后，`Codex` assistant idempotency MUST 继续在 assembly migration 前后保持一致，不得因为接线位置变化重新依赖 history refresh 去消除重复。

#### Scenario: history hydrate through assembler does not append a duplicate assistant bubble

- **WHEN** realtime path 已经把一条 `Codex` assistant reply 收敛为单条可见 bubble
- **AND** 后续 history hydrate 通过 assembler 再次读到等价 reply
- **THEN** assembled history state MUST 继续只保留一条 assistant bubble
- **AND** 系统 MUST NOT 因 assembler migration 在 refresh 后新增重复 reply

#### Scenario: normalized realtime assembly path matches existing idempotent semantics

- **WHEN** `Codex` normalized realtime input 通过 assembly boundary 进入 conversation state
- **THEN** alias ids、fallback completions、near-duplicate snapshots 的收敛结果 MUST 与既有 idempotent semantics 一致
- **AND** 用户可见 assistant 输出 MUST NOT 因迁移路径改变而出现新的重复正文或双 bubble
