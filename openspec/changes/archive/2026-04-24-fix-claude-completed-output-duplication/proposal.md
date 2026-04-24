## Why

`Claude Code` 的实时对话在少量场景下会出现另一类 terminal duplication：live curtain 已经先渲出 assistant 正文前缀，但 turn 完成时收到的 completed payload 又把这段前缀连同完整最终正文一起重放，最终让用户看到“大段 Markdown / 报告在最后一下重复一遍”。

这不是 `history reconcile` 缺失，也不是 blanking 或 sidebar truth mismatch。当前仓库的相邻 changes 已分别覆盖：

- `fix-claude-repeat-turn-blanking`：处理第 2 轮及之后的空幕布
- `fix-claude-session-sidebar-state-parity`：处理 sidebar/session 真值漂移

它们都没有定义“Claude completed payload replay 已流出前缀，导致 terminal assistant bubble 重复”的行为边界。继续把这个问题混进现有 changes，会让“白屏 / 会话漂移 / completed duplication”三类故障重新混在一起。

## 目标与边界

### 目标

- 单独定义 `Claude` terminal settlement 中的 completed output duplication 边界。
- 当 live assistant 已经显示过可读前缀，且 completed payload 以 `prefix + full snapshot` 形式回放时，系统 MUST 收敛成一条最终 assistant message。
- 保持该修复在 reducer / completed-text normalization 边界内完成，不依赖停用 history reconcile 或改写 session identity。
- 为该问题补充 targeted tests，覆盖 Markdown report / 大段正文的 prefix replay 形态。

### 边界

- 本 change 不处理 blanking、幕布空白、render-safe degradation。
- 本 change 不处理 sidebar/session 新增、删除、reopen truth mismatch。
- 本 change 不修改 backend event contract，不调整 Tauri command、history loader 或持久化 schema。
- 本 change 不改变非 `Claude` 引擎的 lifecycle 行为。

## 非目标

- 不通过关闭实时输出或推迟 completed 渲染来规避重复。
- 不修改 `Claude` turn completed 后的 history reconcile 调度策略。
- 不重做 assistant item identity / alias 机制。
- 不顺手处理 fragmented reasoning、provider mitigation 或其他 renderer 问题。

## What Changes

- 修改 `conversation-lifecycle-contract`，补充 `Claude` completed snapshot replay 与 live prefix convergence 的 terminal settlement 契约。
- 在 `threadReducerTextMerge` 中增加 completed assistant text 的 leading replay collapse。
- 增加 reducer / merge 层回归测试，验证 Markdown report 形态不会在 completed 时留下重复大段正文。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 改 history reconcile，依赖最终 history snapshot 覆盖 live bubble | 思路直接 | 误伤现有 history path，且问题实际发生在 completed merge 前 | 不采用 |
| B | 在 render 层识别重复大段落并做展示去重 | 改动面表层，易兜底 | 会把 reducer state 中的重复保留下来，治标不治本 | 不采用 |
| C | 在 completed assistant text normalization 阶段折叠 `prefix + full snapshot` replay | 边界最小，直接修正 terminal state，测试可控 | 需要小心避免误伤合法重复正文 | 采用 |

## 验收标准

- 当 `Claude` live assistant 已显示可读前缀，completed payload 又回放这段前缀并附带完整最终正文时，terminal settlement MUST 只留下一个最终 assistant bubble。
- 对 Markdown report / 大段列表 / 长段落正文，这类 replay MUST NOT 在 completed 后留下两份主体内容。
- 该修复 MUST NOT 依赖停用 `Claude` history reconcile，且 reconcile 后状态 MUST 保持单条 assistant message 收敛。
- 非 `Claude` 引擎与未命中 replay 形态的正常 completed payload MUST 保持现有基线行为。

## Capabilities

### Modified Capabilities

- `conversation-lifecycle-contract`

## Impact

- Affected frontend:
  - `src/features/threads/hooks/threadReducerTextMerge.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/threadReducerTextMerge.test.ts`
  - `src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts`
- Affected specs:
  - modified `conversation-lifecycle-contract`
- Validation:
  - targeted Vitest for completed-text merge and reducer duplicate collapse
  - `npm run typecheck`
