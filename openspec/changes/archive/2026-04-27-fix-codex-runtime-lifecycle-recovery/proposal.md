## Why

Codex managed runtime can currently surface recoverable lifecycle transitions as hard conversation failures: a runtime that is intentionally stopped may still fail an in-flight request with `[RUNTIME_ENDED]`, and a real child exit is often reported only as stdout EOF without enough exit context. Users then see reconnect cards that cannot restore the interrupted turn, even when the underlying app remains healthy.

This needs fixing now because Runtime Pool pinning and long warm TTL create a reasonable expectation that active or retained work will not be interrupted by internal lifecycle churn; the current behavior violates that expectation and makes safe recovery ambiguous.

## 目标与边界

### 目标

- Prevent internal/manual runtime shutdown paths from being misclassified as unexpected turn failures when they are not user-visible interruption of active work.
- Preserve active-turn protection across settings restart, stale-session replacement, Runtime Pool actions, and process-end diagnostics.
- Improve `stdout_eof` diagnostics by correlating pending request state, reason code, and available process exit metadata without changing the public Tauri command surface.
- Keep pinned/runtime retention semantics backward compatible while ensuring pin intent is not lost just because a runtime row is removed or recreated.
- Preserve the existing reconnect card pattern, but make it represent actual recoverable runtime loss rather than every internal shutdown race.

### 边界

- This change is Codex managed-runtime scoped. Claude, Gemini, and OpenCode behavior must not change except through shared frontend diagnostic classification that remains backward compatible.
- The first implementation must be surgical: use existing `ensureRuntimeReady`, runtime manager, ledger, and reconnect-card contracts; do not introduce a daemon, database, or new long-lived IPC service.
- Runtime Pool UI copy can be adjusted only when needed for correctness; no visual redesign.
- Existing settings files, runtime ledger JSON, and thread history must remain readable.
- Multi-client owner locking is acknowledged as a separate hardening axis, but this change only adds compatibility-safe ownership evidence where it directly protects current lifecycle recovery.

## 非目标

- 不重写 Runtime Orchestrator。
- 不把 Runtime Pool Console 改成实时进程监控器。
- 不保证已经被 runtime loss 中断的旧 turn 可以原地复活；恢复动作仍以 reconnect / recover / resend 为主。
- 不新增第三方依赖。
- 不改变 `runtimeRestoreThreadsOnlyOnLaunch`、warm TTL、hot/warm budget 的现有用户配置含义。

## What Changes

- Add lifecycle attribution rules so `manual_shutdown` caused by internal replacement, stale-session cleanup, or settings restart does not become a misleading thread-facing runtime-ended failure unless it actually interrupted foreground work.
- Distinguish user/manual Runtime Pool shutdown from internal replacement shutdown in backend diagnostics.
- Preserve or restore pin intent for a `(engine, workspace)` runtime across row recreation and runtime-ended cleanup.
- Improve child-exit reporting so stdout EOF can be paired with process status when available, avoiding overuse of the generic “stdout closed before terminal lifecycle” message.
- Keep pending request settlement deterministic: every pending request must resolve, but expected internal shutdown should settle with a recoverable/retryable lifecycle outcome instead of a raw hard failure.
- Add targeted tests for:
  - manual shutdown with no affected active turn does not create a reconnect-card turn error;
  - active turn runtime loss still produces runtime-ended recovery;
  - pinned intent survives runtime removal/recreation;
  - stdout EOF can include process exit metadata when the process status is available.

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 大重构：引入跨进程 owner lock、heartbeat、single-writer ledger | 能系统性解决多客户端互杀 | 改动面大，容易影响启动、退出、设置、Runtime Pool 全链路 | 不作为第一刀 |
| B | 前端隐藏所有 `[RUNTIME_ENDED] manual_shutdown` reconnect card | 快速缓解误报 | 会吞掉真实 active turn 被用户关闭/释放的错误，后端 pending 语义仍脏 | 不采用 |
| C | 后端区分 shutdown source，并只把真正影响 foreground work 的 runtime loss 投递到线程；前端保持兼容分类 | 改动面小，语义根治，兼容现有 UI | 需要补足 runtime end context 与测试 | **采用** |
| D | 只延长 TTL / 强制 pin runtime | 减少部分 idle eviction | 无法处理 settings restart、stale probe、process exit、manual shutdown | 不采用 |
| E | 在 stdout EOF 后短暂等待 process status，增强诊断 | 降低 generic EOF 误报，帮助定位真实退出 | 需要避免阻塞 reader 任务太久 | **作为 C 的补充采用** |

## Capabilities

### New Capabilities

- 无。此变更收敛在现有 conversation/runtime 能力内。

### Modified Capabilities

- `conversation-runtime-stability`: refine runtime-ended diagnostics and reconnect-card eligibility for managed Codex lifecycle transitions.
- `runtime-orchestrator`: refine managed shutdown attribution, pin-intent persistence, and active-work protection across replacement and cleanup paths.
- `codex-long-task-runtime-protection`: clarify that active Codex work must not be interrupted by retention/replacement cleanup without deterministic fallback.
- `runtime-pool-console`: clarify that Runtime Pool manual interventions must distinguish idle release from active foreground interruption.

## 验收标准

- A Codex runtime stopped by internal replacement or stale-session cleanup with no affected active turn MUST NOT append a misleading runtime-ended reconnect card to the current conversation.
- A Codex runtime stopped while an active turn or pending foreground request exists MUST still settle the affected thread with a structured recoverable runtime-ended diagnostic.
- `manual_shutdown` diagnostics MUST preserve enough source context to distinguish user-requested close/release, settings restart, replacement cleanup, and stale probe cleanup.
- `stdout_eof` diagnostics MUST include process exit code/signal when the status is available within a bounded wait.
- Runtime pin intent for a workspace MUST survive managed runtime removal and recreation.
- Existing reconnect / recover / resend UI contracts MUST continue to work for true runtime-ended, broken pipe, workspace-not-connected, and thread-not-found diagnostics.
- Existing settings and runtime ledger files MUST remain backward compatible.

## Impact

- Backend:
  - `src-tauri/src/backend/app_server_runtime_lifecycle.rs`
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/runtime/session_lifecycle.rs`
  - `src-tauri/src/codex/session_runtime.rs`
- Frontend:
  - `src/features/threads/utils/stabilityDiagnostics.ts`
  - `src/features/messages/components/RuntimeReconnectCard.tsx` only if backend cannot fully suppress misleading diagnostics.
- Tests:
  - Rust runtime/session lifecycle tests.
  - Focused Vitest tests for reconnect-card classification if frontend classification changes.
- Dependencies:
  - No new dependencies.
