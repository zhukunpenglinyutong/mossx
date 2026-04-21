## Why

Codex 长任务偶发进入“前端仍在 loading / `requestUserInput` 卡片已出现但线程无法恢复 / runtime pool 却显示空闲”的失真状态，导致用户既无法继续交互，也无法从 runtime console 判断真实状态。这个问题已经同时影响执行可恢复性和诊断可信度，必须把 conversation lifecycle、user input resume、runtime pool observability 三条链路的状态语义重新对齐。

## 目标与边界

- 目标：保证 Codex 在首包前等待、静默执行、`requestUserInput` 提交后恢复等阶段，前端 processing 状态、用户输入交互状态、runtime pool 占用状态保持一致且可解释。
- 目标：当 runtime 已进入 degraded / stalled / runtime-ended 状态时，线程 MUST 可恢复退出 pseudo-processing，不得永久卡住。
- 目标：runtime pool MUST 能区分“真正空闲”与“协议静默但仍有前台工作待收口”的状态，避免把异常会话误显示为空闲保温。
- 边界：本次只聚焦 Codex managed runtime 与其前端 lifecycle / user-input / pool console 协同，不重做全部多引擎消息系统。
- 边界：不把问题泛化为所有 loading 卡顿；Claude、OpenCode 仅要求不回退既有行为。
- 边界：不在本次直接引入新的外部 daemon 或新的持久化系统。

## 非目标

- 不仅通过调大 timeout 或 warm TTL 掩盖状态错位。
- 不把 runtime pool 的“空闲”仅改成文案而不修正行为契约。
- 不重写 `requestUserInput` UI 样式或审批系统整体交互。
- 不在本次解决所有 Codex 网络慢、上游无响应或 provider 级别问题。

## What Changes

- 为 Codex 增加可观测的 stalled / startup-pending / waiting-first-event / resume-pending 等恢复相关状态语义，避免前端 processing 与 runtime pool 状态各说各话。
- 收紧 `requestUserInput` 恢复契约：
  - 提交后若后端未继续推进或未返回 terminal event，系统 MUST 在有界时间内收口为可恢复 degraded 状态，而不是永久 processing。
  - 用户输入卡片及其提交结果 MUST 能解释当前处于“已提交等待恢复”还是“恢复失败需重试”。
- 修改 runtime pool console：
  - 不再把“无 active lease 但仍存在前台未收口工作”的 runtime 直接归类为空闲。
  - 行内状态与详情必须暴露该 runtime 当前是 idle、startup-pending、silent-busy、resume-pending、runtime-ended 还是 degraded continuity。
- 将这类异常统一纳入现有 conversation/runtime stability diagnostics，允许前端与 runtime console 共享同一组相关维度：`workspaceId`、`threadId`、`turnId`、recovery state、runtime reason。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 仅调整 runtime pool 判定或文案，把当前“空闲”改成更保守的标签 | 改动小，能减少误导 | 不能解决前端 processing 卡死，也不能让 `requestUserInput` 可恢复 | 不采用 |
| B | 仅在前端增加兜底超时，超时后强制 `markProcessing(false)` | 能快速缓解卡死 | 后端与 runtime pool 仍无共享状态，容易把真实执行中的静默阶段误判为结束 | 不采用 |
| C | 建立共享 stalled recovery contract：同时修改 lifecycle、user-input resume、runtime pool observability 与 diagnostics | 能同时解决“卡死不可恢复”和“pool 假空闲”，状态定义一致，便于后续验证 | 需要跨 frontend/backend/spec 多处收口 | 采用 |

## 验收标准

- 当 Codex 线程进入 waiting-first-event、静默执行或 `requestUserInput` 提交后恢复阶段时，系统 MUST 维持一致的用户可见状态语义，不得出现“前端 processing 但 runtime pool 显示空闲且无解释”的矛盾组合。
- 当 `requestUserInput` 已提交但后续恢复失败、超时或 runtime-ended 时，线程 MUST 退出 pseudo-processing，并展示可恢复 diagnostics；用户 MUST 能再次操作，而不是永久卡死。
- runtime pool console MUST 能区分 true idle 与 silent-busy / resume-pending / degraded continuity，且对应行状态不能再误报为普通 idle。
- 前端 diagnostics 与 runtime pool snapshot MUST 保留可关联字段，至少包括 `workspaceId`、`threadId`、`turnId`（可用时）、recovery state、reason code。
- 非 Codex 引擎现有 `requestUserInput`、processing、heartbeat 行为 MUST 不回退。

## Capabilities

### New Capabilities

- `codex-stalled-recovery-contract`: 定义 Codex 在 waiting-first-event、silent-busy、resume-pending、runtime-ended 等 stalled 恢复阶段的统一状态与收口契约。

### Modified Capabilities

- `conversation-runtime-stability`: 扩展 runtime-dependent failure contract，使 `requestUserInput` 提交后恢复失败、首包等待、静默执行卡死都能进入 bounded degraded continuity，而不是永久 pseudo-processing。
- `conversation-lifecycle-contract`: 修改 Codex turn lifecycle 要求，保证 stalled / runtime-ended / resume failure 不会让线程残留在 stuck processing。
- `runtime-pool-console`: 修改 runtime row 的可观测状态要求，明确区分 idle 与 silent-busy / resume-pending / degraded continuity。
- `codex-chat-canvas-user-input-elicitation`: 修改 `requestUserInput` 生命周期要求，补充“已提交等待恢复”与“恢复失败需重试”的用户可见契约。

## Impact

- Frontend:
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadUserInput.ts`
  - `src/features/threads/hooks/useThreadEventHandlers.ts`
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/app/components/RequestUserInputMessage.tsx`
  - `src/features/messages/components/Messages.tsx`
  - `src/features/settings/components/settings-view/sections/RuntimePoolSection.tsx`
- Backend / runtime:
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/backend/app_server_runtime_lifecycle.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/shared/codex_core.rs`
  - `src-tauri/src/codex/session_runtime.rs`
- Specs:
  - `openspec/specs/conversation-runtime-stability/spec.md`
  - `openspec/specs/conversation-lifecycle-contract/spec.md`
  - `openspec/specs/runtime-pool-console/spec.md`
  - `openspec/specs/codex-chat-canvas-user-input-elicitation/spec.md`
  - `openspec/changes/fix-codex-stalled-user-input-and-runtime-idle-mismatch/specs/codex-stalled-recovery-contract/spec.md`
- Dependencies:
  - 不新增第三方依赖；复用现有 runtime snapshot、thread diagnostics、user input queue 与 event bridge
