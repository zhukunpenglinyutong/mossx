## Why

`heavy-test-noise-cleanliness` 规范已经定义了 heavy Vitest 回归中的 repo-owned 噪音必须被收敛，但当前 CI 仍只验证测试是否通过，没有对 `act(...)` storm、debug stdout、预期错误路径 stderr 泄漏做 executable gate。没有自动 sentry，这条规范就会重新退化成“靠人记得别回退”。

## 目标与边界

- 目标：
  - 为 heavy Vitest 回归增加可执行的 CI sentry。
  - 只拦 repo-owned 测试噪音，不把本机或 runner 环境噪音误判成仓库回归。
  - 保持 workflow 独立，避免把现有 `ci.yml` 的手动执行结构一起改大。
- 边界：
  - 仅覆盖 heavy frontend test log surface。
  - 不修改产品行为，也不治理 npm / runner 本机环境配置。

## 非目标

- 不把 `ci.yml` 整体切成 pull_request/push 全自动。
- 不处理 Rust test warning 或 Tauri build warning。
- 不做 blanket `console.*` 全局禁用。

## What Changes

- 为 heavy Vitest 回归新增一条独立的 noise sentry workflow。
- 新增一个 Node-based log gate 脚本：执行 heavy batched tests、采集 stdout/stderr、解析 repo-owned 噪音、输出 gate summary。
- 为 noise gate 增加 parser tests，保证 allowlist 和 violation detection 不会脆弱漂移。
- 将 `heavy-test-noise-cleanliness` 扩展为包含 CI sentry requirement。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `heavy-test-noise-cleanliness`: 新增 CI sentry requirement，要求 heavy suite 在 CI 中对 repo-owned 测试噪音执行 fail gate，并显式放行 environment-owned warning。

## Impact

- Affected code:
  - `scripts/check-heavy-test-noise.mjs`
  - `scripts/check-heavy-test-noise.test.mjs`
  - `package.json`
  - `.github/workflows/heavy-test-noise-sentry.yml`
- Affected systems:
  - GitHub Actions PR / push sentry surface
  - Heavy Vitest regression observability
- Dependencies:
  - No new runtime dependencies

## Acceptance Criteria

- 存在一个独立 workflow，在 PR / push / workflow_dispatch 下执行 heavy test noise gate。
- Gate 会在 heavy tests 通过后继续解析日志，并对 repo-owned `act(...)`、stdout payload、stderr payload 执行 fail。
- `electron_mirror` 等 environment-owned warning 被显式 allow，不触发 gate 失败。
- Gate 脚本有 parser tests，避免日志格式升级时静默漂移。

