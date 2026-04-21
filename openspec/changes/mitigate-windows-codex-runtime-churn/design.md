## Context

当前仓库已经有两层相关 contract：

1. `runtime-orchestrator` 要求同一 `(engine, workspace)` 只能有一个有效 managed runtime，并且 runtime acquire / replacement 需要可观测、可诊断。
2. `conversation-runtime-stability` 要求 automatic recovery 必须有界，不能形成无界 reconnect / reacquire storm。

但按当前实现看，这两个 contract 还没有完整覆盖 Windows churn 风险：

- 前端 thread list live path 会在 `workspace not connected` 时主动触发 `connectWorkspace` 再重试；
- restore / focus refresh / explicit connect 也可能在相近时间命中同一 workspace；
- backend `ensure_codex_session` 与 `connect_workspace_core` 会在 `3s` health probe 失败后直接把现有 session 视为 stale 并重建；
- thread list live read 还有独立的 `1.5s` timeout，容易把“尚未稳定完成的启动链路”判成“读失败/需补连”；
- Windows 下 `.cmd -> cmd.exe -> bun` 的包装链与 process-tree kill 语义，使一个 runtime replacement 在任务管理器里天然会表现为多进程树短时并存。

因此问题不只是“某个 timeout 太小”，而是**自动恢复入口、启动预算、健康预算、replacement 诊断**没有被同一个 source-aware 状态机收口。macOS 上这个问题较轻，是因为 direct binary / process model 更简单；Windows 上则被 wrapper chain 放大。

这个 change 需要在没有 Win 实机的条件下先定义“什么是允许的自动恢复，什么是必须阻断的 churn”，并要求系统给出可远程验证的证据。

## Goals / Non-Goals

**Goals:**

- 为所有 automatic recovery source 建立统一的 source-aware guarded recovery contract，而不是让每个入口各自重试。
- 区分 `startup pending`、`healthy`、`stale`、`quarantined` 等状态，避免 slow startup 被误判为 stale session。
- 将同一 `(engine, workspace)` 的 replacement 收敛为最多一个 active runtime 加一个 terminating predecessor，阻止第三棵及以上树被继续拉起。
- 为 runtime pool console 和 stability diagnostics 增加 recent churn evidence，使远程 Windows 排障不再依赖猜测。
- 保持 explicit user retry / reconnect 的可恢复路径，不把自动 guard 误做成永久阻断。

**Non-Goals:**

- 不替换现有 Bun / Codex app-server 技术栈。
- 不把所有 engine 的 lifecycle 全部重写成新状态机。
- 不引入新的数据库、独立 incident store 或额外 daemon。
- 不用单纯“把所有 timeout 调大”作为主设计。

## Decisions

### Decision 1: Centralize automatic recovery behind a source-aware recovery guard

自动恢复必须由 backend 统一裁决，而不是让 frontend 每个入口自己决定“是否重连”。本 change 引入一个 source-aware recovery guard，键为 `(engine, workspace)`，并记录当前自动恢复来源、最近失败窗口、是否处于 cooldown/quarantine、是否已有 in-flight acquire。

建议 source 至少区分：

- `thread-list-live`
- `workspace-connect-auto`
- `workspace-restore`
- `focus-refresh`
- `explicit-connect`
- `turn-start`

其中 automatic source 共享同一 bounded budget；explicit user action 不复用已经耗尽的自动 storm loop，而是开启一轮新的 guarded cycle。

这样可以保证：

- 多个 automatic source 同时命中时，最多只有一个 leader 真正发起 acquire / reconnect；
- 其余来源拿到 waiter / cooldown / quarantined 结果，而不是继续 spawn；
- 日志与 diagnostics 能明确“是谁先触发了这轮恢复”。

Alternatives considered:

- 只在前端对 `useThreadActions` 做 debounce：无法覆盖 restore / focus / backend 自身路径，不能形成真实 contract。
- 分散在 `ensure_codex_session`、`connect_workspace_core`、`thread list` 各自做预算：会再次造成规则漂移，后续难排障。

### Decision 2: Split startup budget from health budget

当前 `3s` health probe 与 `1.5s` thread-list live timeout 对 Windows wrapper 链路太激进，但问题不是“数字偏小”本身，而是**启动阶段和稳定运行阶段共用了过于接近的失败语义**。

设计上需要把 runtime lifecycle 至少拆成：

- `starting`: acquire 已开始，但健康探测尚未可裁决
- `ready`: runtime 可正常响应
- `suspect-stale`: 仅在 ready 后的健康探测失败才进入
- `cooldown/quarantined`: automatic recovery budget 已耗尽

在 `starting` 阶段：

- thread-list live timeout 只能把结果标记成 degraded / pending-start，不得直接推动新的 automatic reconnect；
- startup grace window 内的 health miss 不得立刻归类为 stale existing session；
- Windows wrapper runtime 可以拥有 platform-aware startup budget，而无需把 steady-state health timeout 一起放松。

在 `ready` 阶段之后，才允许现有 `probe_health` 语义继续判 stale 并进入 replacement。

Alternatives considered:

- 统一增大所有 timeout：会让真正的 broken pipe / dead runtime 更慢暴露，且影响非 Windows 路径。
- 保持现状，只在 UI 上降级 timeout 文案：并不能减少 spawn/reconnect churn。

### Decision 3: Serialize replacement and cap overlapping process trees

当前 replacement 采用 `new ready -> swap -> kill old`，这本身是正确方向，但在 Windows wrapper 链路下会短时出现多进程树。问题不是“出现两棵树”，而是**后续 automatic source 又继续触发 replacement，导致第三棵、第四棵树堆起来**。

因此设计上要把 replacement 明确成一个可序列化状态：

- 同一 `(engine, workspace)` 允许一个 `active` runtime；
- 当 replacement 发生时，允许一个 `stopping_predecessor`；
- 只要 predecessor 还在 stop path 中，新的 automatic source 必须复用当前 active / pending state，不得再次发起 replacement；
- 若 predecessor stop 超时，仅更新 diagnostics 和 force-kill counters，不再因为 stop 未完成而启动更多 successor。

这样可以把“多 bun 进程”从无界堆积收敛为“有界的 replacement overlap”。

Alternatives considered:

- 改成先 kill old 再起 new：会引入更明显的空窗，且不符合当前 runtime-orchestrator 的 swap safety。
- 完全不允许 overlap：在跨平台上过于理想化，不符合 Windows 包装链的真实行为。

### Decision 4: Persist recent churn evidence in existing runtime diagnostics surfaces

本 change 不新增独立 incident store，而是在现有 runtime snapshot / runtime ledger / diagnostics surfaces 上增加 recent churn evidence。

建议最小证据集合包括：

- `recentSpawnCount`
- `recentReplaceCount`
- `recentForceKillCount`
- `lastRecoverySource`
- `lastReplaceReason`
- `lastProbeFailure`
- `lastProbeFailureSource`
- `lastGuardState`
- `startupState`
- `wrapperKind`
- `resolvedBin`
- `hasStoppingPredecessor`

这些字段需要同时满足两类消费：

1. runtime pool console：解释“为什么现在看到多个 bun / 为什么刚刚发生 replace / 是否有 force kill”
2. stability diagnostics：解释“这次 thread list / reconnect 失败属于 cooldown、quarantine、startup pending 还是 real stale”

Alternatives considered:

- 只在 log 中打字符串：人肉排查成本太高，且无法形成前后端 contract。
- 新建独立诊断存储：超出本次范围，也违背现有 stability spec 的相关性原则。

### Decision 5: Keep last-good list continuity while suppressing reconnect storms

`conversation-runtime-stability` 已经要求 thread list 在 runtime-dependent read failure 时保留 last-good visible snapshot。本次设计延伸这一点：当 thread list 命中 `workspace not connected` 或 live timeout 时，优先走 “保留 last-good + 标记 degraded/pending-start”，而不是立即把 thread list 变成新的 reconnect trigger generator。

这意味着 thread-list path 的行为调整为：

- 如果 recovery guard 返回 `leader`，允许单次 guarded reconnect；
- 如果返回 `waiter`，使用 last-good snapshot 并等待 leader 结果；
- 如果返回 `cooldown/quarantined`，保持当前可见列表，显示结构化 degraded source，而不是继续重试；
- 如果 runtime 处于 `starting`，优先标记 `thread-list-live-timeout` 为 startup-related degraded，而不是 stale reconnect。

Alternatives considered:

- 彻底移除 thread-list 自动补连：虽然最安全，但会回退已有“可自动恢复”的体验。
- 继续当前策略，只依赖 `connectWorkspace` 内部幂等：不够，因为入口本身仍会持续制造压力。

### Decision 6: Validate with synthetic Windows-oriented tests before Win real-machine closure

没有 Win 实机时，这次变更仍然可以通过 synthetic contract tests 获得高置信：

- backend recovery guard tests：覆盖 leader/waiter/cooldown/quarantine、explicit retry reset、replacement serialization；
- runtime manager snapshot tests：覆盖 recent churn evidence 和 `stopping_predecessor`；
- frontend hook tests：覆盖 thread list / restore / focus refresh 在 guard 各状态下的行为；
- Windows-oriented command classification tests：覆盖 `.cmd/.bat` wrapper kind、startup pending 预算分支、tree-kill diagnostics 写回；
- targeted regression tests：确保 macOS/非 Windows 既有 recovery 行为不回退。

真正的 Win 实机验证留到 rollout 阶段，通过新增 diagnostics 让远程协作者能给出足够证据，而不是在本地盲调 timeout。

Alternatives considered:

- 等有 Win 机器再做全部实现：节奏太慢，且当前最缺的是 contract 与 evidence，不是单纯调参。
- 先改默认值再补测试：风险太高，容易在没有证据时把问题藏起来。

## Risks / Trade-offs

- [Risk] source-aware guard 过严，可能让原本可恢复的 automatic reconnect 变得保守。  
  Mitigation: 保留 explicit user retry 的 fresh cycle，并让 automatic source 只进入短时 cooldown 而非永久封禁。

- [Risk] startup budget 分裂后，状态机会更复杂。  
  Mitigation: 只新增最少状态维度：`starting`、`ready`、`suspect-stale`、`cooldown/quarantined`，避免扩成完整新框架。

- [Risk] replacement serialization 如果处理不当，可能让真实 dead runtime 恢复变慢。  
  Mitigation: 只禁止“再次 replacement”，不阻止当前 active successor 继续提供服务；同时保留 predecessor stop timeout 与 force-kill evidence。

- [Risk] diagnostics 字段过多，console 变复杂。  
  Mitigation: 区分 summary counters 与 row-level detail，默认先显示高信号字段，把细节放进 expandable diagnostics。

- [Risk] thread-list continuity 改动可能掩盖真实空列表。  
  Mitigation: 仅在已有 last-good snapshot 时启用 continuity；首次加载失败仍保留明确失败语义，不伪装成空成功。

## Migration Plan

1. 先补 delta specs：
   - `conversation-runtime-stability`
   - `runtime-orchestrator`
   - `runtime-pool-console`
   - 新增 `windows-runtime-churn-diagnostics`
2. backend 先引入 source-aware recovery guard 和 replacement serialization，但先以 diagnostics-first 方式接线，确保 snapshot 可读。
3. 再把 thread list / restore / focus refresh 等自动路径接入新的 guard source，完成 frontend 行为收口。
4. 最后拆分 startup budget 与 health budget，并根据 synthetic tests 固化 Windows 默认预算。
5. rollout 时通过远程 Windows 协作者读取 runtime pool / stability diagnostics，确认是否仍存在高频 replace/spawn/force-kill。

Rollback strategy:

- 若新的 automatic guard 过严，可先保留 diagnostics 字段，回退 automatic source 对 guard 的消费；
- 若 startup budget 划分引发误判，可先恢复原 steady-state health budget，但保留 churn evidence 和 replacement serialization；
- 本 change 不涉及存储 schema 迁移，回滚主要是代码路径和 snapshot 字段兼容回退。

## Open Questions

- Windows startup grace 的默认值应否只按 platform 区分，还是要按 `wrapperKind` 进一步区分？
- recent churn evidence 是否需要跨应用重启短暂保留，还是保持单次 session 内存态即可？
- thread-list degraded 状态是否需要在 UI 上新增专门文案，还是先只进入现有 diagnostics / debug 面板？
