## Context

Issue #374 反映出的故障形态不是单点行为错误，而是 conversation host runtime 在异常链路上的系统性失稳：任务可能提前结束，历史/上下文在不同 surface 上表现为“像是消失了”，用户紧接着再尝试 reopen、rewind、new thread 或 reconnect 时，会触发额外的 session acquire / reconnect / history reload，最终形成 CPU storm、风扇狂转和交互卡死。

当前仓库已经有几条相邻 contract：

- `codex-rewind-hard-truncation`：解决 rewind 成功语义必须等于真截断。
- `workspace-session-catalog-projection-parity`：解决项目级 session scope/count 不一致。
- `global-session-history-archive-center`：解决 strict/global/inferred history 可见性与归属。
- `conversation-lifecycle-contract`：定义跨引擎 lifecycle continuity。

但这些 contract 还没有覆盖一个共同底层问题：当 host runtime/session orchestration 进入异常恢复链路时，系统应该如何限制重试、隔离 stale runtime、保留最后一个可恢复状态，以及如何给用户和开发者留下足够诊断证据。

本变更因此不是重做 provider protocol，而是给现有 runtime manager、session health probe、reconnect/list/history consumers 和 diagnostics surfaces 补一个统一稳定性设计。

## Goals / Non-Goals

**Goals:**

- 为 `workspace + engine` 维度定义统一的 runtime stability guard，覆盖 reacquire/reconnect storm、stale session、pseudo-processing residue 与新会话继承旧失败态的问题。
- 让异常恢复链路具备确定性的 retry budget、backoff 与 quarantine 语义，避免“自动恢复”演化为高频死循环。
- 保持 list/history/reopen 在部分失败下的用户可见 continuity：宁可 degraded，也不要伪装成空态或 processing 卡死。
- 把现有 `runtime_log_*`、renderer diagnostics、thread session log 组织成最小 evidence path，便于 issue 复盘和责任归因。

**Non-Goals:**

- 不修改 Claude/Codex/Gemini/OpenCode 的 provider 协议或 CLI event 格式。
- 不重开 history scope/source/attribution 的设计，只消费这些能力的输出。
- 不新增数据库或永久化 incident store；本轮优先复用已有 runtime log 与 client diagnostics。
- 不把 remote mode 补到和 local mode 完全同等，只要求 local mode 先达成稳定性 contract。

## Decisions

### Decision 1: 把问题归因收口在 host runtime stability contract，而不是继续按症状散修

- 方案 A：继续分别修 `rewind`、history、CPU 高占用、thread/list 重试。
  - 问题：每次都能止血，但无法约束“异常恢复如何结束”。
- 方案 B：把问题统一定义为 host runtime stability contract。
  - 结果：所有异常链路共享同一套 retry / degraded / quarantine / diagnostics 语义。

取舍：采用方案 B。

这意味着实现必须把 `ensure_codex_session(...)`、workspace reconnect、thread/list/history reload 和 post-rewind resume 视为同一类“runtime-dependent action”，共享一套稳定性守卫，而不是每个入口自己兜底。

### Decision 2: 在 `workspace + engine` 维度建立 bounded recovery guard

- 方案 A：每个调用点自己计数重试。
  - 问题：状态分散，容易重复触发并互相放大。
- 方案 B：在 runtime manager 侧维护 `workspace + engine` 级别的 acquisition/recovery guard。
  - 结果：`send`、`new thread`、`resume`、`thread/list`、reconnect 都能共享 budget/backoff/quarantine。

取舍：采用方案 B。

建议形态：

- key：`workspaceId + engine`
- state：
  - `Healthy`
  - `Recovering { attempts, first_failure_at, next_retry_after }`
  - `Quarantined { reason, until, last_error }`
- reset 条件：
  - 成功 health probe
  - 成功 acquire 并稳定完成一次 runtime-dependent action
  - 用户显式触发 retry / reconnect after quarantine

### Decision 3: 把失败结果收敛成三种用户可见语义，而不是裸错误文本

- 方案 A：沿用当前字符串错误，谁失败谁报。
  - 问题：用户只能看到“没继续”“上下文没了”“workspace not connected”这类局部症状。
- 方案 B：统一映射为结构化 stability diagnostic。
  - 结果：前端可以稳定区分不同恢复策略和 UI 承接。

取舍：采用方案 B。

最低需要的诊断类别：

1. `runtime_ended_early`
   - turn 未完成但 runtime 已断开或失活
2. `workspace_connectivity_drift`
   - `workspace not connected`、reconnect 失败、session health probe 失败
3. `history_partial`
   - list/history/reopen 部分 source/root 失败，但存在 last-good snapshot
4. `runtime_recovery_quarantined`
   - 自动恢复达到 budget 上限，系统停止自动 storm，等待用户动作

### Decision 4: list/history/reopen 在部分失败下优先保留 last-good snapshot，并显式 degraded

- 方案 A：失败即清空并显示空态。
  - 问题：用户会把读取失败误读成“上下文已丢失”。
- 方案 B：保留最近一次成功快照，并标注 degraded/partial。
  - 结果：用户可继续操作，也能知道当前不是完整真相。

取舍：采用方案 B。

适用面：

- thread list
- workspace/session history surfaces
- reopen 后的历史回放入口

约束：

- last-good snapshot 只是读取 continuity 的兜底，不能伪装成最新真值。
- 所有 degraded surface 都必须显示来源，例如 `reconnect failed; showing last successful list`、`history partial; some sources unavailable`。

### Decision 5: evidence path 复用现有日志基座，只补统一关联字段，不新造系统

- 方案 A：新建完整 incident store。
  - 问题：成本高、范围膨胀。
- 方案 B：复用 `runtime_log_*`、renderer lifecycle log、thread session log，并统一关键维度字段。
  - 结果：实现成本低，足够支持 issue 复盘与定向调试。

取舍：采用方案 B。

关键关联字段：

- `workspaceId`
- `engine`
- `threadId`（若已知）
- `action`（send/new-thread/resume/thread-list/history-reload/rewind-followup）
- `attempt`
- `recoveryState`
- `errorCategory`

这允许前端在 debug/runtime-log surface 里按同一组键抓出一次故障链路，而不需要引入新的持久化 schema。

## Risks / Trade-offs

- [Risk] recovery guard 过严会误伤短时抖动，导致系统太早进入 quarantine  
  → Mitigation：先从小预算 + 短 cooldown 开始，并允许用户显式重试清空 quarantine。

- [Risk] last-good snapshot 掩盖真实新状态，造成“看起来有内容，但其实已过期”  
  → Mitigation：所有 fallback 都必须带 degraded 文案和时间边界，不得伪装成 fresh truth。

- [Risk] 结构化 diagnostics 增加前端状态分支  
  → Mitigation：限制在少数稳定类别，映射到统一 notice / banner / debug surface，而不是每个组件自定义。

- [Trade-off] 这会把部分异常从“自动无限尝试”改成“自动尝试有限次后停下等人”  
  → Mitigation：牺牲一点“自愈幻想”，换取机器稳定和用户可预期行为。

## Migration Plan

1. 先在 backend/runtime 层增加 bounded recovery guard 与 diagnostics 分类，不改 UI 行为，只保留日志与 state。
2. 前端 list/history/reopen/sending surfaces 接入 degraded + recoverable diagnostics 展示。
3. 把 post-rewind、new-thread-after-failure、thread/list reconnect 这些高风险入口切到共享 recovery guard。
4. 补 targeted regression tests 与一次手工 stress 验证。

Rollback strategy:

- 若 recovery guard 引入误判，可先保留 diagnostics 与 last-good continuity，临时放宽 quarantine/budget。
- 若 degraded surface 文案或 UI 承接有问题，不回滚 backend guard，只降级为 debug-only 呈现。

## Open Questions

- `runtime_recovery_quarantined` 是否需要用户可见的显式“重试”按钮，还是复用现有 reconnect/new-thread action 已足够？
- 同一个 workspace 下多 thread 并发时，是否需要 `workspace + engine + threadKind` 粒度，而不是纯 `workspace + engine` 粒度？
- remote mode 是否需要立刻暴露同样的 diagnostics code，还是先返回 capability-limited 提示即可？
