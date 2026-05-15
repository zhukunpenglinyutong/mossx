## Context

现有 Codex liveness 链路把“前端长时间没有观察到 progress”与“turn 已经死亡”绑定得过紧。代码中普通 Codex no-progress window 是 600 秒，active execution window 是 1200 秒；超时后前端会走 stalled tracked / quarantine / terminal external settlement。这在防止 pseudo-processing 永久挂住方面有效，但对长时间静默模型请求和后台会话并发不够稳。

本地证据显示，3 个 `gpt-5.4` 并发 turn 在同一 app-server 和隔离 app-server 下都能完成，说明“并发必坏”不是当前证据支持的结论。真正需要加固的是状态机：前端没有输出不等于 backend 已经确认死亡。尤其 `processing/heartbeat` 当前只更新 heartbeat / continuation evidence / activity，并不一定刷新 Codex turn progress evidence，导致 UI 观察缺口可能被误判成 hard stalled。

## Goals / Non-Goals

**Goals:**

- 把 Codex foreground turn liveness 拆成 soft suspicion 与 authoritative settlement 两层。
- 扩展 progress evidence，避免“有活动但无文本 delta”被误判为无进展。
- 保留 Stop / backend stalled / runtime ended 的确定性结算。
- 让 late event 可以恢复 soft-suspect，但不能复活 backend-authoritative terminal turn。
- 复用现有 diagnostics，不引入复杂 debug UI。

**Non-Goals:**

- 不重构 app-server 多 turn 并发模型。
- 不改变 provider 请求策略。
- 不做跨 engine 统一 timeout 配置。
- 不把 soft-suspect 设计成用户必须处理的异常弹窗。

## Decisions

### Decision 1: 保留 600 秒 watchdog，但前端 no-progress timeout 只产生 soft suspicion

**Decision**

- 保留 600 秒 no-progress watchdog，继续防止普通 loading 无限转且提供诊断锚点。
- `codex_no_progress_timeout` 若来源仅为 frontend observation，状态语义改为 `suspected-silent` 或等效 recoverable state。
- soft-suspect 不调用 hard quarantine，不 emit terminal external settlement，不清理可继续接收事件的 active turn identity。

**Why**

- 前端只知道“我没看到进展”，不知道 backend / provider 是否仍在运行。
- 当前用户现象具有概率性，且切换会话后可能继续，这更像 liveness evidence gap，而不是确定死亡。
- 完全去掉 watchdog 会恢复无限 loading、active turn 残留和缺少诊断锚点的问题，所以只能改职责，不能删机制。

**Alternative considered**

- 继续 hard stalled：简单但误伤最大。
- 延长 timeout：只能降低概率，不能修正语义错误。

### Decision 2: hard stalled 只接受权威来源

**Decision**

以下来源可以 hard-settle / quarantine：

- backend `turn/stalled` 或等效 stalled settlement
- backend resume-pending timeout
- `turn/error`
- `runtime/ended`
- user Stop 产生的 abandoned / interrupted / failed terminal state

**Why**

- hard settlement 会阻断 late event 对当前 turn 的正常影响，必须建立在更高置信度证据上。
- backend 更接近 runtime 与 process 状态，适合作为“死亡宣判”来源。

**Alternative considered**

- 前后端都可 hard-stall：容易重复结算并产生互相矛盾的诊断。

### Decision 3: progress evidence 不限于文本 delta

**Decision**

Codex progress evidence 至少包括：

- assistant / reasoning / tool output delta
- `processing/heartbeat`
- `thread/status/changed` active / running / processing
- item started / updated / completed
- command / tool / file-change / approval / request-user-input 状态变化
- token usage 或其它 runtime activity marker

**Why**

- 长任务可能只有 heartbeat、tool 状态或 usage 更新，没有 assistant 文本。
- progress evidence 必须表达“runtime 还在动”，而不是只表达“用户看到了新字”。

**Alternative considered**

- 只看 assistant text：最容易误判 silent work。

### Decision 4: late event recovery 只适用于 soft-suspect

**Decision**

- soft-suspect turn 收到身份匹配的 late event 后，自动恢复正常 processing / ingress 语义。
- backend-authoritative stalled / abandoned / runtime-ended 的旧 turn 收到 late event，只记录 diagnostic，不复活。

**Why**

- soft-suspect 本质是“未确认静默”，恢复应当自动。
- hard terminal 本质是已结算，复活会破坏 lifecycle determinism。

**Alternative considered**

- 所有 late event 都恢复：会让用户 Stop 后旧事件复活，破坏可控性。
- 所有 late event 都 quarantine：会保留现有误伤。

### Decision 5: UI 低干扰，不做复杂诊断交互

**Decision**

- soft-suspect 只展示轻量状态文案，例如“长时间未收到输出，仍在监听运行状态...”。
- Stop 继续可用。
- 详细证据进入现有 diagnostics / runtime logs。

**Why**

- 用户已经明确不想做复杂 debug 交互。
- 真正要修的是状态机，而不是让用户背锅判断。

**Alternative considered**

- 新增诊断弹窗或手动探测按钮：排查强，但日常体验重。

## Risks / Trade-offs

- [Risk] 真实死亡 turn 在没有 backend stalled 事件时会更晚暴露
  Mitigation: Stop 始终可用；backend resume-pending / runtime-ended / error 仍会 hard-settle；后续可补 backend health probe。

- [Risk] progress evidence 扩展过宽，可能让已经卡死但持续空 heartbeat 的 turn 保持 soft 活跃
  Mitigation: heartbeat 必须带 runtime generation / thread / turn 相关性；只有匹配当前 active identity 才刷新。

- [Risk] soft-suspect 与现有 stalled UI 状态发生文案冲突
  Mitigation: 类型和 reason code 明确区分 `frontend-no-progress-suspected` 与 `backend-authoritative-stalled`。

- [Risk] late-event recovery 可能重复写入消息
  Mitigation: 继续依赖现有 realtime idempotency / message dedupe；本变更只调整 liveness 判定。

## Migration Plan

1. 在 frontend liveness state 中引入 `suspected-silent` reason 或等效内部 reason code。
2. 将 Codex frontend no-progress timer 改为 soft-suspect path。
3. 收敛 hard quarantine path，只允许 backend authoritative / user stop / runtime terminal 进入。
4. 扩展 `noteCodexTurnProgressEvidence` 调用点，使 heartbeat / status / item update 刷新 no-progress window。
5. 加 tests 覆盖 soft-suspect、late-event recovery、hard-stalled quarantine。
6. 保留当前 Stop 和 backend terminal 行为不变。

**Rollback**

- 如果 soft-suspect 引发 UI 状态回归，可先关闭 soft-suspect copy，仅保持内部不 quarantine。
- 若 progress evidence 某类事件误刷新，可逐项收窄 evidence source，不需要回滚整个 liveness contract。

## Open Questions

- backend 是否已有足够清晰的 `turn/stalled` source 字段；若没有，实施时需要补一个 normalized source，避免与 frontend suspected 混淆。
- 是否需要轻量 `thread/read` / runtime health probe 来主动解除长时间 soft-suspect；本提案允许但不强制。
