# Fix Composer Rewind Confirm CI Flake

## Goal

定位并修复 `src/features/composer/components/Composer.rewind-confirm.test.tsx` 在 CI batch 模式下持续失败（本地全绿）的根因。

## Background

PR #564 自 commit `ab1f65ea`（feature/v0.4.18 合入 feature/v0.5）后，CI 上的 heavy-test-noise / test-js / test-windows 三组 workflow 持续标红，失败用例全部集中在该测试文件，影响后续基线工作（`add-runtime-perf-baseline`）的合并评审。

相关 PR comment: https://github.com/zhukunpenglinyutong/desktop-cc-gui/pull/564#issuecomment-4462606067

## Failure Signature

- `Number of calls: 0` for `vi.mocked(invoke)` against `export_rewind_files`
- `TestingLibraryElementError: Unable to find an element by: [data-testid="claude-rewind-reveal-store-button"]`
- `TestingLibraryElementError: Unable to find an element by: [data-testid="claude-rewind-store-feedback"]`
- 12+ 测试用例同时挂

## Hypothesis

batch 模式（`node scripts/test-batched.mjs`，`--maxWorkers=1 --minWorkers=1`，4 文件/批）下，同 batch 内的其他测试文件存在 **module-level 全局状态污染**（如未清理的 `vi.mock`、`globalThis` patch、localStorage 残留）导致 `Composer` 内 `handleStoreRewindChanges` 短路或 mock 被覆盖。

## Out of Hypothesis

- 路径处理跨平台差异：纯字符串函数，已排除
- jsdom 环境缺失：测试已声明 `/** @vitest-environment jsdom */`，已排除
- 业务代码 regression：baseline 工作零修改 Composer 相关代码，已排除

## Diagnose Plan

1. 跑 `VITEST_BATCH_SIZE=4 node scripts/test-batched.mjs` 本地完整复现 CI batch 行为
2. 用 ripgrep 列出全部测试文件，定位 `Composer.rewind-confirm.test.tsx` 所在 batch 的邻居清单
3. 二分屏蔽邻居，确定污染源
4. 检查污染源是否有未清理的 `vi.mock` / `globalThis` mutation
5. 修复（清理副作用 / 隔离 mock scope / 调整 batch 顺序）

## Acceptance Criteria

- 本地 `node scripts/test-batched.mjs` 完整通过
- CI 上 heavy-test-noise（3 平台）/ test-js / test-windows 全绿
- 不修改 `Composer.rewind-confirm.test.tsx` 的断言语义
- 修复说明同步到 PR comment

## Validation

```bash
node scripts/test-batched.mjs
npm run check:heavy-test-noise
```

## Non-Goals

- 重写 rewind 业务逻辑
- 改 batch runner 的默认 batchSize 或 worker 数
