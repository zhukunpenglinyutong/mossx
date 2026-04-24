## Why

`VITEST_INCLUDE_HEAVY=1 npm run test` 当前已经可以通过，但输出面仍然被大量仓库自有噪音污染：`AskUserQuestionDialog` 的 timer-driven `act(...)` storm、`SpecHub` 的重复 `act(...)` warning、`useThreadMessaging` 的 DEV debug stdout，以及少量预期错误路径的 stderr。继续放任这些噪音存在，会掩盖真正的新回归，也会让后续调试和 CI 诊断成本持续上升。

## 目标与边界

- 目标：
  - 收敛 heavy Vitest 全量回归中的 repo-owned warning / stdout / stderr 噪音。
  - 保留真实失败信号，不通过全局静音掩盖问题。
  - 将 environment-owned warning 显式划出仓库治理边界。
- 边界：
  - 仅处理 heavy Vitest 主回归路径中的测试噪音。
  - 不修改产品行为 contract，不把测试治理扩展到 Rust / Tauri / npm 本机环境配置。

## 非目标

- 不处理本机 `npm` 配置产生的 `electron_mirror` warning。
- 不做 blanket `console.*` 全局禁用。
- 不为了“零日志”而删除开发期真实有价值的本地调试能力。

## What Changes

- 建立 heavy test noise baseline，将噪音按 `act storm`、`DEV debug stdout`、`expected stderr`、`intentional library warning` 分类治理。
- 修正 `AskUserQuestionDialog` 中导致 timer-driven `act(...)` 风暴的测试写法。
- 将 `SpecHub` 高噪音 `act(...)` warning 收敛到测试边界，避免其继续污染 heavy suite 全局输出。
- 为 `useThreadMessaging` 的 DEV 调试日志增加 test-mode gate，避免 Vitest 输出被 debug stdout 淹没。
- 对预期错误路径和 intentional library warning 采用 test-boundary 断言或局部 mute，而不是让它们污染全局 heavy test 输出。

## Capabilities

### New Capabilities

- `heavy-test-noise-cleanliness`: 定义 heavy Vitest 回归中的测试噪音分类、治理边界和验收要求。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src/features/app/components/AskUserQuestionDialog.test.tsx`
  - `src/features/spec/components/SpecHub.test.tsx`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - 预期错误路径/intentional warning 对应的测试文件
- Affected systems:
  - Heavy Vitest regression output
  - Frontend debug instrumentation in test mode
- Dependencies:
  - No new runtime dependencies

## Acceptance Criteria

- `VITEST_INCLUDE_HEAVY=1 npm run test` 仍然通过。
- Heavy suite 中 repo-owned `act(...)` storm 不再由 `AskUserQuestionDialog` 和本轮覆盖的 `SpecHub` 热点用例触发。
- `useThreadMessaging` 的 DEV instrumentation 不再向 Vitest stdout 打印大体量调试日志。
- 预期错误路径和 intentional library warning 被局部断言、局部 mute 或等价方式收敛，不再成为全量输出噪音主来源。
- 剩余未清理项必须在 proposal/design/spec 中有明确 residual policy；environment-owned warning 必须被显式标记为 out-of-scope。

## Inventory Snapshot

- `npm` environment warning：1 行（out-of-scope）
- React `act(...)` warning：401 行，28 个上下文
- KaTeX strict warning：24 行，1 个上下文
- repo-owned stdout payload：1458 行，60 个上下文
- repo-owned stderr payload：9 行，6 个上下文

## Residual Warning Policy

- 允许保留 environment-owned warning，但必须明确标记为非仓库代码责任。
- 若某些库级 warning 属于刻意覆盖的异常分支，本轮必须将其缩到对应测试边界，不允许继续污染 heavy suite 全局输出。
