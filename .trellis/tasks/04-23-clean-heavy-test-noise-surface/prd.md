# clean-heavy-test-noise-surface

## 背景

heavy Vitest 全量回归已经通过，但输出噪音过大，正在降低真实失败信号的可见性。当前最大头集中在 `AskUserQuestionDialog` 的 timer-driven `act(...)` storm、`SpecHub` 热点用例的异步 `act(...)` warning，以及 `useThreadMessaging` 在 test mode 下仍输出的大量 DEV debug 日志。

## 目标

1. 收敛 repo-owned heavy suite 输出噪音，不掩盖真实失败。
2. 保留开发环境下的调试能力，不做 blanket console mute。
3. 让 `VITEST_INCLUDE_HEAVY=1 npm run test` 的输出重新回到可定位状态。

## 范围

- `src/features/app/components/AskUserQuestionDialog.test.tsx`
- `src/features/spec/components/SpecHub.test.tsx`
- `src/features/threads/hooks/useThreadMessaging.ts`
- 对应的 expected stderr / intentional warning 测试文件
- `openspec/changes/clean-heavy-test-noise-surface/**`

## 非目标

- 本机 npm 配置 warning（如 `electron_mirror`）
- Rust / Tauri warning 治理
- 产品行为或跨层 contract 变更

## 验证

- `npm run lint`
- `npm run typecheck`
- `npx vitest run src/features/app/components/AskUserQuestionDialog.test.tsx src/features/spec/components/SpecHub.test.tsx src/features/threads/hooks/useThreadMessaging.test.tsx src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`
- `VITEST_INCLUDE_HEAVY=1 npm run test`
