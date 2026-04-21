## Why

实时对话流式输出期间，声音提示现在可能被 agent message completion / snapshot completion 事件触发，导致用户听到多次提示音。声音提示的产品语义应是“本轮对话或任务已经最终结束”，不是“收到了一段流式内容”。

## 目标与边界

- 目标：声音提示只绑定到每轮对话的 terminal lifecycle，即 `turn/completed`。
- 目标：同一轮 `turnId` 即使收到重复完成事件，也只播放一次提示音。
- 目标：保持现有实时流式输出、消息增量渲染、系统通知逻辑不变。
- 边界：本变更只调整前端声音提示触发条件，不修改 Tauri command、runtime event payload 或后端引擎事件。

## 非目标

- 不新增通知声音设置项。
- 不改变系统级 notification 的发送逻辑。
- 不重构实时事件适配器、conversation reducer 或消息渲染组件。
- 不改变流式输出中 `agentMessageDelta` / `itemUpdated` / `itemCompleted` 的现有 UI 处理。

## What Changes

- 将 notification sound 的实时对话触发点从 assistant content completion 收敛到 `turn/completed`。
- 增加 per-thread + per-turn 的去重状态，确保同一 `turnId` 重复完成事件不会重复播放。
- 保留缺失 `turnId` 的 legacy fallback 短窗口去重，避免破坏旧事件兼容。
- 补充 hook 级回归测试，覆盖流式内容完成不响、turn 完成只响一次、连续不同 turn 正常提醒。

## 技术方案对比

| 方案 | 做法 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A. 继续监听 `onAgentMessageCompleted` 并扩大 throttle | 保留现有触发点，把 1500ms 去重窗口拉长 | 改动最小 | throttle 不是 lifecycle 语义，长任务仍可能多响，短任务可能漏响 | 放弃 |
| B. 只监听 `onTurnCompleted`，按 `turnId` 去重 | 声音提示只在 terminal turn 完成时触发 | 语义正确，不影响 streaming 渲染 | 需要兼容缺失 `turnId` 的旧事件 | 采用 |
| C. 在 reducer 层派生“任务完成”状态 | 从 message/status state 中推导完成事件 | 可统一 UI 与通知 | 影响面大，容易触碰实时渲染链路 | 本次不做 |

## Capabilities

### New Capabilities

- `conversation-completion-notification-sound`: 定义实时对话声音提示必须只在每轮 terminal completion 后触发一次。

### Modified Capabilities

- 无。

## Impact

- Affected code:
  - `src/features/notifications/hooks/useAgentSoundNotifications.ts`
  - `src/features/notifications/hooks/useAgentSoundNotifications.test.tsx`
- APIs / runtime payload:
  - 无变更。
- Dependencies:
  - 无新增依赖。
- Verification:
  - `npm exec vitest run src/features/notifications/hooks/useAgentSoundNotifications.test.tsx`
  - `npm run typecheck`
