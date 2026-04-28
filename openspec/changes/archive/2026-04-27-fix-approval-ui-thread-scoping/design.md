## Context

当前 approval request 的存储层是 `ThreadState.approvals: ApprovalRequest[]` 顶层数组，消息区渲染时在 `Messages.tsx` 中只按 `workspaceId` 过滤，再直接把结果交给 `ApprovalToasts`。同时，approval 卡当前只有 `accept / decline` 路径，没有“本地销毁坏卡片”的 escape hatch。这意味着：

- 同一 workspace 下，任何会话都可能看到别的会话的审批卡。
- 切换到无关 thread 时，inline approval surface 与当前 conversation identity 发生矛盾。
- `request_user_input` 已经按 `activeThreadId` 过滤，但 approval 仍停留在 workspace 级，可见性规则不一致。
- 当 approval 卡片状态异常或失效时，用户没有办法仅关闭前端卡片，只能被迫继续点真实决策按钮。

这个问题并不要求改 backend，也不要求改 reducer 主结构。approval payload 已经具备 `threadId` 解析能力，问题出在前端展示边界没有消费它。

## Goals / Non-Goals

**Goals:**

- 让 inline approval surface 在具备 `threadId` 时严格按当前活动 thread 收口。
- 为 approval 卡增加本地 dismiss escape hatch，让失效卡片可以被用户手动销毁。
- 保持 approval submit / decline / batch accept 的现有 contract 不变。
- 对缺少 `threadId` 的 approval request 保持兼容，不 silent drop。
- 把实现限制在 frontend render boundary 和纯 helper 内，降低回归面。

**Non-Goals:**

- 不把 approval store 改造成 per-thread map。
- 不新增全局审批中心、跨会话提醒条或 sidebar pending badge。
- 不修改 backend approval payload、Tauri bridge 或引擎层 approval 语义。
- 不把 dismiss 变成后端 `decline` 的别名。
- 不处理 `request_user_input` 路径，因为它已经 thread-scoped。

## Decisions

### Decision 1: 在 render boundary 做 thread scoping，而不是重写 approval state 结构

选择：保留 `state.approvals` 顶层数组结构，在 `Messages` 渲染前做 scope 过滤。

原因：

- 当前问题是“看错审批卡”，不是“approval request 存错了地方”。
- 改 reducer/store 会牵动 add/remove、batch 操作、diagnostics 与更多测试，不符合最小修复原则。
- 只要 render boundary 正确消费 `threadId`，用户感知问题就能收敛。

备选方案：

- 把 approvals 改成 `approvalsByThread`：语义更纯，但改动面明显过大。
- 在 `ApprovalToasts` 内自己读取 active thread：组件职责变重，也会隐藏过滤逻辑。

结论：在 `Messages` 层做 scope，`ApprovalToasts` 继续只消费“已经可见的 approvals”。

### Decision 2: 复用 `getApprovalThreadId`，不重复解析 payload

选择：继续复用 `src/utils/approvalBatching.ts` 中现有的 `getApprovalThreadId`。

原因：

- 当前解析已经兼容 root / nested `input` 两种 approval payload shape。
- 过滤逻辑应该复用同一个解析口径，避免 UI 和 submit path 对 thread ownership 的理解不一致。

备选方案：

- 在 `Messages.tsx` 直接解析 `params.threadId` / `params.input.threadId`：会制造重复解析与行为漂移。

结论：把 thread-scope 判断建立在现有 helper 上。

### Decision 3: 对缺失 `threadId` 的 approval 保留 workspace fallback

选择：如果 approval request 没有可解析的 `threadId`，消息区继续允许它在当前 workspace 的 inline surface 中可见。

原因：

- 当前仓库已有测试覆盖“thread ids missing 时 inline mode 仍按 workspace file batch 回退”。
- 直接隐藏这类 approval 会把兼容问题从“看错审批卡”变成“审批卡消失”，风险更大。

备选方案：

- 无 `threadId` 就一律不显示：最纯，但会破坏兼容性。
- 缺少 `threadId` 时仍全局显示且优先级和显式 thread-bound request 一样：会继续放大串会话噪音。

结论：保留 fallback，但只作为 legacy / degraded path，不覆盖显式 thread-bound approval 的主语义。

### Decision 4: Batch approve 只基于当前可见 approvals，不跨会话重新聚合

选择：不改 `ApprovalToasts` 的 batch 算法前提，只保证传进去的 approvals 已经是当前会话可见集合。

原因：

- batch 是否出现本质取决于输入集合。
- 如果上游已经把别的 thread 的 approval 过滤掉，下游无需理解更多 active-thread 语义。

备选方案：

- 在 `ApprovalToasts` 里再次做 thread scoping：重复逻辑，不必要。

结论：scope 发生在上游，batch 继续作用于当前可见集合。

### Decision 5: Close 按钮走本地 dismiss，而不伪装成 decline

选择：扩展现有 approval action contract，新增 `dismiss` 本地动作；该动作只做前端 `removeApproval`，不调用 backend `respondToServerRequest`。

原因：

- 用户要求的是“坏卡片兜底销毁”，不是“替用户拒绝这次审批”。
- 如果把关闭按钮直接映射到 `decline`，会把一个 UI 故障恢复动作变成真实业务决策，语义过重。
- 只做本地移除可以最小化风险，也更符合“escape hatch”定位。

备选方案：

- 关闭按钮直接调用 `decline`：实现简单，但会把误触发变成真实拒绝。
- 只做组件内隐藏，不改全局 state：切会话或重渲染后卡片还会回来，达不到“销毁”目的。

结论：`dismiss` 是前端状态动作，不是 approval decision。

## Risks / Trade-offs

- [Risk] 某些 engine/path 的 approval 没带 `threadId`，仍会保留 workspace 级可见性。
  → Mitigation：显式保留 fallback 兼容，同时测试覆盖 mixed queue，确保有明确 `threadId` 的请求不会被无关会话错误展示。

- [Risk] 如果未来别的组件直接使用 `state.approvals` 渲染 approval surface，可能再次出现 scope 漂移。
  → Mitigation：把过滤逻辑抽成纯 helper，后续复用同一入口。

- [Risk] 用户切到别的会话时看不到另一条会话的审批卡，短期会降低“全局待审批可发现性”。
  → Mitigation：本 change 先优先修正 ownership；全局发现性如果要补，单独做 queue/badge 设计，不混入当前最小修复。

- [Risk] 本地 dismiss 后，如果 backend 仍把该 request 视为 pending，用户可能需要靠后续刷新或再次触发才能看到真正状态。
  → Mitigation：明确将 dismiss 定位为“坏卡片 escape hatch”；只移除前端队列，不伪装成真实 accept/decline，并保留 debug 记录。

## Migration Plan

1. 先在 `approvalBatching.ts` 增加 thread-scoped visible approval helper。
2. 在 `Messages.tsx` 改为使用 helper 过滤 inline approval 请求。
3. 扩展 approval action contract，增加本地 `dismiss`，并在 `ApprovalToasts` 增加关闭按钮。
4. 更新回归测试，运行 targeted Vitest、`npm run typecheck`、`openspec validate`。

回滚策略：

- 若出现兼容性问题，可直接回退 `Messages.tsx` 对 helper 的调用；不涉及数据迁移、后端 schema 或持久化格式回滚。

## Open Questions

- 是否需要在后续单独补一个轻量“其他会话仍有待审批”的 discoverability 提示。
- threadless approval 的 fallback 是否应在未来逐步收敛到更明确的 degraded presentation，而不是继续完全复用正常 inline surface。
- dismiss 过的 stale approval 是否需要在后续会话恢复里带一个轻量 debug 标记，帮助定位“为什么卡片被用户手动销毁过”。
