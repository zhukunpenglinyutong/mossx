## 1. Guard And Storm Stop

- [x] 1.1 在 runtime/orchestrator 层引入 `workspace + engine` 级 source-aware recovery guard 状态 `[P0][依赖: 无][输入: 现有 acquire/reconnect 流程与自动恢复入口枚举][输出: leader/waiter/cooldown/quarantine 的统一 guard 数据结构][验证: Rust 单测覆盖 automatic source 并发命中时只产生一个 leader]`
- [x] 1.2 将 `ensure_codex_session` 与 `connect_workspace_core` 接入统一 guard，而不是各自独立重试 `[P0][依赖: 1.1][输入: `src-tauri/src/codex/session_runtime.rs`、`src-tauri/src/shared/workspaces_core.rs`][输出: backend recovery 统一走 source-aware guard][验证: 同一 workspace 的重复自动恢复不再并行 spawn]`
- [x] 1.3 为 explicit reconnect / retry 保留 fresh guarded cycle，不复用已耗尽的 automatic storm loop `[P0][依赖: 1.1][输入: explicit connect/retry 入口与 guard 状态][输出: 用户主动重试可重新开启 bounded recovery][验证: cooldown/quarantine 后 explicit retry 仍可恢复]`

## 2. Startup Versus Stale Split

- [x] 2.1 拆分 `startup pending` 与 `post-ready stale` 判定语义 `[P0][依赖: 1.2][输入: health probe、thread-list live timeout、runtime ready 时机][输出: startup budget 与 health budget 分离的状态契约][验证: synthetic tests 能区分启动慢与真正 stale probe]`
- [x] 2.2 收紧 thread-list live timeout 的升级路径，startup pending 时只降级不触发第二次 automatic reconnect `[P0][依赖: 2.1][输入: `src/features/threads/hooks/useThreadActions.ts` 与 backend list path][输出: thread list 保留 last-good 且不会制造 nested reconnect][验证: Vitest 覆盖 waiter/pending-start/cooldown 场景]`

## 3. Replacement Serialization

- [x] 3.1 序列化 replacement，限制同一 `(engine, workspace)` 至多一个 active successor + 一个 stopping predecessor `[P0][依赖: 1.2, 2.1][输入: `src-tauri/src/runtime/mod.rs` replacement / terminate 路径][输出: bounded replacement overlap 与 stopping predecessor 状态][验证: Rust 单测覆盖 replacement 期间不会启动第三棵 runtime 树]`

## 4. Diagnostics First

- [x] 4.1 在 runtime snapshot / diagnostics 中增加 recent churn evidence 字段 `[P0][依赖: 1.1, 3.1][输入: runtime row、runtime ledger、guard 事件][输出: `recentSpawnCount`、`recentReplaceCount`、`recentForceKillCount`、`lastRecoverySource`、`lastReplaceReason` 等字段][验证: snapshot contract tests 与 diagnostics 断言通过]`
- [x] 4.2 新增 `windows-runtime-churn-diagnostics` capability 对应的 backend evidence 写入路径 `[P0][依赖: 4.1, 2.1][输入: Windows wrapper kind、probe failure、startup state、replacement events][输出: 可远程归因的 Windows churn evidence][验证: Rust 单测覆盖 startup-related degraded 与 stale-session suspicion 的区别]`

## 5. Automatic Source Integration

- [x] 5.1 将 thread list、workspace restore、focus refresh、implicit reconnect 全部接入 source-aware guard source 分类 `[P0][依赖: 1.1, 2.2, 4.2][输入: `useThreadActions`、`useWorkspaceRestore`、`useWorkspaceRefreshOnFocus` 等入口][输出: automatic source 不再各自独立重试][验证: Vitest 覆盖多入口同时命中只产生一轮 guarded recovery]`
- [x] 5.2 保持 explicit user-visible continuity：guard waiter / cooldown / startup pending 时保留 last-good snapshot 并输出结构化 degraded source `[P1][依赖: 5.1][输入: thread list continuity 逻辑与 diagnostics helper][输出: UI 不清空列表且可解释当前为何未再次重连][验证: thread-list continuity tests 通过]`

## 6. Console And UI Completion

- [x] 6.1 扩展 Runtime Pool Console 与 stability diagnostics 消费新证据 `[P1][依赖: 4.1, 4.2][输入: runtime snapshot 新字段与现有 console/stability UI][输出: console 可展示 startup state、recent churn counters、stopping predecessor、last recovery source][验证: 前端组件测试与 typecheck 通过]`

## 7. Verification And Apply Readiness

- [x] 7.1 补齐 backend synthetic regression：guard leader/waiter、cooldown/quarantine、startup-vs-stale、replacement serialization、bounded churn counters `[P0][依赖: 1.1-4.2][输入: 新 backend/runtime 路径][输出: 高置信无 Win 实机回归集][验证: `cargo test --manifest-path src-tauri/Cargo.toml` 定向用例通过]`
- [x] 7.2 补齐 frontend regression：thread list guard behavior、restore/focus source dedup、console diagnostics rendering `[P0][依赖: 5.2, 6.1][输入: 更新后的 hook/UI contract][输出: 可验证的前端 guarded recovery 回归集][验证: 相关 `vitest run` 套件通过]`
- [x] 7.3 执行 OpenSpec 与质量门禁，确认 change 进入 apply-ready 状态 `[P0][依赖: 7.1, 7.2][输入: proposal/design/specs/tasks 与实现前验证矩阵][输出: 可执行 change，无 schema 漏项][验证: `openspec validate mitigate-windows-codex-runtime-churn --strict`、`npm run typecheck`、目标测试命令通过]`
