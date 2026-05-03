## Context

当前 `Context Ledger` 有三类局部状态：

- projection / comparison baseline
- expanded / collapsed
- 当前轮次的显式选中与 carry-over 状态

问题在于，这些状态并没有完全按 session boundary 分层：

- selection/carry-over 会在 thread 切换时 reset
- 但 retained ids 与 comparison baseline 没有跟着 reset

同时，surface 的 collapsed affordance 仍偏“卡片列表”，不是“贴着 composer 的轻量抽屉”。

## Decisions

### 1. comparison baseline 以 `activeThreadId + activeWorkspaceId` 为 hard boundary

- 当 thread 或 workspace 发生切换时，重置：
  - `lastSentContextLedgerBaseline`
  - `preCompactionContextLedgerBaseline`
  - retained ids
  - hidden / expanded surface state
- 不尝试跨 thread 迁移 recent diff，因为这会把“最近一次发送”的语义污染成“最近一次任何地方发送”

### 2. collapsed header 改为单行 action bar

- 标题、摘要、主 toggle 放在同一行
- 摘要继续沿用现有 token / block / group summary，不改数据口径
- 新增 hidden icon button，但不取代原有 expand/collapse toggle

### 3. hidden drawer 是 surface 状态，不是数据状态

- hidden 只影响 surface 呈现，不改变 projection/comparison/selection
- hidden 时保留一个最小 `peek` 入口，让用户可以一键拉回
- surface 隐藏不应影响 send 行为或 comparison 计算

### 4. drawer 动画优先保证稳定，不做全局布局重排

- 使用 composer-local class + transform/max-height 形成“藏到输入框后方”的观感
- 不把 hidden state 提升到 AppShell 或 clientStorage

## Validation

- composer test：
  - thread 切换后 comparison baseline 被清空
  - hidden drawer state 可切换且不影响 surface re-open
- panel test：
  - collapsed header 为单行
  - hidden action / reopen action 出现条件正确

## Follow-up

本轮不包含：

- hidden drawer preference persistence
- comparison timeline history
- multi-session ledger history browser
