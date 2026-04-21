## 0. 代码回写状态（2026-04-21）

- 已按当前代码回写自动化实现状态：runtime recovery guard、结构化 diagnostics、last-good/degraded continuity、debug correlation 与 targeted regression 均已有代码证据。
- 仍缺集成本地桌面 stress 手工记录：`5.2` 继续保持未完成，归档前需要补齐“failure -> reopen/rewind/new thread”链路验证。

## 1. P0 Runtime Recovery Guard

- [x] 1.1 [P0][Input: current `runtime_manager`, `ensure_codex_session`, workspace reconnect flows][Output: shared recovery guard keyed by `workspace + engine` with retry budget, backoff, and quarantine state][Verify: Rust unit tests cover repeated acquire/reconnect failure, budget exhaustion, cooldown entry, and success reset] 在 runtime 层建立统一的 bounded recovery guard。
  - [x] 2026-04-20 implementation slice: `RuntimeManager` 新增 shared recovery guard state（retry budget / quarantine / success reset），并抽出 shared acquire helper，统一处理 quarantine check、concurrent acquire waiter timeout、retry backoff。
- [x] 1.2 [P0][Depends: 1.1][Input: current `send` / `resume` / `new thread` / reconnect entry points][Output: runtime-dependent actions routed through shared recovery guard instead of scattered retry logic][Verify: targeted Rust/frontend regression proves all high-risk entry points consume the same guard state] 将高风险 runtime-dependent action 接入共享恢复守卫。
  - [x] 2026-04-20 implementation slice: `ensure_codex_session`（覆盖 start/resume/send/fork/rewind/list/model/account-rate-limits/thread-compact 等 Codex entry points）与 workspace `connect` 统一改为消费 runtime shared acquire helper，不再各自维护 waiter timeout / quarantine / retry 分支。

## 2. P0 Structured Diagnostics And Lifecycle Exit

- [x] 2.1 [P0][Input: current runtime/session error strings and pseudo-processing exit logic][Output: structured stability diagnostic categories for connectivity drift, partial history, and recovery quarantine, with lifecycle owned by runtime terminal events][Verify: frontend/reducer tests assert recoverable diagnostics surface deterministically without silence-based hard stop] 补齐结构化 stability diagnostics 并清理 pseudo-processing 残留。
  - [x] 2026-04-20 implementation slice: `turn/started` 后新增 20s no-activity watchdog；若无 `delta` / `processing/heartbeat` / item lifecycle / `turn/error` / `turn/completed`，前端主动结束 processing、清空 active turn，并给出 recoverable timeout message，避免 UI 永久卡在 loading。
  - [x] 2026-04-20 hotfix slice: 撤销前端 20s no-activity hard-stop watchdog；不再由前端依据“静默 20 秒”擅自结束 processing / 清空 active turn / 注入失败消息，避免网络抖动或长静默场景误判正常会话。
  - [x] 2026-04-20 implementation slice: 新增 shared `stabilityDiagnostics` helper，统一识别 `connectivity_drift` / `partial_history` / `runtime_quarantined` category；turn error、context compaction failure、history loader fallback/recovery debug payload 统一带 category。
- [x] 2.2 [P0][Depends: 2.1][Input: current thread action / reopen / post-rewind follow-up error handling][Output: recoverable diagnostics visible to user-facing lifecycle surfaces][Verify: regression covers runtime end during turn, reconnect failure, and post-rewind follow-up failure] 让异常恢复链路都能落到统一的用户可见诊断承接。
  - [x] 2026-04-20 implementation slice: Codex `sendUserMessage` 在 `thread not found` / `[SESSION_NOT_FOUND]` stale-thread 场景下先执行一次 `refreshThread -> resend` 自愈，失败后再回落既有 recovery card / error surface。
  - [x] 2026-04-20 implementation slice: runtime reconnect card 扩展支持 `RUNTIME_RECOVERY_QUARANTINED`，并将 `会话失败` / `会话启动失败` / `上下文压缩失败` 等 surface 上的 recoverable runtime error 统一纳入 reconnect/recovery diagnostic 识别。

## 3. P0 Last-Good Continuity For List And History

- [x] 3.1 [P0][Input: current thread list refresh and reopen/history loaders][Output: last-good snapshot fallback with explicit degraded markers][Verify: component/loader tests assert failed refresh keeps prior visible state instead of empty replacement] 为 thread list 和 history/reopen 增加 last-good continuity。
  - [x] 2026-04-20 implementation slice: `useThreadActions` thread-list refresh 失败或 partial source 退化时，优先保留 last-good summaries（state/ref/sidebar snapshot），避免 sidebar 被空列表覆盖；同时 degraded fallback 不再反写 sidebar snapshot，保护最后一次健康快照。
- [x] 3.2 [P0][Depends: 3.1][Input: existing partial source and history reload behavior][Output: degraded copy that explains stale/partial state without masquerading as fresh truth][Verify: UI tests assert degraded banner/copy renders when partial or stale fallback is active] 为 degraded/partial 状态补 explainability copy 与前端承接。
  - [x] 2026-04-20 implementation slice: `ThreadSummary` / `ThreadList` 新增 degraded metadata 与轻量 badge copy；thread list partial / fallback rows 会显式标记为 partial，避免 stale 结果伪装成 fresh truth。

## 4. P1 Evidence Path Hardening

- [x] 4.1 [P1][Input: `runtime_log_*`, renderer diagnostics, `diagnostics.threadSessionLog`][Output: shared correlation fields (`workspaceId`, `engine`, `threadId`, `action`, `recoveryState`) across existing logs][Verify: unit tests or fixture assertions prove the same failure chain can be correlated across runtime and frontend diagnostics] 统一现有 diagnostics 的关联字段。
  - [x] 2026-04-20 implementation slice: 新增 shared `threadDebugCorrelation` helper，thread list fallback/error 与 turn diagnostics 统一携带 `workspaceId / threadId / engine / action / recoveryState`，便于跨 renderer/debug surfaces 关联同一条故障链。
- [x] 4.2 [P1][Depends: 4.1][Input: current runtime-log and debug surfaces][Output: minimal operator path for inspecting one failure chain without new incident store][Verify: manual check can retrieve correlated evidence for one failed workspace/thread scenario] 让已有调试入口可串起一次完整故障证据链。
  - [x] 2026-04-20 implementation slice: `useDebugLog` 扩展镜像 `thread/list*` / `thread/history*` / `workspace/reconnect*` 进入 `diagnostics.threadSessionLog`，无需新增 incident store 即可从现有本地 log 追踪 continuity/recovery 故障链。

## 5. P1 Verification And Stress Validation

- [x] 5.1 [P0][Input: updated runtime, loader, reducer, and diagnostics tests][Output: passing targeted regression suite for recovery guard, degraded continuity, and diagnostics mapping][Verify: `cargo test --manifest-path src-tauri/Cargo.toml`, targeted `vitest` for thread actions/loaders/debug hooks] 跑定向自动化回归。
  - [x] 2026-04-20 implementation slice: targeted `cargo test --manifest-path src-tauri/Cargo.toml recovery_guard` 通过，覆盖 repeated failure quarantine 与 success reset。
  - [x] 2026-04-20 implementation slice: targeted `cargo test --manifest-path src-tauri/Cargo.toml begin_runtime_acquire_or_retry` 通过，覆盖 concurrent acquire waiter release / repeated timeout quarantine。
  - [x] 2026-04-20 implementation slice: targeted `vitest` 覆盖 shared stability diagnostics、runtime quarantine reconnect card、turn no-activity category payload（31 tests passed across 4 files）。
  - [x] 2026-04-20 hotfix slice: targeted `vitest` 移除前端零活动超时硬终止断言，确保 turn lifecycle 重新只依赖 runtime/engine terminal event 收敛。
  - [x] 2026-04-20 implementation slice: targeted `vitest` 覆盖 Codex send path stale-thread auto recovery（`thread not found` / `[SESSION_NOT_FOUND]`）与 optimistic user bubble 去重。
  - [x] 2026-04-20 implementation slice: targeted `vitest` 覆盖 thread list degraded continuity（refresh failure fallback、partial badge、sidebar snapshot 保持 last-good）共 72 tests passed across 3 files；`npm run typecheck` 通过。
  - [x] 2026-04-20 implementation slice: targeted `vitest` 覆盖 thread debug correlation / turn diagnostic correlation fields / `diagnostics.threadSessionLog` continuity mirror（82 tests passed across 6 files）；`npm run typecheck` 再次通过。
- [x] 5.2 [P1][Depends: 5.1][Input: integrated local desktop build][Output: manual proof for “failure -> reopen/rewind/new thread” chain without CPU storm][Verify: 手工验证至少覆盖会话提前结束、reconnect 连续失败、history partial、失败后立即新建对话四类场景] 完成一次本地 stress 验证并记录结果。
