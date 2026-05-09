# Backend Quality Guidelines

## 必须遵守（Must）

- command 行为可预测（deterministic）且具备 clear error path。
- 共享状态访问遵循 `AppState` 锁策略。
- 文件写入遵循 lock + atomic write 模式。
- 关键行为变更同步更新 frontend mapping/tests。

## 禁止项（Never）

- runtime path 使用 `unwrap/expect`。
- 新增 command 但遗漏 `command_registry.rs` 注册。
- 命令参数改名后不更新 `src/services/tauri.ts`。
- 破坏幂等性导致 retry 重放污染。

## 推荐验证命令

```bash
npm run check:runtime-contracts
npm run doctor:strict
npm run test
npm run typecheck
```

必要时补充 Rust 侧测试：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Review Checklist

- command contract 是否与 frontend 一致？
- 锁粒度是否合理？是否存在锁内重 IO？
- 错误信息是否可追踪且无敏感泄露？
- 是否有回归测试覆盖新增/修改路径？

## Scenario: Engine control-plane isolation for Codex app-server

### 1. Scope / Trigger

- Trigger：修改 Codex binary resolution、`WorkspaceSession` spawn、Codex doctor、Claude history scanner/loader，或任何跨 engine runtime launch path。
- 目标：Codex app-server 控制面 payload 只能进入真实 Codex runtime，不能 fallback 到 Claude CLI 或污染 Claude transcript。

### 2. Signatures

- `resolve_codex_launch_context(codex_bin: Option<&str>) -> CodexLaunchContext`
- `check_codex_installation(codex_bin: Option<String>) -> Result<Option<String>, String>`
- `probe_codex_app_server(codex_bin: Option<String>, codex_args: Option<&str>) -> Result<CodexAppServerProbeStatus, String>`
- `spawn_workspace_session_with_auto_compaction_threshold(...) -> Result<Arc<WorkspaceSession>, String>`
- `list_claude_sessions_from_base_dir(...) -> Result<Vec<ClaudeSessionSummary>, String>`
- `load_claude_session_from_base_dir(...) -> Result<ClaudeSessionLoadResult, String>`

### 3. Contracts

- Codex launch resolution MUST only resolve `codex` or explicit custom Codex binary; it MUST NOT resolve or fallback to `claude`.
- Codex session spawn MUST fail before process launch unless `codex app-server --help` capability probe succeeds for the resolved binary and args.
- Windows `.cmd/.bat` compatibility retry MAY run only after the same Codex capability gate path and MUST NOT convert a Claude wrapper into a Codex runtime.
- Codex missing/custom mismatch errors MUST be Codex-specific and MUST NOT recommend installing Claude as a substitute.
- Claude history scanner/load path MUST filter high-confidence control-plane entries before counting messages, deriving first message, or returning loaded messages.
- The control-plane predicate MUST use structured signals such as JSON-RPC `initialize`, `clientInfo.name/title=ccgui` + `capabilities.experimentalApi`, `developer_instructions`, and pure Codex app-server invocation text. It MUST NOT filter normal user text merely because it mentions `app-server`.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| Codex missing, Claude installed | return Codex-specific missing/capability error | start `claude app-server` |
| custom Codex bin points to Claude | fail `app-server --help` capability gate | accept `--version` as identity proof |
| Windows Codex wrapper primary launch fails | allow wrapper retry only for Codex-capable wrapper | retry arbitrary non-Codex wrapper |
| Claude JSONL only has control-plane payload | no visible session summary | create `app-server` / `developer` pseudo session |
| Claude JSONL mixes real messages and control-plane payload | drop pollution and keep real messages | drop whole transcript or count pollution |
| User asks about app-server in natural language | keep the message | keyword-only filtering |

### 5. Good / Base / Bad Cases

- Good：`check_codex_installation()` validates Codex presence, then `probe_codex_app_server()` gates spawn before `initialize` is sent.
- Base：real Codex proxy that supports `codex app-server --help` may be accepted.
- Bad：`find_cli_binary("codex").or_else(|| find_cli_binary("claude"))` or using `--version` text as the only identity gate.

### 6. Tests Required

- Rust tests for no Codex-to-Claude fallback and Codex-specific missing error text.
- Rust tests for wrapper eligibility and `app-server` arg construction.
- Rust tests for control-plane-only Claude transcript not producing a session.
- Rust tests for mixed Claude transcript preserving real user/assistant messages.
- Rust tests proving normal user text containing `app-server` is not filtered.
- Frontend Vitest coverage for the matching loader fallback predicate.

### 7. Wrong vs Correct

#### Wrong

```rust
find_cli_binary("codex", None)
    .or_else(|| find_cli_binary("claude", None))
```

#### Correct

```rust
let _ = check_codex_installation(codex_bin.clone()).await?;
let probe_status = probe_codex_app_server(codex_bin.clone(), codex_args.as_deref()).await?;
if !probe_status.ok {
    return Err("Codex CLI is not app-server capable".to_string());
}
```

## Scenario: Codex managed runtime shutdown attribution

### 1. Scope / Trigger

- Trigger：修改 `WorkspaceSession` shutdown、`runtime/session_lifecycle.rs` stop/replacement/eviction、Codex stale-session cleanup、`runtime/ended` event、Runtime Pool pin/remove/recreate 逻辑。
- 目标：避免 internal cleanup 被误报成用户可见 turn loss，同时保留 active foreground work 的 recoverable runtime-ended path。

### 2. Signatures

- `RuntimeShutdownSource::{UserManualShutdown, ManualRelease, InternalReplacement, StaleReuseCleanup, SettingsRestart, AppExit, IdleEviction, CompatibilityManual}`
- `WorkspaceSession::mark_shutdown_requested(source: RuntimeShutdownSource)`
- `WorkspaceSession::mark_shutdown_had_active_work_protection()`
- `RuntimeManager::has_active_work_protection_for_session(engine: &str, workspace_id: &str, session_pid: Option<u32>) -> bool`
- `RuntimeManager::record_runtime_ended_for_session(..., session_pid: Option<u32>, record: RuntimeEndedRecord) -> bool`
- `stop_workspace_session_with_source(..., shutdown_source: RuntimeShutdownSource)`
- `terminate_workspace_session_with_source(..., shutdown_source: RuntimeShutdownSource)`

### 3. Contracts

- Stop path MUST mark shutdown source before process termination begins.
- `runtime/ended` MUST settle pending/timed-out requests even when event emission is suppressed.
- `runtime/ended` app-server event MUST be emitted only when affected work exists: active turns, pending requests, timed-out requests, background callbacks, or active-work protection captured before `record_stopping()`.
- A stale predecessor runtime end MUST NOT overwrite a newer successor runtime row or borrow the successor's active-work signal; runtime-ended row mutation and active-work visibility checks must be guarded by session identity such as process id.
- Internal replacement/stale cleanup/settings/app-exit/idle eviction with no affected work MUST remain diagnostics-only and MUST NOT create a reconnect-card event.
- Runtime Pool `pin` intent MUST survive row removal/recreation; row lifecycle MUST NOT be the only source of pin truth.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| internal replacement stop + no affected work | record runtime diagnostics, suppress `runtime/ended` event | append reconnect card to current conversation |
| manual release/close + pending request | settle request and emit `runtime/ended` with `shutdownSource` | silently drop pending request |
| active-work protection exists before stop | mark session active-work evidence before `record_stopping()` clears runtime row protection | check protection only after cleanup and lose evidence |
| predecessor exits after successor ready | preserve successor row and only record global diagnostics | write old exit into successor row |
| pinned runtime row removed | recreate row as pinned | lose pin because old row was deleted |

### 5. Good / Base / Bad Cases

- Good：`terminate_workspace_session_with_source(session, manager, RuntimeShutdownSource::ManualRelease)` records source and active-work marker before `record_stopping()`.
- Base：legacy cleanup can call `terminate_workspace_session(...)`, which maps to `CompatibilityManual` for backward compatibility.
- Bad：calling `session.mark_manual_shutdown()` or relying on generic `manual_shutdown_requested` for new stop paths.

### 6. Tests Required

- Rust tests for no-work internal cleanup suppressing app-server `runtime/ended`.
- Rust tests for pending/foreground work still emitting recoverable `runtime/ended` with `shutdownSource`.
- Runtime manager tests for pin -> remove -> recreate -> still pinned, and unpin -> recreate -> not pinned.
- `cargo test --manifest-path src-tauri/Cargo.toml --no-run` after touching shared runtime lifecycle code.

### 7. Wrong vs Correct

#### Wrong

```rust
session.mark_manual_shutdown();
runtime_manager.record_stopping("codex", &workspace_id).await;
```

#### Correct

```rust
session.mark_shutdown_requested(RuntimeShutdownSource::ManualRelease);
if runtime_manager
    .has_active_work_protection_for_session("codex", &workspace_id, session.process_id)
    .await
{
    session.mark_shutdown_had_active_work_protection();
}
runtime_manager.record_stopping("codex", &workspace_id).await;
```
