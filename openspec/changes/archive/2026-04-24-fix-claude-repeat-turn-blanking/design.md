## Context

当前仓库已经为 `Claude` 幕布问题建立了两条相邻修复线：

- `visible stall`: 首个 assistant delta 已到达，但可见文本停止增长
- `long-markdown progressive reveal`: 长 Markdown 中后段的 live render 失真

新反馈描述的现象更重：约两轮对话后，整个 conversation curtain 变成空白。它不要求先证明 Markdown 增长停顿，也不等价于 first-delta stall。用户感知是“这一轮的整个幕布没了”，而不是“文本出得慢”。

因此本 change 的正确边界是：**render surface continuity under repeat-turn Claude blanking**，而不是继续放进一般性的 stream latency 桶里。

## Goals / Non-Goals

**Goals**

- 把 `repeat-turn blanking` 作为独立现象建模。
- 让系统在 blanking 发生时保留或恢复非空幕布，而不是把整个区域留白。
- 让 diagnostics 能独立标记这种故障，并与 `visible stall` 分层。
- 保持问题与 session/sidebar lifecycle 完全解耦。

**Non-Goals**

- 不处理 reopen、sidebar、新增/删除、`Session file not found`。
- 不重写所有 `Claude` render path。
- 不对全部 `Claude` 会话永久启用强降级。

## Decisions

### Decision 1: 把它定义为 render continuity bug，而不是 lifecycle bug

该现象发生在当前会话已打开、输入区仍在、但消息幕布变空的阶段。它首先是 render continuity 问题，不是 session identity 问题。

这能保证后续修复不会错误地通过“切线程”“重新创建 Agent”来掩盖幕布 blanking。

### Decision 2: `repeat-turn blanking` 必须与 `visible stall` 独立分类

`visible stall` 关注的是“文字不再增长”，而 residual blanking 关注的是“整个 curtain 失去可读内容”。两者可能共享部分 runtime/renderer 信号，但 triage 口径必须独立。

否则 diagnostics 会继续把两类故障压成同一 bucket，后续验证仍然无法判断到底哪条修复起效。

### Decision 3: 优先采用 in-place recovery，而不是跨会话动作

当 blanking 发生时，优先策略应当是：

1. 保留 last readable surface
2. 切到更轻量的 live surface 或等价 render-safe fallback
3. 在 completed 后回到稳定终态

而不是：

1. 自动创建新线程
2. 自动切换其他会话
3. 要求用户手工 reopen 才恢复

### Decision 4: mitigation 必须 evidence-driven 且 bounded

该问题目前仍呈现“部分机器更容易触发”的特征，因此 mitigation 不能做成“所有 `Claude` 会话都进入更重降级”。必须由 `engine=claude`、repeat-turn blanking evidence、当前 render phase 等条件共同决定。

### Decision 5: blanking recovery 不得改写 session/sidebar 真值

为了与另一个 change 明确解耦，本 change 禁止在 blanking recovery 中修改：

- 当前选中 thread identity
- recent conversations sidebar
- 会话新增/删除结果

这些都属于 `session-sidebar-state-parity` change 的职责。

## Risks / Trade-offs

- [Risk] residual blanking 的证据阈值过宽，导致正常 `Claude` 会话也触发较重降级。  
  Mitigation: 必须依赖 `repeat-turn`、非空幕布丢失、bounded detection window 等组合证据，而不是单一慢渲染指标。

- [Risk] preserve-last-readable-surface 会把旧内容留得过久，让用户以为本轮没有继续。  
  Mitigation: 保留 surface 时仍需显示 processing/working feedback，并在新内容恢复后立即切回 live path。

- [Risk] blanking 与已有 `visible stall` 证据重叠，造成双重分类。  
  Mitigation: diagnostics 上要求有明确优先级或并列字段，避免单 turn 被错误压缩为一种原因。

## Validation Plan

1. 增加 diagnostics coverage，验证 `repeat-turn blanking` 与 `visible stall` 可区分。
2. 增加 renderer regression tests，验证 blanking 发生时仍有非空 surface。
3. 验证 recovery 不会修改 thread/session identity。
4. 在受影响机器上执行 manual matrix，确认第 2 轮及之后不再出现整块空白。

## Open Questions

- blanking evidence 是否应显式包含 `turnOrdinal >= 2`，还是只要求“至少曾经成功显示过上一轮内容”即可？
- preserve-last-readable-surface 的最佳形态是冻结上一次稳定 rows，还是切到更轻的 plain-text/live snapshot？
- diagnostics 是否需要增加 machine fingerprint 摘要，帮助区分“小范围机器问题”而不引入隐私过载？

