## Why

`#392` 的原始问题是 `Claude Code` 对话幕布在少量机器上出现整块空白/白屏。`0.4.7` 已经尝试修复一部分 `Claude` render-safe 与 streaming visibility 问题，但 2026-04-24 的新反馈仍然指出：进行约 2 轮对话后，幕布会再次变成空白。

当前仓库已经有两个相邻但不等价的 active changes：

- `fix-claude-windows-streaming-visibility-stall` 处理的是 `first delta` 出现后可见文本不再持续推进的 `visible stall`
- `fix-claude-long-markdown-progressive-reveal` 处理的是长 Markdown 在 streaming 中后段的 progressive reveal 失真

这两个 change 都没有直接定义“整个 conversation curtain 变成空白”的 residual blanking contract。继续把它混在现有 change 里，会让 triage 继续把“可见文本不再增长”和“整块幕布变白/变空”视为同一类问题，证据会继续混杂。

## 目标与边界

### 目标

- 单独定义 `Claude Code` 残余 `repeat-turn blanking` 的行为边界，使其与 `visible stall`、`long-markdown reveal` 分离。
- 让系统在 `Claude` 第 2 轮及之后的 live conversation 中，若检测到幕布进入整块空白/无可读内容状态，仍能保留或恢复一个非空、可读的消息表面。
- 为该问题增加独立 diagnostics，明确区分：
  - `first delta` 后文字不再增长
  - 长 Markdown progressive reveal 失真
  - `repeat-turn` 场景下 conversation curtain 整块空白
- 保持修复为 evidence-driven、machine-scoped、可回滚，不把所有 `Claude` 会话一刀切降级。

### 边界

- 本 change 只处理 `Claude` 消息幕布 blanking，不处理左侧栏会话新增/删除不稳、删除报错或 session identity 漂移。
- 本 change 不重写整个 messages timeline / reducer / session store。
- 本 change 不改变 `Codex / Gemini / OpenCode` 的 render contract。
- 本 change 不新增持久化 schema，不修改会话删除或 reopen 语义。

## 非目标

- 不把该问题并回“所有 Claude 流式异常”的单一提案。
- 不通过“自动切线程 / 自动新建会话 / 强制重开应用”来掩盖 blanking。
- 不顺手处理 sidebar truth mismatch、session not found 删除报错等 lifecycle 问题。
- 不把整个 `Claude` live surface 永久降级成 plain-text 或 final-only render。

## What Changes

- 新增 `claude-repeat-turn-blanking-recovery` capability，定义 `Claude` 在第 2 轮及之后出现整块空白时的 in-place recovery contract。
- 修改 `conversation-render-surface-stability`，要求 `Claude` live curtain 在 residual blanking 下必须保留或恢复至少一个可读 surface，而不是完全空白。
- 修改 `conversation-stream-latency-diagnostics`，新增与 `visible-output-stall-after-first-delta` 平行但不相同的 `repeat-turn blanking` 证据分类。
- 补充验证矩阵，确保该问题与 session/sidebar 真值漂移严格分离。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 继续把问题并入现有 `visible stall` / `long-markdown` changes | 不新增 capability，变更面最小 | 会继续混淆“文字不增长”和“整块幕布空白”两种现象，triage 仍然不干净 | 不采用 |
| B | 对所有 `Claude` 会话永久启用更强 render-safe 降级 | 实现简单，能粗暴兜住部分白屏 | 会误伤正常机器，且无法证明问题已被正确分类 | 不采用 |
| C | 单独定义 `repeat-turn blanking` capability，并以 `Claude + evidence + affected machine` 触发恢复 | 边界清晰，证据可归类，可与现有 change 协同 | 需要补 diagnostics、recovery path 与验证矩阵 | 采用 |

## 验收标准

- 当 `Claude` 会话已成功完成至少 1 个 user/assistant 回合，且后续 turn 在 live processing 中触发 residual blanking 时，conversation curtain MUST NOT 长时间保持整块空白。
- blanking recovery 激活后，系统 MUST 保留或恢复至少一个可读 surface（如 last readable rows、working feedback 或等价降级态），且用户不需要切线程或重开会话才能看到内容。
- diagnostics MUST 能将该问题归类为 `repeat-turn blanking` 或等价显式类别，而不是误归到 `visible-output-stall-after-first-delta`。
- blanking recovery MUST NOT 隐式创建新线程、修改当前选中会话 identity，或把问题转移成 sidebar/session lifecycle 变更。
- 非受影响 `Claude` 路径，以及非 `Claude` 引擎 MUST 保持现有基线行为。

## Capabilities

### New Capabilities

- `claude-repeat-turn-blanking-recovery`: 定义 `Claude` repeat-turn live conversation curtain 的 residual blanking recovery contract。

### Modified Capabilities

- `conversation-render-surface-stability`
- `conversation-stream-latency-diagnostics`

## Impact

- Affected frontend:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
  - `src/features/messages/components/MessagesRows.tsx`
  - `src/features/messages/components/Markdown.tsx`
  - `src/features/threads/utils/streamLatencyDiagnostics.ts`
- Affected specs:
  - new `claude-repeat-turn-blanking-recovery`
  - modified `conversation-render-surface-stability`
  - modified `conversation-stream-latency-diagnostics`
- Validation:
  - targeted renderer / diagnostics tests
  - affected-machine manual matrix

