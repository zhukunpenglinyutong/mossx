## Context

`useThreadActions` 是 threads 域的主生命周期 hook，这个角色本身没有问题。  
问题在于它同时承担了四类风险级别不同的逻辑：

- session runtime 动作：`startThreadForWorkspace`、`startSharedSessionForWorkspace`
- rewind / fork 动作：`forkThreadForWorkspace`、`forkSessionFromMessageForWorkspace`
- 历史恢复主链：`resumeThreadForWorkspace`
- sidebar listing / recovery：`listThreadsForWorkspace`、`loadOlderThreadsForWorkspace`

其中 `start/fork/rewind` 这组动作语义上更接近 session runtime 子域，虽然逻辑长，但输入输出边界清晰，也已经有一部分复用逻辑沉淀在 `useThreadActions.sessionActions.ts`。这使它成为下一刀最安全的 extraction seam。

## Goals / Non-Goals

**Goals:**
- 保持 `useThreadActions` 继续作为 threads 域主入口。
- 将 session runtime 动作提取到独立 feature-local hook。
- 保持对外返回的 action 名称不变。
- 复用现有 shared-session start 与 thread-title migration 逻辑，减少重复实现。

**Non-Goals:**
- 不拆 `resumeThreadForWorkspace`。
- 不拆 `listThreadsForWorkspace` / `loadOlderThreadsForWorkspace`。
- 不重写 rewind 算法或任何 Tauri command payload。

## Decisions

### Decision 1: 按 session runtime 子域切，不先碰 sidebar listing/recovery

- Decision: 第一轮只抽 `start/fork/rewind` 这组生命周期动作。
- Rationale: 这些动作虽长，但对外 contract 简单，且可以通过传入 `resumeThreadForWorkspace` 与 refs 维持既有行为；相反 listing/recovery 主链横跨更多 summary merge、fallback 与 automatic recovery，风险更高。
- Alternative considered:
  - 先拆 `listThreadsForWorkspace`：理论减重更大，但更容易破坏 sidebar loading / partial source recovery 语义。

### Decision 2: 继续采用 feature-local hook，而不是升级为 shared service

- Decision: 新增 `useThreadActionsSessionRuntime.ts`，只服务 threads feature。
- Rationale: 当前这些动作强依赖 threads reducer action、workspacePath refs、thread item snapshots；直接提成 shared service 只会把 hook 上下文参数整体外溢。
- Alternative considered:
  - 改成纯 factory helper：仍需在主 hook 中维护大量 refs 和 callback，主文件减重有限。

### Decision 3: 复用现有 rename / shared-session start action

- Decision: 新 hook 内直接复用 `createStartSharedSessionForWorkspace` 与已存在的 `renameThreadTitleMapping`。
- Rationale: fork/rewind 链路里的 title migration 逻辑已经在 `useThreadActions.sessionActions.ts` 有统一实现，继续内联会放大 drift 风险。
- Alternative considered:
  - 在新 hook 里复制一份 title migration：短期快，但后续 rename contract 再改时会出现双轨漂移。

## Risks / Trade-offs

- [Risk] 新 hook 入参变多，形成新的超长参数列表  
  → Mitigation: 只传 session runtime 真正需要的 `dispatch/items/activeThreadId/threadsByWorkspace/refs/resumeThreadForWorkspace`，不把 listing/recovery 所需上下文整包带入。

- [Risk] rewind/fork 链路在提取后打乱 dispatch 与 rollback 顺序  
  → Mitigation: 迁移时保持 service 调用、dispatch、rename、resume、workspace restore rollback 的顺序逐行等价。

- [Trade-off] `useThreadActions.ts` 仍然保留较重的 resume/listing 复杂度  
  → Mitigation: 本轮目标是先脱离 hard debt；下一轮再针对 listing/recovery 主链继续切。

## Migration Plan

1. 为本轮 change 补齐 PRD 与 OpenSpec artifacts。
2. 新建 `useThreadActionsSessionRuntime.ts` 承载 session runtime 动作。
3. 在 `useThreadActions.ts` 中提前创建 `renameThreadTitleMapping`，并接线新 hook。
4. 执行 typecheck、targeted thread action tests 与 large-file gate。
5. 重算 baseline/watchlist。

Rollback strategy:
- 若出现行为或编译回归，直接回退新增 hook 与顶层接线，不触碰 listing/recovery 主链。
