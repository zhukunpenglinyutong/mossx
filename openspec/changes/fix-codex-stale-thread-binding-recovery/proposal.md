## Why

Codex 最近的 runtime guard 与 churn 修复已经能把 managed runtime 留在可恢复状态，但“当前 UI 绑定的 thread identity”仍然可能停留在已经失效的旧 `threadId`。结果就是 runtime pool 显示 `recovered`，前端却继续报 `thread not found`，并且在应用重启后再次掉回旧绑定，形成“经常会遇到无法恢复”的错觉。

这说明当前系统只补了 runtime continuity，没有把 thread binding continuity 收口成同一个 contract。只要 `activeThreadId`、workspace restore、history reopen、reconnect card 仍然允许消费 stale id，这个问题就会反复出现。

## 目标与边界

- 目标：当 Codex 线程被替换或恢复到新的 canonical `threadId` 后，系统 MUST 持久化该映射并在后续 reopen / restore / refresh 中优先使用 canonical id。
- 目标：当用户遇到 `thread not found` 时，系统 MUST 支持“只恢复绑定”而不是强依赖 resend 上一条 prompt。
- 目标：workspace restore 即使拿到 last-good thread list，也 MUST 校验 `activeThreadId` 是否仍可用，避免把 stale 绑定当成恢复成功。
- 边界：本次不重做整个 conversation store，不引入新的后端 ledger 或数据库。
- 边界：本次只处理 Codex thread identity continuity，不修改 Claude / OpenCode 生命周期语义。

## 非目标

- 不通过调大 timeout 或额外 runtime 重启去掩盖 stale thread 绑定问题。
- 不在本次引入“自动猜测最像的新线程”之类高风险启发式误绑。
- 不重写现有 thread history schema 或消息持久化格式。

## What Changes

- 为 Codex stale-thread replacement 增加持久化 alias map，并在读取时压平 alias chain，确保重启后仍能把旧 `threadId` 映射到最新 canonical `threadId`。
- 在 workspace restore、active thread 切换、thread refresh 等入口统一 canonicalize `threadId`，避免生命周期消费者继续拿 stale id 发起 `resumeThread`。
- 调整 `thread not found` recovery card：
  - 当系统已具备安全 rebind 能力时，提供“只恢复当前会话绑定”动作；
  - resend 上一条 prompt 继续作为可选动作，而不是唯一恢复路径。
- 将用户手动触发的 runtime recovery（例如点击 `重新连接 runtime`）视为 fresh explicit recovery cycle，而不是继续继承 automatic recovery quarantine。
- 增加回归测试，覆盖 alias 持久化、链式 canonicalization、recover-only UI 行为与现有 resend path 不回退。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 只在 `thread not found` 时继续 refresh + resend | 改动最小 | 无法解决 reopen / restart / restore 场景，仍会反复掉回 stale id | 不采用 |
| B | 遇到 stale id 就自动猜测“最近线程”替换 | 用户无感恢复更强 | 容易误绑到错误线程，破坏会话身份安全性 | 不采用 |
| C | 持久化已验证 alias，并在 restore/reopen/recovery UI 统一 canonicalize | 能覆盖 restart continuity，且只消费已验证映射，风险可控 | 需要同步改 storage、hook、UI 与测试 | 采用 |

## 验收标准

- 当旧 `threadId` 已被验证替换到新的 canonical `threadId` 后，应用重启并重新打开同一 workspace，系统 MUST 使用 canonical id，而不是再次调用旧 stale id。
- 当 workspace restore 只拿到 last-good thread list 时，系统 MUST 在标记 restore 完成前校验或修正 `activeThreadId`，不得把明显 stale 的 active binding 原样保留。
- 当出现 `thread not found` 且系统具备 rebind callback 时，UI MUST 提供 recover-only 动作；用户不必强制 resend 上一条 prompt 才能继续。
- 当 automatic recovery 已因 stale health probe 进入 quarantine 时，用户手动触发的 runtime reconnect MUST 能开启 fresh recovery cycle，而不是继续被同一 quarantine 拦住。
- 当系统无法找到安全 replacement 时，既有“不要误绑”的失败语义 MUST 保持不变。

## Capabilities

### New Capabilities

- `codex-stale-thread-binding-recovery`: 定义 Codex stale thread id 的持久化 alias、canonical rebind 与 recover-only UI recovery contract。

### Modified Capabilities

- `conversation-lifecycle-contract`: 补充 workspace restore / reopen / active thread selection 在 stale thread binding 下的 canonical continuity 要求。

## Impact

- Frontend:
  - `src/features/threads/utils/threadStorage.ts`
  - `src/features/threads/hooks/useThreadStorage.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/messages/components/RuntimeReconnectCard.tsx`
  - `src/features/messages/components/Messages.runtime-reconnect.test.tsx`
  - `src/features/threads/utils/threadStorage.test.ts`
- Specs / tasks:
  - `openspec/specs/conversation-lifecycle-contract/spec.md`
  - `openspec/changes/fix-codex-stale-thread-binding-recovery/**`
  - `.trellis/spec/frontend/state-management.md`
