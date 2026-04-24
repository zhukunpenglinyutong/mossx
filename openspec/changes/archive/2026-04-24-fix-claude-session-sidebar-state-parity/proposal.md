## Why

2026-04-24 的新反馈除了继续提到 `Claude Code` 白屏，还新增了一条独立症状链：

- 之前的对话重新打开失败
- UI 自动冒出新的 Agent conversation
- 左侧旧会话删除时报“找不到对话”

这不是单纯的幕布 blanking。它反映的是 **左侧栏显示状态与实际 Claude native session 真值不一致**。当前代码里已有几个强信号：

- `Claude` 新线程会先生成本地 pending identity
- 现有 stale binding continuity proposal 明确只覆盖 `Codex`，没有覆盖 `Claude`
- `Claude` history load 失败后，前端仍可能把 thread 标记为 loaded
- `Claude` hard delete 在底层 session 文件缺失时会返回 `Session file not found`

因此本 change 要解决的是：**Claude sidebar state parity and native session truth**，而不是继续把它并入白屏问题。

## 目标与边界

### 目标

- 保证 `Claude` 左侧栏 entry 在 reopen/activate 前先与 authoritative native session truth 对齐。
- 当历史会话已失效、被替换或底层文件不存在时，系统 MUST 先 reconcile，再决定打开/删除结果。
- 禁止 UI 在无法打开旧会话时，静默创建一个不相关的新 Agent conversation 作为“替代”。
- 保证删除 `Session file not found` 这类错误时，左侧栏最终会回到与真实状态一致的结果。

### 边界

- 本 change 只处理 `Claude` 的 session identity、sidebar truth、delete reconcile。
- 本 change 不处理 active conversation 的白屏/blank curtain render bug。
- 本 change 不重做整个 conversation store 或数据库。
- 本 change 不把 `Codex` 的 alias 方案原样机械复制到所有引擎。

## 非目标

- 不顺手处理 `Claude` live streaming blanking。
- 不自动“猜测最像的另一个会话”并替代当前会话。
- 不将 `Claude` 左侧栏问题扩大成全引擎的大一统 session ledger 重构。

## What Changes

- 新增 `claude-session-sidebar-state-parity` capability，要求 `Claude` 左侧栏 entry 在 activation、reopen、delete 之前先做 native session reconcile。
- 修改 `conversation-lifecycle-contract`，定义 `Claude` stale sidebar entry 的 canonical resolution / reconcile 语义。
- 修改 `conversation-hard-delete`，定义 `Session file not found` 这类删除失败如何触发 authoritative refresh，而不是让 ghost entry 长时间残留。
- 明确禁止“旧会话打不开 -> 静默新建 Agent conversation 顶上去”的生命周期漂移行为。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 只把它当作删除提示文案问题处理 | 改动小 | 不能解决 reopen 失败、自动新建、sidebar ghost entry 等主症状 | 不采用 |
| B | 直接把 `Codex` alias 方案完整照搬给 `Claude` | 复用已有思路快 | `Claude` 的 native session 事实源与 `Codex` 不同，机械照搬风险高 | 不采用 |
| C | 以 `Claude` native session truth 为准，补齐 reopen canonicalization、load failure reconcile、delete not found refresh | 边界准确，能直接解释用户症状链 | 需要同时改 lifecycle、sidebar、delete 语义与测试 | 采用 |

## 验收标准

- 当用户重新打开左侧栏中的 `Claude` 历史会话时，系统 MUST 先确认或解析其 canonical native session；若目标已失效，系统 MUST reconcile 该 entry，而不是静默创建不相关的新 Agent conversation。
- 当 `Claude` history load 失败时，系统 MUST NOT 将该 entry 继续当作“已成功打开”的 loaded thread。
- 当删除 `Claude` 会话返回 `Session file not found` 或等价 not-found 错误时，系统 MUST 执行 authoritative refresh/reconcile，使左侧栏最终不再保留永久 ghost entry。
- 左侧栏当前选中 entry 与实际打开的 `Claude` native session MUST 保持同一 identity，不得出现显示和实际不符。
- 非 `Claude` 引擎，以及正常可打开/可删除的 `Claude` 路径 MUST 保持现有基线行为。

## Capabilities

### New Capabilities

- `claude-session-sidebar-state-parity`: 定义 `Claude` recent conversations sidebar 与 native session truth 的一致性 contract。

### Modified Capabilities

- `conversation-lifecycle-contract`
- `conversation-hard-delete`

## Impact

- Affected frontend:
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadActions.sessionActions.ts`
  - `src/features/threads/hooks/useThreadActionsSessionRuntime.ts`
  - `src/features/threads/hooks/useThreads.ts`
- Affected backend:
  - `src-tauri/src/engine/claude_history.rs`
- Affected specs:
  - new `claude-session-sidebar-state-parity`
  - modified `conversation-lifecycle-contract`
  - modified `conversation-hard-delete`
- Validation:
  - targeted hook / delete tests
  - restart/reopen manual matrix

