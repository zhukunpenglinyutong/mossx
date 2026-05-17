# Journal - chenxiangning (Part 14)

> Continuation from `journal-13.md` (archived at ~2000 lines)
> Started: 2026-05-16

---



## Session 478: 修复 Composer.rewind-confirm.test 在 CI 上的 waitFor 超时

**Date**: 2026-05-16
**Task**: 修复 Composer.rewind-confirm.test 在 CI 上的 waitFor 超时
**Branch**: `feature/v0.5`

### Summary

Testing Library 默认 asyncUtilTimeout 1000ms 在 CI 慢机器（23x 本地耗时）触发 14 个 waitFor 超时。调到 5000ms 后 PR #564 CI 13/13 全绿。

### Main Changes


## Summary

PR #564 自 feature/v0.4.18 合入后持续标红 5 项 CI（heavy-test-noise × 3 + test-js + test-windows），失败用例全部聚焦 `Composer.rewind-confirm.test.tsx`。本会话定位根因并完成最小修复。

## Root Cause

- CI runner 上 Composer.rewind-confirm.test.tsx 单文件耗时 15190ms（本地 650ms，慢 23×）
- 14/39 失败用例全部使用 `waitFor` / `findByTestId`
- Testing Library 默认 `asyncUtilTimeout: 1000ms`
- CI 平均 ~389ms / 测试 → waitFor 内 retry 不足，超时
- 不是测试间状态污染，也不是业务代码 regression

## Fix

`src/test/vitest.setup.ts`：

```ts
import { cleanup, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
```

7 行改动，零行为变更（本地 waitFor 50ms 内完成，不受新 timeout 影响）。

## Validation

- 本地 `npx vitest run` 单测：39/39 通过（601ms）
- 本地 `node scripts/test-batched.mjs` 全量：476 test files / exit 0
- CI `chenxiangning/codemoss@1500a69a` check_runs：**13/13 success**
  - build-macos / test-windows / test-js / typecheck / lint / test-tauri / memory-kind-contract
  - Heavy test noise sentry × 3 platforms
  - Large file sentry × 3 platforms

## Status

[OK] **Completed** — PR #564 已加 comment 标注修复结果，Trellis 任务已 archive。

## Next Steps

- PR #564 可推进 review / merge
- 后续若 CI 进一步变慢，可再考虑提高至 10s 或独立 retry 策略


### Git Commits

| Hash | Message |
|------|---------|
| `1500a69a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 479: PR #564 与 chore/bump-version-0.5 语义融合

**Date**: 2026-05-16
**Task**: PR #564 与 chore/bump-version-0.5 语义融合
**Branch**: `feature/v0.5`

### Summary

合并 base 分支引入的 prewarmKatexAssets perf 与我们的 asyncUtilTimeout fix。直接双保留导致 jsdom 启动阻塞，下沉 prewarmKatexAssets 到 math-rendering 测试文件后两边能力点都保留，57/57 通过，PR 重新 MERGEABLE。

### Main Changes


## Summary

PR #564 与 base 分支 `chore/bump-version-0.5` 发生冲突，按合并防回退铁律完成语义融合。

## Capability Matrix

| 改动 | upstream | HEAD |
|---|---|---|
| `configure({ asyncUtilTimeout: 5000 })` | ❌ | ✅ |
| `prewarmKatexAssets()` beforeAll | ✅ | ❌ |

## Conflict File

仅 `src/test/vitest.setup.ts` 文件顶部 textual conflict。

## Resolution Process

1. 列能力矩阵 → 看似可直接双保留
2. 直接双保留后本地 rewind 测试 14/39 失败（每个 5003-5009ms 刚好 timeout）
3. 诊断：upstream 的 `prewarmKatexAssets` 在 setup beforeAll 阻塞 katex chain 加载，让 jsdom React commit 推过 5s 窗口
4. 移除全局 setup 的 beforeAll，下沉 prewarmKatexAssets 到 Markdown.math-rendering.test.tsx file-scoped beforeAll
5. 两边能力点全部保留：
   - 全局 asyncUtilTimeout = 5000ms（CI 修复仍有效）
   - 数学渲染测试仍能预热 katex（local scope 不污染其他测试）

## Validation

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npx vitest run Composer.rewind-confirm.test.tsx Markdown.math-rendering.test.tsx` → 57/57 通过

## PR State

- Before: `mergeable: CONFLICTING / mergeStateStatus: DIRTY`
- After: `mergeable: MERGEABLE / mergeStateStatus: UNSTABLE`（CI 重跑中）

## Next Steps

等 CI 在 `5fa60b2b` 上重跑结果，全绿即可推进 review/merge。


### Git Commits

| Hash | Message |
|------|---------|
| `5fa60b2b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 480: 收口 harness 治理层设计提案

**Date**: 2026-05-17
**Task**: 收口 harness 治理层设计提案
**Branch**: `feature/v0.5`

### Summary

完成 harness governance 设计层收口，新增主战略文档与 9 个 OpenSpec 治理 change，明确实施顺序、substrate blocker、heavy-test-noise / large-file governance / 三平台兼容硬约束。

### Main Changes

- 新增 `docs/architecture/harness-governance-strategy.md`，形成 v1.6 治理战略基线。
- 新增 5 个治理设计 change：`formalize-engine-runtime-contract`、`add-engine-capability-matrix-spec`、`evolve-context-ledger-to-cost-budget`、`evolve-checkpoint-to-policy-chain`、`add-agent-domain-event-schema`。
- 补齐 4 个治理基座 blocker 的 design/spec/tasks：`refactor-mega-hub-split`、`optimize-realtime-event-batching`、`optimize-long-list-virtualization`、`optimize-bundle-chunking`。
- 更新 `openspec/project.md`，将 active changes 分组为 Harness Governance Design Set / Substrate Set / Other Active Changes。
- 把 `.github/workflows/heavy-test-noise-sentry.yml`、`.github/workflows/large-file-governance.yml` 与 Win/macOS/Linux 兼容写入实施硬约束。
- 验证：`openspec validate --all --strict --no-interactive` 通过，269 passed / 0 failed。


### Git Commits

| Hash | Message |
|------|---------|
| `783c5ab8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
