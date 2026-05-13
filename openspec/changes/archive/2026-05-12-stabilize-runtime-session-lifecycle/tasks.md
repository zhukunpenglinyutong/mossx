## 1. Contract And Inventory

- [x] 0.1 [P0][depends:none][I: `openspec/docs/client-stability-conversation-implementation-readiness-2026-05-11.md`][O: implementation ownership matrix copied or referenced in task notes][V: Runtime / Conversation / Composer truth ownership has no conflict before coding] 冻结跨 change ownership matrix，确认 Runtime 只负责 lifecycle truth 与 diagnostics，不承担 conversation fact 或 Composer projection。
- [x] 1.1 [P0][depends:none][I: 现有 runtime/session/stale recovery 代码与 specs][O: lifecycle state table + transition source 清单][V: design review 确认状态、触发源、用户可见状态无冲突] 梳理 `workspace + engine` lifecycle 状态机。
- [x] 1.2 [P0][depends:1.1][I: 现有 diagnostics 与 stabilityDiagnostics][O: reasonCode / recoverySource / userAction 字段表][V: 覆盖 runtime-ended、manual-shutdown、stale-thread-binding、web-service-reconnected 等核心场景] 定义 diagnostics 分类契约。
- [x] 1.3 [P0][depends:1.1][I: 现有 runtime helper 调用点][O: create / replace / stop / terminate / recover 调用矩阵][V: 确认不改外部 Tauri command contract] 标记需要接入 coordinator 的入口。

## 2. Runtime Lifecycle Coordinator

- [x] 2.1 [P0][depends:1.1,1.3][I: `src-tauri/src/runtime/session_lifecycle.rs` 与 runtime pool][O: lifecycle coordinator 内部实现][V: Rust tests 覆盖合法/非法 transition] 收敛 acquire / replace / stop / terminate / recover / quarantine。（2026-05-12 implementation：新增 `RuntimeLifecycleCoordinator` facade，统一 acquire / active / stop / recover / quarantine probe 入口；replace/terminate 仍复用现有 process termination helper，不改外部 Tauri contract。）
- [x] 2.2 [P0][depends:2.1][I: runtime generation 与 process diagnostics][O: late event generation guard][V: Rust tests 断言旧 runtime end/completion 不污染新 active session] 增加 runtime generation 边界。
- [x] 2.3 [P1][depends:2.1][I: existing runtime diagnostics][O: transition diagnostics evidence][V: diagnostics surface 可查 workspaceId、engine、transition、reasonCode] 输出可关联 lifecycle evidence。

## 3. Codex Create/Shutdown Race

- [x] 3.1 [P0][depends:2.1][I: `src-tauri/src/codex/session_runtime.rs`][O: create while stopping 的 classified recovery path][V: Rust tests 覆盖 manual shutdown 后 create 不复用旧 runtime] 修复 create/shutdown race。（2026-05-12 implementation：`start_thread` stopping race 在 bounded retry 前先走 coordinator quarantine probe；主路径和 hook-safe fallback 均覆盖，probe 阻断时不再发起第二次 `thread/start`。）
- [x] 3.2 [P0][depends:3.1][I: Codex probe / stale reuse cleanup][O: `probe-failed`、`already-stopping`、`runtime-ended` 分类][V: Rust tests 断言错误分类与 retryable 字段] 拆分 Codex stale probe 诊断。
- [x] 3.3 [P0][depends:3.1,2.2][I: replacement result 与 active work signal][O: replacement late event 过滤][V: Rust tests 断言旧 completion/end event 不结束新 turn] 防止 replacement 污染新 session。

## 4. Stale Thread Binding Recovery

- [x] 4.1 [P0][depends:1.2,3.1][I: `useThreadActions*`、`useThreadMessaging`、`stabilityDiagnostics`][O: stale error classifier + recoverability decision][V: Vitest 覆盖 thread-not-found、session-not-found、broken-pipe、runtime-ended] 收敛 frontend stale recovery 分类。（2026-05-12 implementation：新增 `classifyStaleThreadRecovery`，输出 `reasonCode / staleReason / retryable / userAction / recommendedOutcome`，并接入 `useThreadMessaging` retry/debug/notice。）
- [x] 4.2 [P0][depends:4.1][I: threadStorage durable activity facts][O: durable-safe rebind / fresh fallback guard][V: existing recovery/runtime reconnect tests 覆盖 fresh fallback 不伪装 recovered session] 实现 conservative rebind 边界。（2026-05-12 implementation：manual recover-only 默认禁止 fresh fallback；只有 recover-and-resend 显式传入 `allowFreshThread: true` 才会新建会话，避免 durable stale thread 被静默替换。）
- [x] 4.3 [P0][depends:4.2][I: recover-only / recover-and-resend flows][O: `rebound / fresh / failed` classified outcome][V: RuntimeReconnect tests 覆盖 recover-only / recover-and-resend 表达] 收敛 stale recovery 用户动作结果。（2026-05-12 implementation：`ManualThreadRecoveryResult` / `RuntimeReconnectRecoveryResult` 输出 `kind`，manual result 额外带 `retryable` 与 `userAction`，UI 按 `rebound / fresh / failed` 展示恢复结果。）
- [x] 4.4 [P1][depends:4.3][I: queued send / resume retry path][O: automatic recovery retry-at-most-once][V: useThreadActions recovery guard tests 覆盖恢复成功重试一次、失败不进入 retry storm] 限制自动恢复 retry。（2026-05-12 implementation：`useThreadMessaging` 继续通过 `codexInvalidThreadRetryAttempted` 保持 at-most-once，分类后的 stale/runtime error 不新增循环入口。）

## 5. WebService Reconnect Refresh

- [x] 5.1 [P0][depends:2.1][I: daemon WebService reconnect event][O: `web-service-reconnected` lifecycle source][V: targeted test 证明 reconnect 触发 refresh evidence] 将 WebService reconnect 纳入 lifecycle。
- [x] 5.2 [P0][depends:5.1][I: thread list、active thread、runtime panel refresh paths][O: reconnect 后 snapshot reconcile][V: Vitest 覆盖 thread list / active processing thread refresh，Rust test 覆盖 runtime evidence] 补齐 reconnect refresh。
- [x] 5.3 [P1][depends:5.2][I: diagnostics surface][O: reconnect source evidence][V: diagnostics 中可见 recoverySource=web-service-reconnected] 输出可诊断来源。

## 6. User-Facing Diagnostics

- [x] 6.1 [P0][depends:1.2,4.1][I: thread recovery toast / inline notice][O: recoverable create-session 和 stale thread 的可行动入口][V: Vitest 覆盖 reconnect-and-retry、recover-only、recover-and-resend] 接入用户可见恢复动作。（2026-05-12 implementation：复用 `RuntimeReconnectCard` inline action，覆盖 reconnect-and-retry、recover-only、recover-and-resend；`session-not-found` 也进入 stale thread recovery action，而非普通 runtime reconnect。）
- [x] 6.2 [P1][depends:6.1][I: status panel / runtime console][O: lifecycle state 展示][V: RuntimePoolSection 已消费 lifecycle fields，typecheck 保证 contract] 展示最小 lifecycle 状态。
- [x] 6.3 [P1][depends:6.1][I: error copy][O: reasonCode -> 用户动作映射][V: diagnostics reasonCode / userAction tests 确认可操作且不暴露 raw internal noise] 收敛错误文案。（2026-05-12 implementation：runtime notice 增加 `reasonCode / userAction / actionHint` 参数，classified runtime-ended 显示 reconnect 建议。）

## 7. Verification

- [x] 7.1 [P0][depends:2.2,3.3][I: Rust runtime/codex modules][O: Rust targeted tests][V: `cargo test --manifest-path src-tauri/Cargo.toml runtime::tests` and `cargo test --manifest-path src-tauri/Cargo.toml runtime::recovery_tests` pass] 跑后端 targeted tests。
- [x] 7.2 [P0][depends:4.4,6.1][I: frontend thread hooks/utils][O: Vitest targeted tests][V: `pnpm vitest run` 相关 stale recovery / stabilityDiagnostics / useThreadMessaging tests 通过] 跑前端 stale recovery targeted tests。（2026-05-12 implementation：`stabilityDiagnostics`、`globalRuntimeNotices`、`useThreadMessaging` targeted Vitest 已通过；dedicated recovery UI 已由 6.1 覆盖。）
- [x] 7.3 [P1][depends:5.2,6.2][I: desktop app manual matrix][O: code-level verification matrix][V: Rust/Vitest 覆盖 WebService reconnect、runtime generation、quarantine reconnect action 的可验证核心路径] 执行最小代码级验证矩阵。
- [x] 7.4 [P1][depends:7.1,7.2][I: 项目质量门禁][O: 回归结果][V: `npm run typecheck`、`npm run check:large-files:gate`、受影响测试通过] 执行基础质量门禁。
