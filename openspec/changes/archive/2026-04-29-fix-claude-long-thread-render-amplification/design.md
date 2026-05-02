## Context

当前 backend change 已经把 Claude forwarder 的 emit 与 runtime diagnostics 解耦。Windows 侧新文档补充了另一个独立瓶颈：长线程 live delta 进入 frontend 后，reducer 和 message render pipeline 仍会把每个增量放大成整线程扫描与对象重建。

关键现状：

- `appendAgentDelta` 每次更新 assistant text 后都调用 `prepareThreadItems(list)`。
- `prepareThreadItems(...)` 会 normalize/coalesce/filter/AskUserQuestion normalize/explore summarize/tool output truncate。
- `Messages` 的 `visibleItems`、reasoning dedupe/collapse、timeline collapse 都在完整 `effectiveItems` 上执行，尾部窗口裁剪在最后才发生。
- `streamLatencyDiagnostics` 已经支持 evidence-driven generic Windows Claude mitigation，因此本 change 不重复做 provider mitigation。

## Goals / Non-Goals

**Goals:**

- 为纯文本 live assistant delta 提供保守 fast path。
- 把 live collapsed-history 视图的主要 render 推导输入限制到 tail working set。
- 保留 full history opt-in 与所有 message semantic contracts。
- 补充 compacting lifecycle 回归测试。

**Non-Goals:**

- 不改 backend stream forwarding。
- 不改 message schema、Tauri event payload 或 persistent storage。
- 不替换 Markdown renderer。
- 不扩大到所有 provider 的 stream pacing。

## Decisions

### Decision 1: reducer fast path 只覆盖“同一个现有 assistant item 的纯文本追加”

**Decision**

`appendAgentDelta` 在以下条件全部满足时走 fast path：

- 找到现有 assistant message。
- `nextId === existing.id`，不涉及 legacy/canonical id 迁移。
- `mergeAgentMessageText(existing.text, delta)` 产生新文本。
- 当前更新不需要保留 final metadata；如果仍需处理 finalized metadata，回退慢路径。
- 不引入新 item，不涉及 tool/reasoning/review/explore 结构。
- 该 assistant item 已经位于当前 list 尾部或最后一个 assistant live position，避免中间历史 item 修改绕过全量 canonicalize。

fast path 只替换该 item，直接返回 next state；`completeAgentMessage` 和结构化事件继续使用 `prepareThreadItems(...)`。

**Why**

文本追加是最热路径。把 canonicalize 延后到 completion 能保留最终一致性，同时避免每个 token 扫描完整历史。

**Alternatives**

- 对所有 `appendAgentDelta` 都跳过 prepare：风险过大，容易破坏 legacy id、dedupe 和 rename。
- 修改 `prepareThreadItems` 做内部增量缓存：改动面更大，难以本轮收口。

### Decision 2: live tail working set 在 presentation transforms 前生成

**Decision**

新增 helper 计算 live render working set：

- 仅在 `!showAllHistoryItems && isThinking && effectiveItems.length > expanded window` 时启用。
- 取最近 `VISIBLE_MESSAGE_WINDOW + buffer` 条 raw/effective items。
- 额外保留 latest ordinary user message 作为 sticky candidate。
- 输出 `workingItems` 与 `omittedBeforeWorkingSetCount`。

`visibleItems`、reasoning dedupe/collapse、timeline collapse 基于 `workingItems`；collapsed history count 需要加上 `omittedBeforeWorkingSetCount`，保证历史折叠数量不变。

**Why**

最终 DOM 裁剪只能降低渲染数量，不能降低推导成本。working set 前移能让主要 presentation transforms 在 bounded input 上运行。

**Alternatives**

- 完全只取最后 30 条：可能丢 sticky user 和 collapse count。
- 虚拟列表重构：更完整但超出当前 YAGNI。

### Decision 3: compaction UX 只补状态链，不重做 UI

**Decision**

沿用现有 `thread/compacting`、`thread/compacted`、`thread/compactionFailed` 和 `isContextCompacting`，补测试确认：

- compacting 事件立即进入 compacting indicator。
- compacted 事件清除 compacting 并追加 deduped `Context compacted.`。
- compactionFailed 清除 compacting 并进入稳定错误态。

**Why**

现有状态流已经存在，风险在回归覆盖不足，不需要新 UI 或 payload。

## Risks / Trade-offs

- [Risk] fast path 条件过宽导致 canonicalize 被绕过。  
  Mitigation: 只覆盖同 id、非 final metadata、现有 assistant、尾部 live item；其它路径回退慢路径。

- [Risk] tail working set 破坏 sticky user 或 collapsed history count。  
  Mitigation: helper 显式返回 omitted count，并保留 latest ordinary user item；新增测试。

- [Risk] show-all history 被误裁剪。  
  Mitigation: `showAllHistoryItems` 时禁用 working set，保留全量路径。

- [Risk] performance fix 与现有 mitigation 叠加后难以定位。  
  Mitigation: 不新增 mitigation profile，仅减少基础路径计算量。

## Migration Plan

1. 补 reducer fast path helper 与回归测试。
2. 补 live render working set helper 与 message tests。
3. 补 compaction lifecycle tests。
4. 跑 targeted tests，再跑 `npm run lint && npm run typecheck && npm run test`。

Rollback:

- fast path 可通过 `ccgui.perf.incrementalDerivation=0` 或代码回退恢复慢路径。
- working set helper 可由条件门控禁用，恢复现有 full derivation path。

## Open Questions

- working set buffer 默认取 `VISIBLE_MESSAGE_WINDOW` 还是更小值；本轮保守使用 `VISIBLE_MESSAGE_WINDOW * 2` 上限窗口，优先避免视觉回退。
