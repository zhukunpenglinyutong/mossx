## 0. Corrective Audit

- [x] 0.1 [P0][输入: archived semantic retrieval proposal/tasks/specs][输出: mismatch list][验证: proposal Audit Findings] 对照已归档提案与生产代码，确认 semantic/vector 未接入生产 send path。
- [x] 0.2 [P0][输入: current Memory Reference code][输出: failure mechanism][验证: `useThreadMessaging.ts` + `memoryScout.ts` + `search.rs` evidence] 确认真实 miss 来自无 provider + backend raw substring prefilter。

## 1. Fallback Candidate Repair

- [x] 1.1 [P0][文件: `src/features/project-memory/utils/memoryScout.ts`][输出: broad fallback candidate fetch][验证: unit test] semantic provider 不可用时，Memory Reference 使用 `query: null` 拉取 bounded workspace candidates，再本地 rank。
- [x] 1.2 [P0][文件: `src/features/project-memory/utils/memoryContextInjection.ts` 或 `memoryScout.ts`][输出: identity recall scoring][验证: `我是陈湘宁` -> `我是谁` test] 支持身份/名字 recall intent，避免依赖连续子串。
- [x] 1.3 [P0][文件: `src/features/project-memory/utils/memoryScout.ts`][输出: honest diagnostics][验证: test assertions] 无生产 semantic provider 时明确保持 lexical fallback，不产生 semantic/hybrid 假状态。
- [x] 1.4 [P0][文件: `src/features/project-memory/utils/memoryScout.ts`][输出: bounded multi-page fallback scan][验证: page-2 identity recall test] fallback 不只扫第一页，同时限制最大扫描条数。
- [x] 1.5 [P0][文件: `src/features/project-memory/utils/memoryContextInjection.ts`][输出: identity false-positive guard][验证: assistant self-introduction negative test] 身份证据不把助手自我介绍当作用户身份。
- [x] 1.6 [P0][文件: `src/features/project-memory/utils/memoryContextInjection.ts`][输出: recall relevance-first ordering][验证: relevance-over-importance test] `我是谁` 等精确回忆意图优先选择强相关身份记忆。

## 2. Production Path Tests

- [x] 2.1 [P0][文件: `src/features/project-memory/utils/memoryScout.test.ts`][输出: pure fallback regression][验证: focused vitest] 不传 semanticProvider 时，`我是谁` 能选中包含 `我是陈湘宁` 的记忆。
- [x] 2.2 [P0][文件: `src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: send path regression][验证: focused vitest] production-shaped Memory Reference send path 注入 retrieval pack，而不是显示未找到。
- [x] 2.3 [P1][文件: tests][输出: diagnostics regression][验证: debug payload assertions] debug payload 不泄漏完整记忆正文，且不把 lexical fallback 标成 semantic。

## 3. Documentation And Gates

- [x] 3.1 [P0][验证: `openspec validate repair-project-memory-reference-retrieval-integrity --strict --no-interactive`][输出: OpenSpec strict pass] corrective change artifacts 有效。
- [x] 3.2 [P0][验证: focused project-memory/thread tests][输出: tests pass] 聚焦测试通过。
- [x] 3.3 [P0][验证: `npm run typecheck`][输出: TS pass] 类型检查通过。
- [x] 3.4 [P0][验证: `npm run lint`][输出: lint pass] lint 通过。

## Deferred Follow-Up

- [x] F1 [P1][输出: separate proposal][验证: new OpenSpec change] 若要真正上线 vector retrieval，另开本地 embedding provider proposal，评审模型/runtime/包体/跨平台治理，不再用 fake provider 或 lexical fallback 冒充。
