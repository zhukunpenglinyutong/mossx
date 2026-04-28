## Why

当前 inline approval surface 只按 `workspaceId` 过滤请求，没有按 `threadId` 收口。因此同一 workspace 下并行跑两条会话时，用户切到无关会话也会看到另一条会话的审批卡，形成“审批是全局的”错觉。这个问题已经直接影响多会话并行使用，不继续收口会让 approval ownership 和当前会话 identity 长期矛盾。

## 目标与边界

- 目标：让消息区里的 inline approval surface 在有明确 `threadId` 时，只展示属于当前活动会话的审批请求。
- 目标：为 approval 卡提供本地 `close/dismiss` 保底出口，当卡片失效或前端状态异常时，用户仍能手动关闭并销毁该卡片。
- 目标：保持现有 approval decision / batch accept 行为不变，不改 backend request shape，不改 reducer 主数据结构。
- 目标：对缺少 `threadId` 的 legacy / fallback approval request 保持兼容，不做 silent drop。
- 边界：本 change 只处理 conversation inline approval surface 的展示作用域与本地 dismiss guardrail，不重做全局通知、approval queue center 或 sidebar badge。
- 边界：本 change 不处理 `request_user_input`，该路径已经按 `activeThreadId` 过滤。

## 非目标

- 不重构 approval storage 为 thread-scoped store。
- 不新增新的 approval 弹窗系统或独立审批中心。
- 不修改 Claude synthetic approval bridge、Codex runtime policy 或 backend approval payload。
- 不把 `close/dismiss` 解释成真正的 backend `decline`；它是本地 UI 销毁出口。
- 不顺手处理与 approval scope 无关的 conversation continuity / history reopen / render blanking 问题。

## What Changes

- 新增 `conversation-approval-thread-scoping` capability，定义 inline approval surface 在当前会话中的可见性规则与本地 dismiss 逃生口。
- 当 approval request 携带明确 `threadId` 时，消息区 MUST 只在匹配的活动 thread 上显示该审批卡。
- 当同一 workspace 存在多个 thread-bound approvals 时，当前会话 MUST NOT 渲染其他会话的审批卡，也 MUST NOT 让 batch approve 跨当前会话边界聚合无关 approval。
- 当 approval request 缺少 `threadId` 时，系统 MUST 保持兼容回退，继续按当前 workspace 维持可见，而不是直接把审批卡吞掉。
- approval 卡 MUST 提供一个本地 `close/dismiss` 操作；触发后系统 MUST 仅从前端待审批队列中移除该请求，不得把它伪装成 `accept` 或 `decline`。

## Capabilities

### New Capabilities
- `conversation-approval-thread-scoping`: 定义 inline approval surface 如何按 `workspaceId + threadId` 收口、缺失 `threadId` 时的兼容回退，以及本地 dismiss escape hatch。

### Modified Capabilities

## Impact

- Affected frontend:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/app/components/ApprovalToasts.tsx`
  - `src/features/layout/hooks/useLayoutNodes.tsx`
  - `src/features/threads/hooks/useThreadApprovals.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/utils/approvalBatching.ts`
- Affected tests:
  - `src/features/messages/components/Messages.rich-content.test.tsx`
  - `src/features/app/components/ApprovalToasts.test.tsx`
  - 视实现需要新增 `src/utils/approvalBatching.test.ts`
- APIs / dependencies:
  - 不引入新的外部依赖
  - 不修改 Rust backend 或 Tauri command contract
