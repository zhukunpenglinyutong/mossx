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
