## Why

`v0.4.8` 于 2026-04-23 发布后，Issue [#424](https://github.com/zhukunpenglinyutong/desktop-cc-gui/issues/424) 在 2026-04-24 继续反馈 `Claude Code` 会话出现三类强相关问题：审批提交后原会话假死、普通对话中自动冒出一个不可交互的新对话框、点开历史后内容约 1 秒后消失。评论区进一步确认该问题同时发生在 Windows 与 macOS，且以 `Claude Code + 全自动` 最明显。

现有证据表明，这不是单纯的渲染空白或审批卡片 UI 问题，而是 `Claude Code` 当前仍允许 `pending thread`、finalized native session、approval / `requestUserInput` 恢复链路、history reopen 各自消费不同的 thread identity。结果是任务实际在后台继续，但用户正在看的会话停在旧 thread 上，或者短暂显示旧历史后又被晚到 reconcile 覆盖成空白/ghost state。

## 目标与边界

- 目标：把 `#424` 收敛为一个独立的 `Claude Code thread/session continuity regression`，统一定义 realtime turn、审批恢复、历史重开三条链路的 canonical thread identity contract。
- 目标：确保用户在同一条 `Claude` 会话里看到连续的审批提交、继续执行、完成结果与历史回放，不再出现 ghost thread、假死卡片或“先有历史后消失”的错觉。
- 目标：让 sidebar / history reopen 在 authoritative session truth 缺失、失效或晚到时进入可解释的 reconcile / failure，而不是 settle 成伪 loaded success。
- 边界：本 change 只处理 `Claude Code` 会话身份连续性，不扩散到 `Codex`、`Gemini`、`OpenCode`。
- 边界：本 change 不把问题重新定义为 generic blanking、Windows-only streaming stall 或 markdown render glitch。
- 边界：本 change 不重做整个 session store、approval UI 或 storage schema。

## 非目标

- 不通过“自动新建一个替代对话框”或“切线程后再帮用户兜底”掩盖 continuity 断裂。
- 不采用“猜最近一条 Claude session 就自动绑过去”的高风险启发式误绑。
- 不顺手处理与 `#424` 无直接因果关系的 Claude 长文 render-safe、progressive reveal 或通用 sidebar 样式问题。
- 不引入新的独立审批 UI 体系；现有 approval / `requestUserInput` surface 继续复用。

## What Changes

- 新增 `claude-thread-session-continuity` capability，定义 `Claude Code` 在以下链路中的 canonical continuity：
  - `pending -> finalized session` rebind
  - file approval / `requestUserInput` 提交后的同线程继续执行
  - history reopen / sidebar activation 的 identity reconcile
- 修改 `conversation-lifecycle-contract`，要求 `Claude` 生命周期消费者在 activation、resume、approval handoff、history reopen 前优先使用 canonical thread identity，且不得把 stale thread settle 成伪成功。
- 修改 `claude-session-sidebar-state-parity`，要求 `Claude` 历史会话在 reopen / not-found / late reconcile 场景下回到 native session truth，而不是制造 ghost replacement thread 或让历史内容短暂出现后消失。
- 为 `Claude` 增加 continuity-oriented diagnostics，将问题明确分类为 thread/session continuity regression，而不是继续混入 generic blanking、stream stall 或 approval UI failure。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 做 UI-only 补丁：原 thread 继续显示 loading，尽量隐藏 duplicate pending thread | 改动面小，短期观感会好一点 | 真实 thread identity 仍然漂移，审批提交、历史重开和 ghost thread 问题会继续反复出现 | 不采用 |
| B | 对所有 `Claude` continuation 自动猜测“最新 native session”并强制重绑 | 用户感知最少 | 极易误绑到错误会话，破坏会话身份安全边界 | 不采用 |
| C | 引入 `Claude` 专属 canonical continuity contract，只消费已验证的 pending->finalized lineage，并把 approval / history reopen 接到同一 canonical thread 上 | 根因对准、边界清晰、能同时覆盖 issue 三个表象 | 需要同时改 thread events、state reducer、history reopen 与 diagnostics | 采用 |

## 验收标准

- 当 `Claude` file approval 提交成功后，原会话 MUST 继续展示后续执行与完成结果；系统 MUST NOT 额外制造一个用户无法交互的临时 duplicate thread 来承接该任务。
- 当 `Claude` 普通对话在 processing 中从 pending thread 进入 finalized native session 时，用户可见会话 identity MUST 保持连续；若 continuity 失败，系统 MUST 给出可解释 failure / reconcile，而不是让 duplicate thread 短暂出现后自行消失。
- 当用户从 sidebar 或 recent conversations 重新打开 `Claude` 历史会话时，已显示出来的历史内容 MUST NOT 在晚到 reconcile 后无提示清空；系统要么保留可读历史，要么进入可解释的 reconcile / failure。
- 当 `Claude` 的 session-id update、approval continue 或 history reopen 证据不足时，系统 MUST NOT 将旧 thread 继续标记为 loaded success。
- 非 `Claude` 引擎与既有 `Codex` / `Gemini` / `OpenCode` 生命周期语义 MUST 保持不变。

## Capabilities

### New Capabilities
- `claude-thread-session-continuity`: 定义 `Claude Code` 在 pending->finalized、approval / `requestUserInput` 恢复、history reopen 三条链路中的 canonical thread continuity contract。

### Modified Capabilities
- `conversation-lifecycle-contract`: 收紧 `Claude` activation、resume、approval handoff、history reopen 的 canonical identity 与 false-success guard。
- `claude-session-sidebar-state-parity`: 收紧 `Claude` sidebar / history reopen 在 not-found、late reconcile、ghost thread 场景下的 truth convergence 要求。

## Impact

- Affected frontend:
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/useThreadApprovalEvents.ts`
  - `src/features/threads/hooks/useThreadEventHandlers.ts`
  - `src/features/threads/hooks/useThreadUserInput.ts`
  - `src/features/threads/hooks/useThreadUserInputEvents.ts`
  - `src/features/messages/components/Messages.tsx`
- Affected tests:
  - `src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`
  - `src/features/threads/hooks/useThreadActions.claude-history.test.tsx`
  - `src/features/threads/hooks/useThreads.sidebar-cache.test.tsx`
  - `src/features/messages/components/Messages.history-loading.test.tsx`
  - thread lifecycle / approval continuity targeted tests
- Affected specs:
  - new `claude-thread-session-continuity`
  - modified `conversation-lifecycle-contract`
  - modified `claude-session-sidebar-state-parity`
- Dependencies / APIs:
  - 不引入新的外部依赖
  - 优先复用现有 event / loader / approval response contract；若现有 evidence 不足，可在后续 design 中补充最小必要 diagnostics
