## Context

当前声音提示由 `useAgentSoundNotifications` 订阅实时 app-server events，并同时响应 `onAgentMessageCompleted` 与 `onTurnCompleted`。在实时流式对话中，assistant content completion / item snapshot completion 并不等价于本轮任务结束；它可能在流式输出、快照补全、重复事件或多 assistant item 场景中出现多次。

项目既有实时输出链路通过 `useAppServerEvents` 分发 `agentMessageDelta`、`itemCompleted`、`turnCompleted` 等事件。声音提示是独立 side effect，不应反向影响 reducer、message rendering 或 runtime event mapping。

## Goals / Non-Goals

**Goals:**

- 声音提示只在 `turn/completed` 后触发。
- 同一 `workspaceId + threadId + turnId` 的完成事件只触发一次声音提示。
- 保留 legacy event 缺失 `turnId` 时的短窗口去重。
- 使用 hook-level tests 保护 streaming 期间不反复播放。

**Non-Goals:**

- 不改变 `useAppServerEvents` 的事件解析与实时渲染分发。
- 不改变系统级 notification 的完成提醒逻辑。
- 不新增设置项或音频资源。
- 不修改 backend / Tauri command。

## Decisions

### Decision: bind sound side effect to terminal turn events

声音提示只保留 `onTurnCompleted` 处理器，移除 `onAgentMessageCompleted` 触发声音的路径。

Alternatives considered:

- 继续监听 `onAgentMessageCompleted` 并扩大 throttle：不能表达“每轮一次”，长流式任务仍会重复触发。
- 在 reducer 中派生完成通知：影响面大，会把 side effect 与渲染 state 耦合。

### Decision: dedupe by turn identity first, timestamp fallback second

当 `turnId` 存在时，使用 `workspaceId:threadId:turnId` 作为完成通知 key，并记录每个 thread 最后播放过的 completion key。当 `turnId` 缺失时，复用已有 timestamp guard，避免 legacy event 在短窗口内重复播放。

Alternatives considered:

- 全局只用 timestamp throttle：不同 turn 近距离完成会被误伤。
- 只用 `turnId`：旧事件缺失 `turnId` 时会失去重复保护。

## Risks / Trade-offs

- [Risk] 某些 runtime 可能发出空 `turnId` 的 completion event → Mitigation: 保留 legacy timestamp fallback。
- [Risk] 同一 thread 快速连续两轮完成 → Mitigation: 有 `turnId` 时不受 1500ms throttle 影响，连续不同 turn 仍会各播放一次。
- [Risk] 误删 content completion 的其他副作用 → Mitigation: 只改 `useAgentSoundNotifications`，不改 `useAppServerEvents` 或 thread item handlers。

## Migration Plan

1. 修改 `useAgentSoundNotifications` 触发条件。
2. 添加 hook-level tests 覆盖 terminal completion 与 streaming content completion 的差异。
3. 运行目标测试与 TypeScript typecheck。
4. 回滚时恢复该 hook 与测试文件即可，不涉及数据迁移。

## Open Questions

- 无。
