## 0. 代码回写状态（2026-04-21）

- 自动化实现与回归已完成：Claude-only `/compact` 路由、`startCompact()`、side-effect guard、lifecycle feedback、i18n 语义与非 Claude 兼容边界均已有任务与代码证据。
- 归档前仅剩手工验收矩阵：Claude 成功、Claude 失败、Codex 保持原行为三条路径仍需记录到 `3.3`。

## 1. Claude `/compact` 命令接入

- [x] 1.1 [P0][depends: none][I: `/compact` 用户输入][O: Claude-only slash command 解析分支][V: `npm run test -- src/features/threads/hooks/useQueuedSend.test.tsx`] 修改 `src/features/threads/hooks/useQueuedSend.ts`，新增 `compact` token，并只在 `activeEngine === "claude"` 时路由到 `startCompact`。
- [x] 1.2 [P0][depends: 1.1][I: 当前工作区 + 活跃 Claude 线程][O: `startCompact()` 发送路径][V: `npm run test -- src/features/threads/hooks/useThreadMessaging.test.tsx`] 修改 `src/features/threads/hooks/useThreadMessaging.ts`，实现 `startCompact()`，确保只复用现有 Claude thread/session；若不存在可 compact 的 Claude 线程则返回 actionable failure，并使用 `skipPromptExpansion`。
- [x] 1.3 [P1][depends: 1.2][I: `/compact` 提交时的 composer 状态][O: 无图片、无 prompt assembly 副作用的命令发送][V: `npm run test -- src/features/threads/hooks/useQueuedSend.test.tsx src/features/threads/hooks/useThreadMessaging.test.tsx`] 为手动 `/compact` 增加输入清洗与 side-effect guard，断言图片和 prompt assembly 不会混入命令。

## 2. 用户反馈与语义收口

- [x] 2.1 [P0][depends: 1.2][I: Claude compacting / compacted / error lifecycle][O: 手动 `/compact` 的确定性反馈][V: `npm run test -- src/features/app/hooks/useAppServerEvents.test.tsx src/features/threads/hooks/useThreadTurnEvents.test.tsx`] 复用既有 lifecycle 完成 Claude 手动 `/compact` 的成功/失败反馈，成功只落 `Context compacted.`，失败不残留 processing。
- [x] 2.2 [P1][depends: none][I: 现有 Claude compaction i18n copy][O: 明确区分 Claude overflow recovery 与 Codex threshold auto-compaction 的文案][V: `npm run test -- src/features/threads/hooks/useThreadMessaging.test.tsx`] 修改 `src/i18n/locales/en.part1.ts` 与 `src/i18n/locales/zh.part1.ts`，明确 Claude 自动语义边界，并补齐失败提示。
- [x] 2.3 [P1][depends: 2.1,2.2][I: 非 Claude 输入 `/compact` 的场景][O: 保持当前兼容行为][V: `npm run test -- src/features/threads/hooks/useQueuedSend.test.tsx`] 固化非 Claude `/compact` 不被本次 Claude 适配劫持，确保 Codex 不变。

## 3. 回归验证

- [x] 3.1 [P0][depends: 1.1,1.2,2.1][I: slash command / thread routing / lifecycle hooks][O: 单元测试覆盖][V: `npm run test -- src/features/threads/hooks/useQueuedSend.test.tsx src/features/threads/hooks/useThreadMessaging.test.tsx src/features/app/hooks/useAppServerEvents.test.tsx src/features/threads/hooks/useThreadTurnEvents.test.tsx`] 补齐 Claude `/compact` 命令接入的单元测试。
- [x] 3.2 [P0][depends: 3.1][I: Claude vs Codex 行为边界][O: 非回归保护][V: `npm run typecheck && npm run lint`] 增加跨引擎边界测试并执行基础质量门禁，保护 Codex 现状。
- [x] 3.3 [P1][depends: 3.1,3.2][I: 本次 change 涉及的前端路径][O: 可执行验收记录][V: 手工记录 Claude 成功、Claude 失败、Codex 保持原行为三条路径] 完成 issue #363 对应的手工验收矩阵。
