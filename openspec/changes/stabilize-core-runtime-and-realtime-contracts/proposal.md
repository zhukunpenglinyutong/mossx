## Why

当前 `mossx` 的主干稳定性集中压在三条高风险链路上：

1. `AppShell` 总编排层
2. realtime engine event streaming
3. managed runtime lifecycle

这三条链路已经有大量 defensive code 和测试，但边界仍然偏软：

- `src/app-shell.tsx` 仍使用 `// @ts-nocheck`，主入口类型保护被关闭。
- realtime event 从 Rust 到 frontend 需要经过多层动态 payload 与 legacy alias 解析。
- runtime lifecycle 同时处理 acquire、replace、recover、quarantine、foreground lease、late event、manual release 等状态，复杂度高且回归影响大。

随着 Claude / Codex / Gemini / OpenCode、多窗口、WebService daemon、Spec/OpenSpec workflow 继续扩展，这些软边界会让 bug 表现为难复现的灰故障：streaming 丢消息、重复消息、processing 卡住、runtime 已死但 UI 仍认为活着、旧 runtime event 污染新 session、workspace/thread 状态错位。

本变更的目标不是“大重写”，而是把核心链路变成可验证、可演进、可回滚的硬契约。

中文一句话：这次重构要先给主干打钢筋，再谈继续加功能。

## Priority Calibration / 优先级校准

本提案同时纳入 P0 与少量 P1，但二者角色不同：

- P0 是本次交付主体，必须形成代码、测试与验收证据。
- P1 是护栏和准入条件，只有在 P0 触碰对应边界时才落到代码实现；否则保持为 checklist、validation 或 follow-up backlog。

| Priority | Included Area | Why Included | If Not Fixed | If Fixed |
|---|---|---|---|---|
| P0 | realtime event contract | 直接影响 streaming 可见内容与 turn settlement | 继续出现丢 delta、重复消息、processing 卡住、旧 alias 随机生效 | canonical event path 可测，legacy alias 变成受控兼容输入 |
| P0 | runtime lifecycle | 直接影响 runtime 是否可用、是否误恢复、是否污染新 session | 用户会看到 runtime 已死但 UI 仍活着、旧 process 事件污染新 turn、quarantine/retry 不可解释 | lifecycle 变成 scenario matrix，late predecessor event 被隔离 |
| P0 | AppShell boundary typing | 主入口仍 `ts-nocheck`，任何 feature callback drift 都可能静默进主干 | 类型债继续集中在最关键 hub，后续功能越加越脆 | 先恢复边界类型，降低后续拆分风险 |
| P1 | Tauri bridge guardrail | P0 链路穿过 Rust/frontend bridge | command payload 或 facade drift 会把 P0 修复变成跨层回归 | touched commands 有 checklist，保持 command/import/error compatibility |
| P1 | heavy test noise | 本变更会增加 runtime/realtime 测试 | 新测试若刷屏，会掩盖真正失败信号 | 失败输出低噪，CI 三端保持可诊断 |
| P1 | large-file governance | AppShell 抽取和 fixture 增长有天然膨胀风险 | 可能把一个 hub 拆成另一个 hub，技术债换地方 | 按责任拆分，near-threshold 文件有证据或 follow-up |
| P1 | Win/mac/Linux compatibility | runtime/process/path/test 是跨平台高风险区 | 单平台通过但 CI 或用户端三端行为分裂 | 编码时主动使用平台安全 API，并记录缺口 |

提案边界：P1 不等于“这次顺手把 P1 全做完”。本次只把会保护 P0 的 P1 guardrails 纳入硬约束。

## What Changes

- Harden realtime event contract:
  - `EngineEvent`
  - `AppServerEvent`
  - `NormalizedThreadEvent`
  - reducer actions / visible conversation state
- Add scenario-level runtime lifecycle verification:
  - acquire
  - active
  - replacing
  - recovering
  - quarantined
  - ended
  - late predecessor events
  - active foreground work protection
- Gradually type AppShell orchestration boundaries:
  - workspace selection/actions
  - composer/search
  - runtime/thread
- Add P1 bridge guardrails:
  - future Tauri command changes must preserve command names, payload fields, response semantics, and frontend facade compatibility.
- Add explicit engineering constraints for:
  - Windows / macOS / Linux compatibility
  - Heavy Test Noise Sentry
  - Large File Governance Sentry

## Scope

### In Scope

- Define canonical realtime event matrix and keep legacy aliases as compatibility input.
- Add or extend contract tests for core streaming semantics:
  - assistant text delta
  - reasoning delta
  - tool output delta
  - turn started / completed / error
  - processing heartbeat
  - token usage update
- Add runtime lifecycle scenario tests:
  - fresh acquire succeeds
  - startup failure enters recovery
  - repeated recovery failure enters quarantine
  - explicit retry exits quarantine through bounded recovery
  - replacement ignores late old-runtime events
  - runtime ended while active turn is protected
  - interrupt and manual release do not leak stale leases
- Extract typed AppShell boundary objects without changing visible UI.
- Document and enforce bridge contract checklist for changed Tauri commands.
- Keep CI governance checks in scope:
  - heavy test noise
  - large-file near-threshold watch
  - large-file hard gate
- Audit touched code for platform-safe behavior on Windows, macOS, and Linux.

### Out of Scope

- Full UI redesign.
- Full AppShell rewrite.
- Memory capture policy redesign.
- Git / worktree behavior redesign.
- Removing all legacy realtime aliases.
- Splitting the entire command registry.
- Large-file mechanical cleanup unrelated to the touched P0/P1 boundaries.
- OpenSpec workspace-wide spec cleanup.

## Engineering Constraints

### Cross-Platform Compatibility / 跨平台兼容

本次重构 MUST 主动考虑 Windows / macOS / Linux 三端兼容性：

- Path handling MUST use platform-safe APIs instead of hard-coded `/` or `\\`.
- Node scripts and tests touched by this change MUST run on `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- Rust runtime/process/session code MUST avoid Unix-only assumptions unless guarded by explicit `cfg`.
- Fixtures MUST avoid single-platform newline, path, shell quoting, or case-sensitivity assumptions.
- UI shell behavior MUST NOT assume macOS titlebar/window behavior applies to Windows/Linux.

### Heavy Test Noise Sentry

Refers to:

- `.github/workflows/heavy-test-noise-sentry.yml`

This workflow runs on:

- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

When this change adds or modifies runtime/realtime/AppShell/bridge tests or test logging, it MUST keep the following checks passing:

```bash
node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
npm run check:heavy-test-noise
```

Meaning:

- New runtime/realtime tests MUST NOT create noisy stdout/stderr dumps.
- Expected error-path logs MUST be asserted or locally muted.
- Failure output MUST remain diagnosable and low-noise.

### Large File Governance Sentry

Refers to:

- `.github/workflows/large-file-governance.yml`

This workflow runs on:

- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

When this change grows or extracts source, style, fixture, or test files, it MUST keep the following checks passing:

```bash
node --test scripts/check-large-files.test.mjs
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

Meaning:

- AppShell typing and extraction MUST NOT create replacement hub files.
- Contract fixtures and tests MUST be modularized by responsibility.
- New or touched near-threshold files MUST have explicit justification or be split further.

## Impact

- Frontend:
  - `src/app-shell.tsx`
  - `src/app-shell-parts/**`
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/contracts/**`
  - `src/features/threads/adapters/**`
  - `src/features/threads/hooks/useThreadsReducer*`
  - `src/services/tauri.ts`
- Backend:
  - `src-tauri/src/engine/events.rs`
  - `src-tauri/src/backend/events.rs`
  - `src-tauri/src/runtime/**`
  - `src-tauri/src/backend/app_server*.rs`
  - `src-tauri/src/command_registry.rs`
- CI / Governance:
  - heavy test noise sentry remains mandatory for noisy test changes.
  - large-file governance sentry remains mandatory for source/style/test growth.
  - architecture CI gates remain explicit.

## Risks

- Tightening event contracts may expose existing payload inconsistencies.
- AppShell typing may reveal hidden type debt currently masked by `ts-nocheck`.
- Runtime lifecycle tests may reveal behavior that needs small production fixes.
- Removing legacy event aliases too early could break old sessions or daemon fallback.
- A broad refactor could create new large-file hubs if extraction boundaries are not kept cohesive.

## Migration Strategy

1. Add tests and contract fixtures before behavior changes.
2. Mark canonical realtime event names and payload fields.
3. Keep legacy aliases as compatibility input.
4. Route normalized events through canonical adapter paths.
5. Add runtime lifecycle scenario tests and only then adjust runtime behavior.
6. Extract typed AppShell sections without visible UI behavior change.
7. Reduce `ts-nocheck` scope only after touched sections pass typecheck.
8. Keep bridge facade compatibility during migration.

## Validation

Always-required checks for implementation batches:

```bash
npm run typecheck
npm run test
npm run perf:realtime:boundary-guard
cargo test --manifest-path src-tauri/Cargo.toml runtime
openspec validate stabilize-core-runtime-and-realtime-contracts --strict --no-interactive
```

When-touched governance checks:

```bash
npm run check:runtime-contracts
node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
npm run check:heavy-test-noise
node --test scripts/check-large-files.test.mjs
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

Rules:

- `npm run check:runtime-contracts` is required when bridge, command registry, runtime contract, or app-server payload surfaces are touched.
- Heavy Test Noise Sentry checks are required when runtime/realtime/AppShell/bridge tests are added or changed.
- Large File Governance Sentry checks are required when source, style, fixture, or test files grow or are extracted.
- Cross-platform evidence is required when touched code can behave differently on Windows, macOS, or Linux.

Required CI parity:

- Heavy Test Noise Sentry MUST pass on ubuntu-latest, macos-latest, windows-latest.
- Large File Governance Sentry MUST pass on ubuntu-latest, macos-latest, windows-latest.

Any skipped command MUST be recorded with concrete reason and residual risk.
