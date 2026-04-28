## Context

视频证据显示 `Claude Code + Windows` 的卡顿有两种表现：

- 首轮对话主内容区长时间停在 processing，最后大段 tool / assistant 内容一次性落屏。
- 第二轮对话先出现少量流式片段，随后长时间静止，最后长答案整体跳出。

旧的 `fix-claude-windows-streaming-visibility-stall` 已经覆盖 frontend 可见层：当 app event 已进入 frontend 后，live assistant text 不能停在 prefix/stub。当前新证据更靠前：Rust Claude event forwarder 在真正 emit app event 前同步做 runtime bookkeeping。

当前关键路径：

```text
Claude CLI stdout
  -> src-tauri/src/engine/claude.rs parse/coalesce
  -> EngineEvent
  -> src-tauri/src/engine/commands.rs Claude forwarder
  -> runtime_manager.acquire_*_lease()
  -> runtime_manager.sync_claude_runtime()
  -> merge_process_diagnostics()
  -> Windows PowerShell Get-CimInstance Win32_Process
  -> persist_ledger()
  -> app_server_event emit
  -> frontend realtime handlers
```

代码热点：

- `src-tauri/src/engine/commands.rs:1199`：`TurnStarted` 先 acquire turn lease，再 `sync_claude_runtime()`。
- `src-tauri/src/engine/commands.rs:1220`：每个 `TextDelta / ReasoningDelta / ToolOutputDelta` 都先 acquire stream lease、再 `sync_claude_runtime()`。
- `src-tauri/src/runtime/mod.rs:1260`：`sync_claude_runtime()` 同步执行 `merge_process_diagnostics()` 并持久化 ledger。
- `src-tauri/src/runtime/process_diagnostics.rs:201`：Windows 通过 PowerShell/CIM 拉全量进程表。
- `src-tauri/src/runtime/mod.rs:1356`：`acquire_stream_lease()` 每次 delta 都 `persist_ledger()`。
- `src-tauri/src/runtime/mod.rs:1915`：`persist_ledger()` 序列化 runtime rows 并 atomic write。

32ms Claude text coalescing 只能解释碎片过多，不能解释 10s 级停顿。更合理的根因是：Windows process diagnostics 与 per-event ledger persist 被放在 stream hot path，造成 event backlog，最后批量 emit。

## Goals / Non-Goals

**Goals:**

- 让 Claude realtime delta 的 app event emit 成为 forwarder 的优先动作。
- 保留 runtime active-work protection：活跃 turn / stream 仍不能被 eviction 当 idle 清理。
- 将 process diagnostics / ledger persist 降为异步、限频、bounded 的 background work。
- 让 diagnostics 能证明是 upstream delay、backend forwarder stall、frontend visible stall，还是 final burst flush。
- 让 Windows process diagnostics 有 TTL cache、singleflight 与 timeout。

**Non-Goals:**

- 不改 Claude CLI 协议解析和 message schema。
- 不把所有 engine 的 runtime manager 都重构一遍。
- 不新增 Tauri command，不改 frontend service payload contract。
- 不删除 frontend `claude-windows-visible-stream` mitigation。
- 不把 runtime pool console 变成强实时进程监控器。

## Decisions

### Decision 1: forwarder 先 emit，runtime work 后置

**Decision**

Claude forwarder 对 `TextDelta / ReasoningDelta / ToolOutputDelta` 的处理顺序改为：

```text
1. 更新本 turn 必需的局部累积状态
2. emit app event / queue app-server-event
3. 执行轻量 runtime activity touch
4. 条件触发后台 runtime sync / diagnostics refresh
```

`TurnStarted` 可以做一次 runtime row upsert，但不得在首个可见 delta 前等待昂贵 diagnostics。terminal event 后可以做最终 runtime sync / persist。

**Why**

用户体验的第一优先级是 delta 可见。runtime diagnostics 是可观测性，不应阻塞实时输出。

**Alternatives considered**

- 保持现状但加 timeout：仍然每个 delta 进入慢路径，timeout 本身也会制造可见延迟。
- 完全移除 runtime work：会破坏 active-work protection 和 runtime pool console。

### Decision 2: 新增轻量 `touch_claude_stream_activity` 等价能力

**Decision**

为 Claude stream hot path 提供轻量内存更新：刷新 `last_used_at_ms`、stream lease、active-work renewal / foreground last event 等必要字段，但不触发 process diagnostics，不同步落盘。

该 helper 可以是新函数，也可以是现有 `acquire_stream_lease()` 的新 fast-path 参数；实现选择以最小侵入为准。

**Why**

active-work protection 不能丢，但每个 delta atomic write ledger 是错误粒度。streaming 中的“持续活跃”适合内存更新时间戳，落盘适合 turn start / heartbeat / terminal。

**Alternatives considered**

- 继续调用 `acquire_stream_lease()`：现实现会 per-event `persist_ledger()`。
- 只在 turn start 申请 lease：长 turn 期间可能被误判 stale，active-work last event 不够新。

### Decision 3: `sync_claude_runtime()` 从 delta path 移到 checkpoint / heartbeat

**Decision**

`sync_claude_runtime()` 只允许在这些点触发：

- turn start 的非阻塞 background refresh。
- terminal event 后的最终 sync。
- bounded heartbeat，例如每 N 秒最多一次。
- runtime pool console 显式 refresh 或 doctor/diagnostics 路径。

所有触发都必须避免多个 concurrent delta 重复启动同一 Windows process snapshot。

**Why**

`sync_claude_runtime()` 的职责是 runtime row 与 process diagnostics，不是 stream delivery。它可以稍后到达，但 delta 不能稍后到达。

**Alternatives considered**

- 每个 delta 后 `tokio::spawn(sync)`：会制造后台风暴，Windows 上仍会多次 PowerShell/CIM。
- 只在 terminal sync：diagnostics 时效差，无法定位长 turn 中途问题。

### Decision 4: Windows process diagnostics 使用 TTL cache + singleflight + timeout

**Decision**

Windows `snapshot_process_rows()` 或其调用层需要 bounded 机制：

- TTL cache：短时间内复用最近一次全量 process rows。
- singleflight：同一时间最多一个全量 PowerShell/CIM snapshot，其它请求 join 或复用 stale。
- timeout：超过阈值返回 stale/None，并记录可诊断 warning。
- no-hot-path：Claude delta path 不直接等待 process snapshot。

**Why**

`Get-CimInstance Win32_Process` 是全量系统查询，且通过 external process 执行。它适合诊断，不适合作为高频 stream delta 的同步前置条件。

**Alternatives considered**

- 换 `wmic`：兼容性更差，且仍是全量外部进程。
- 改成逐 pid 查询：可能减少数据量，但仍需外部命令/系统 API；先用 cache/singleflight 限制阻塞面更稳。

### Decision 5: diagnostics 增加 backend stall / burst flush evidence

**Decision**

stream latency diagnostics 要记录 backend 层 evidence：

- engine event received time
- app event emitted time
- runtime sync queued / completed / timed out
- process diagnostics cache hit / miss / stale / timeout
- burst flush count / max gap

这些证据必须写入既有 bounded diagnostics surface：runtime diagnostics、renderer diagnostics correlation、app-server diagnostic event、structured log 或等价项目既有通道；本 change 不通过修改稳定 Tauri command payload contract 来传递诊断。

前端已有 visible stall 分类继续保留。只有当 backend evidence 通过既有 frontend-consumable diagnostics surface 暴露时，frontend 才消费 `backend-forwarder-stall` / burst-flush 分类；如果 backend evidence 只是日志或 runtime-only，frontend 不得仅凭可见渲染延迟推断 backend stall。

**Why**

旧分类只能解释 frontend render 之后的问题。现在需要证明卡顿发生在 forwarder emit 前，避免继续误调 Markdown/render throttle。

### Decision 6: `.cmd` wrapper 风险列为 P1 diagnostics，不列为 P0 根因

**Decision**

Claude 启动路径中的 `cmd /c claude.cmd`、hidden console、stdio pipe 风险需要在已有 launch/runtime metadata 可获得时，通过 doctor/runtime row 暴露 `resolved_bin / wrapper_kind`。本 change 不为了补齐 wrapper metadata 新增 stream hot path 同步探测，也不把 wrapper 风险当作 P0 唯一根因。

**Why**

`.cmd` wrapper 可能放大 stdout 分批，但现代码已足以解释每个 delta emit 前的同步阻塞。P0 应先移除确定性 hot-path 阻塞。

## Risks / Trade-offs

- [Risk] 后置 ledger persist 导致崩溃后 runtime ledger 不够新。  
  Mitigation: turn start / terminal / heartbeat 仍持久化，active stream 用内存 protection 兜底。

- [Risk] background sync 乱序覆盖 runtime row 新状态。  
  Mitigation: sync 带 generation / timestamp guard，旧 refresh 不能覆盖更新的 terminal / shutdown 状态。

- [Risk] Windows diagnostics cache stale，runtime pool console 显示短暂过期信息。  
  Mitigation: row 标记 diagnostics freshness / stale reason；用户可显式 refresh。

- [Risk] spawn background task 失败被吞，导致 observability 变弱。  
  Mitigation: 失败写 bounded warn diagnostics，不影响 stream delivery。

- [Risk] 前端 visible stall 和 backend burst stall 同时存在。  
  Mitigation: 两类 diagnostics 同时保留，按时间线定位主瓶颈；不互相覆盖。

## Migration Plan

1. 在 Rust 侧补测试 seam：构造 slow runtime sync / slow diagnostics，断言 delta emit 不等待 slow work。
2. 为 runtime manager 增加 Claude stream fast touch 或改造 `acquire_stream_lease()` fast path。
3. 调整 `src-tauri/src/engine/commands.rs` Claude forwarder 顺序：delta 先 emit，runtime refresh 后置。
4. 为 Windows process diagnostics 加 TTL cache / singleflight / timeout。
5. 补 stream latency diagnostics backend stall / burst flush evidence。
6. 补 frontend final parity 回归：完成事件不得破坏已显示 delta。
7. Windows native Claude Code 手测首轮、第二轮、tool-heavy prompt。

**Rollback strategy**

- 如果 fast touch 引发 runtime retention 异常，可临时恢复 `acquire_stream_lease()` 的 persist 频率，但保留 process diagnostics off-hot-path。
- 如果 diagnostics cache 导致 console 信息不足，可缩短 TTL 或只对 stream path 使用 stale fallback。
- 如果 background sync 引入状态乱序，先停用 heartbeat，仅保留 start/terminal sync。

## Open Questions

- Windows process diagnostics TTL 默认取多少：`1s`、`2s` 还是跟 runtime pool refresh interval 对齐？
- backend stall diagnostics 是否需要通过现有 renderer diagnostics surface 透出，还是先只写 runtime diagnostics/log？
- fast touch 是否独立命名为 `touch_claude_stream_activity()`，还是给 `acquire_stream_lease()` 增加非持久化变体？
- `.cmd` wrapper doctor 是否与本 change 同批实现 P1，还是拆成后续独立 diagnostics change？
