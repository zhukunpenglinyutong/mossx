# enforce-heavy-test-noise-ci-sentry

## 背景

`heavy-test-noise-cleanliness` 已经在行为规范里落地，但 CI 还没有对应的 executable gate。现在 heavy suite 虽然已经被清理干净，如果没有自动 sentry，后续任何 repo-owned `act(...)` / stdout / stderr 噪音都可能在不影响 test pass 的前提下悄悄回退。

## 目标

1. 为 heavy Vitest 回归增加独立 CI sentry。
2. 只拦 repo-owned noise，显式放行 environment-owned warning。
3. 保持实现跨平台、可测试、可作为 required check 使用。

## 范围

- `scripts/check-heavy-test-noise.mjs`
- `scripts/check-heavy-test-noise.test.mjs`
- `package.json`
- `.github/workflows/heavy-test-noise-sentry.yml`
- `openspec/changes/enforce-heavy-test-noise-ci-sentry/**`

## 非目标

- 不重构现有 `ci.yml`
- 不处理 Rust warning / Tauri build warning
- 不治理本机 npm 配置

## 验证

- `node --test scripts/check-heavy-test-noise.test.mjs`
- `npm run check:heavy-test-noise`
- `npm run lint`
- `npm run typecheck`
