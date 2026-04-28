## Why

`Codex` 在左侧 recent conversations / workspace thread list 中存在一类高风险 truth drift：同一条会话会在 refresh 过程中短暂出现、消失、再以 `Agent x` 或另一份标题重新出现。现有实现已经处理了“整表为空”的 last-good fallback，但没有覆盖“部分条目被晚到 refresh 局部抹掉”的场景；同时 `Codex` 也缺少类似 `Claude` 的 sidebar-to-native-session truth contract，导致列表投影、标题来源、pending/finalized rebind 仍在各自漂移。

## 目标与边界

- 目标：把 `Codex sidebar history flicker / title rollback` 收敛为一个独立的 `sidebar state parity` 问题，而不是继续按零散 UI 抖动处理。
- 目标：定义 `Codex` 左侧栏 entry、workspace home recent threads、session catalog 与 native session truth 之间的 authoritative contract。
- 目标：确保 refresh partial / degraded / cross-source merge 场景下，最近一次可见的 `Codex` 会话不会被局部抹掉，也不会把稳定标题回退成 `Agent x`。
- 目标：覆盖普通 `Codex` 会话与 `spawn_agent`/agent helper 派生会话的可见性连续性。
- 边界：本 change 只处理 `Codex` sidebar/history projection truth，不重做消息区 realtime reducer、history item normalize、generated image turn linkage。
- 边界：本 change 不扩散到 `Claude` / `Gemini` / `OpenCode` 行为修复，只要求跨引擎现有语义不回退。

## 非目标

- 不通过延长 loading skeleton、CSS 去抖或列表动画掩盖事实源漂移。
- 不把问题泛化为所有 sidebar 排序策略重写。
- 不修改 thread storage schema 或引入新的后端数据库。
- 不顺手重做 auto-title 生成策略；本次只要求已有标题 truth 不被 refresh 回退。

## What Changes

- 新增 `codex-session-sidebar-state-parity` capability，定义 `Codex` sidebar / recent thread projection 与 native session truth 的一致性 contract。
- 修改 `conversation-runtime-stability`，要求 list refresh 在 partial success / partial omission / guarded recovery waiter 场景下保留 last-good visible snapshot，而不是只在“整表为空”时 fallback。
- 修改 `codex-cross-source-history-unification`，要求 `Codex` unified history 在 active catalog、live thread list、local scan 结果不一致时保持 deterministic visibility continuity，不得让已可见 session 因单次 partial refresh 被静默隐藏。
- 收紧标题 truth 规则：首次 user-message rename、persisted custom title、catalog title 三者必须有稳定优先级；单次 refresh 不得把已确认标题回退为 `Agent x` / fallback ordinal。
- 为该类 sidebar drift 增加可诊断分类，明确区分 `partial omission`、`title truth fallback`、`pending/finalized visibility drift`。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 只做 UI 去抖：延后渲染列表更新，避免用户看见闪烁 | 改动小，短期观感改善 | truth drift 仍在，条目仍会被错误删除或标题回退，只是更难被看见 | 不采用 |
| B | 继续扩充 `setThreads` 保活逻辑，按经验规则多保留一些 pending/active 项 | 能缓解部分现象 | 仍然没有 authoritative contract，后续 catalog/source 变化会继续打补丁 | 不单独采用 |
| C | 引入 `Codex sidebar state parity` contract，明确 last-good continuity、visibility merge、title precedence，再据此收口 reducer/list refresh | 根因对准，能同时覆盖“闪烁、消失、回退成 Agent x”三个表象 | 需要同时改 spec、refresh merge、title truth tests | 采用 |

## 验收标准

- 当 `Codex` 某条历史会话已经出现在 sidebar / workspace home recent threads 中时，后续一次 partial refresh MUST NOT 因单个 source 缺失而将该条目静默移除。
- 当 `Codex` live thread list、active session catalog 与 local scan 结果不一致时，系统 MUST 保留最近一次成功可见的 session projection，并将当前状态标记为 degraded / partial，而不是表现为“这条会话不存在”。
- 当线程标题已经被首次 user message、persisted custom title 或 authoritative catalog title 确认后，后续 refresh MUST NOT 将其回退为 `Agent x` 或新的 ordinal fallback。
- 当 `spawn_agent` 或其他 agent-style `Codex` 子会话刚结束 active 状态时，只要该会话仍属于当前 workspace 可见历史，sidebar projection MUST 保持连续可见，不得在 active->completed 切换窗口中闪烁消失。
- 相关修复 MUST NOT 破坏现有 `Claude` / `Gemini` / `OpenCode` sidebar lifecycle parity 与 archive visibility semantics。

## Capabilities

### New Capabilities
- `codex-session-sidebar-state-parity`: 定义 `Codex` sidebar / recent thread projection、标题 truth 与 native session truth 的一致性 contract。

### Modified Capabilities
- `conversation-runtime-stability`: 将 last-good continuity 从“整表失败”扩展到 partial omission / waiter / partial refresh continuity。
- `codex-cross-source-history-unification`: 收紧 `Codex` 多 source 聚合在可见性连续性、partial refresh 与 deterministic merge 下的 sidebar truth 要求。

## Impact

- Affected frontend:
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/app-shell-parts/useAppShellSearchRadarSection.ts`
  - `src/features/app/components/ThreadList.tsx`
  - `src/features/app/components/PinnedThreadList.tsx`
- Affected tests:
  - `src/features/threads/hooks/useThreadActions.native-session-bridges.test.tsx`
  - `src/features/threads/hooks/useThreadsReducer.threadlist-pending.test.ts`
  - `src/features/threads/hooks/useThreadActions.test.tsx`
  - new targeted tests for partial omission continuity and title rollback prevention
- Affected specs:
  - new `codex-session-sidebar-state-parity`
  - modified `conversation-runtime-stability`
  - modified `codex-cross-source-history-unification`
- Dependencies / APIs:
  - 不引入新的外部依赖
  - 优先复用现有 `listWorkspaceSessions`、live `thread/list`、thread title mapping 与 sidebar snapshot 机制
