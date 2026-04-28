## Context

当前 `Codex` 左侧栏可见会话来自一条组合投影链路：

1. `useThreadActions.listThreadsForWorkspace()` 组合 live `thread/list`、`listWorkspaceSessions(active codex)`、local scan / cached known ids、其它引擎 session summaries。
2. 结果经 `useThreadsReducer` 的 `setThreads` 收敛为 workspace 级 thread list。
3. `useAppShellSearchRadarSection` 再把 thread list 派生为 workspace home / recent conversations surfaces。

标题 truth 也来自多源：

- reducer 首条 user message 的 transient rename
- `thread_titles.json` / `customNames`
- active catalog / local session summary title
- fallback ordinal `Agent x`

当前实现已经处理两类 continuity：

- 整表失败时的 `last-good` fallback
- active/pending thread 的保活

但没有处理这次故障的主链路：**refresh 并未整表失败，只是某次 partial refresh 少返回几条刚刚可见的 Codex finalized sessions**。当这些条目被 `setThreads` 直接替换掉，下次又从另一 source/catalog 重新出现时，标题 truth 也会因为重建而回退成 `Agent x` 或另一份 title。`Claude` 已经有专门的 sidebar parity capability，`Codex` 当前缺少等价 contract。

## Goals / Non-Goals

**Goals:**

- 让 `Codex` sidebar / workspace home recent threads 在 partial omission 下保持 last-good visible continuity，而不是只在整表为空时 fallback。
- 定义 `Codex` sidebar projection 的 authoritative truth boundary：哪些 refresh 结果可以直接替换，哪些只能视为 degraded merge。
- 定义稳定的标题优先级，避免单次 refresh 将已确认标题回退成 `Agent x`。
- 覆盖普通 `Codex` 会话与 `spawn_agent` 派生 agent-style 子会话在 active-to-completed cutover 下的连续可见性。

**Non-Goals:**

- 不重做消息区 history hydrate、realtime reducer、generated image/linkage contract。
- 不引入新的后端存储格式或数据库层。
- 不调整其它引擎的 sidebar truth 语义，只要求不回退。

## Decisions

### Decision 1: 把 `Codex` sidebar list 视为“authoritative snapshot + degraded continuity merge”，而不是纯 replace

- 现状：`setThreads` 接收到一次 refresh 结果后，除了 active/pending 保活，其余条目基本按新列表覆盖。
- 问题：对于 `Codex`，一次 refresh 可能只是 active catalog、live `thread/list`、local scan 中某一路暂时少了几条 finalized sessions，并不代表这些 session 的 truth 真正消失。
- 选择：当 refresh 带有 partial/degraded 信号，或来源特征本身只覆盖活动子集时，前端应将其视为 **degraded continuity merge**：
  - 保留最近一次成功可见的 finalized `Codex` sessions；
  - 对本轮仍可确认的 entries 做更新时间、source meta、title truth 的增量更新；
  - 对缺失 subset 打 degraded / partial diagnostics，而不是立即从 sidebar 移除。

备选方案：

- 方案 A：继续只保活 active/pending thread。
  不足：completed agent session 仍会在 active->completed 切换窗口闪烁消失。
- 方案 B：简单延迟 UI 更新。
  不足：只是隐藏事实源漂移，不能保证多 surface 一致。

### Decision 2: 标题采用稳定优先级，不再允许 refresh 把 confirmed title 回退为 ordinal fallback

- 现状：thread title 可能来自 transient first-user rename、persisted title mapping、catalog title 或 fallback `Agent x`。
- 问题：当条目被 refresh 删除后重建，`Agent x` 会重新参与命名，导致 visible rollback。
- 选择：收敛为稳定 precedence：
  1. explicit custom / persisted title
  2. authoritative mapped title（thread title mapping / recovered persisted title）
  3. stable catalog title / session title
  4. transient first-user rename
  5. ordinal fallback `Agent x`

一旦 thread 已经拿到比 ordinal fallback 更强的 title truth，后续 refresh 不得降级。catalog title 可以升级 fallback，但不能覆盖 explicit custom title。

备选方案：

- 方案 A：所有 first-user rename 立即持久化。
  风险：会把短期 prompt 文本过度固化，覆盖更好的 catalog title。
- 方案 B：完全只信 catalog title。
  风险：live thread / local scan 缺 title 时仍会频繁回退成 `Agent x`。

### Decision 3: agent-style Codex 子会话走 bounded continuity retention，而不是永久 pin 住

- 现状：`spawn_agent` 派生出来的 `Codex` 子会话往往先出现在 active catalog，结束后又需要依赖 live list/local scan 才能继续可见。
- 问题：切换窗口里如果 active catalog 已不返回、local scan 又暂时未追上，条目就会消失。
- 选择：对 recently visible finalized `Codex` sessions 引入 **bounded continuity retention**：
  - 仅在 degraded / partial refresh 窗口保留；
  - 一旦后续 authoritative refresh 明确该 session 不再属于当前 workspace visible history，再允许移除；
  - 这样避免永久 ghost entries，也避免 active-to-completed 窗口闪烁。

备选方案：

- 方案 A：所有出现过的 Codex session 永久保留到用户手动清理。
  不足：会制造真正的 ghost history。
- 方案 B：只靠 current `knownCodexThreadIds`。
  不足：它只解决 `cwd` 缺失，不解决 active-only catalog 子集问题。

### Decision 4: 多 surface 共享同一 sidebar parity 结果，不允许 workspace home/recent 与左侧栏各自推导

- 现状：workspace home recent threads 来自 `threadsByWorkspace` 的派生排序；左侧 thread list 与 pinned list 也是独立消费同一 store，但缺少明确 parity contract。
- 选择：把 parity 修复落在 `thread summaries` 层，而不是单独在某个组件做二次补丁。这样：
  - ThreadList
  - PinnedThreadList
  - workspace home recent conversations
  - topbar 恢复集

都共享同一份 continuity truth。

## Risks / Trade-offs

- [Risk] 保留 last-good subset 过久会制造真正的 ghost entry。
  → Mitigation：仅在 degraded / partial refresh 条件下保留，并要求后续 authoritative refresh 明确收敛。

- [Risk] 标题 precedence 过强会阻止 catalog title 更新更优标题。
  → Mitigation：只禁止降级到 weaker source；允许 stronger source 升级 weaker source。

- [Risk] `Codex` 特殊 continuity 逻辑误伤其它引擎。
  → Mitigation：contract 与实现边界都限定在 `engineSource === "codex"` 的 native sessions。

- [Risk] 测试只覆盖 reducer，不覆盖多 source merge 真实链路。
  → Mitigation：同时补 `useThreadActions.native-session-bridges`、`useThreadActions` 与 reducer 级回归。

## Migration Plan

1. 先补 spec delta，固定 `Codex` sidebar parity、partial omission continuity 与 title precedence。
2. 在 `useThreadActions` 的 thread summary merge 层实现 degraded continuity merge，避免只在组件层打补丁。
3. 在 `useThreadsReducer.setThreads` 补 Codex finalized continuity 保留与 title downgrade guard。
4. 回归测试覆盖：
   - partial refresh omission
   - active-to-completed agent session cutover
   - title confirmed 后 refresh 不回退成 `Agent x`
5. 若实现出现误保留条目风险，优先回滚 continuity retention 规则，保留 diagnostics 与 title precedence 改动。

## Open Questions

- 当前 degraded / partial 信号是否已经足够区分“subset omission”与“真实 authoritative remove”，还是需要补一层更明确的 list-source diagnostics。
- `workspace home recent threads` 是否需要显式显示 degraded badge，还是沿用 thread summary 上已有的 degraded metadata 即可。
