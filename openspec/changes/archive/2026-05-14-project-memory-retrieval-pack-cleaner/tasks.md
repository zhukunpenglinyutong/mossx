## 0. Baseline

- [x] 0.1 [P0][输入: current `project-memory-phase3-usability-reliability` implementation][输出: retrieval pack implementation baseline notes][验证: `git status --short` + `openspec status --change project-memory-retrieval-pack-cleaner --json`][依赖:无] 确认本 change 在 Phase 3 之上修改消费契约，不回退 Project Memory capture/storage schema。
- [x] 0.2 [P0][输入: proposal/design/specs][输出: affected file map][验证: `rg -n "MemoryBrief|memory-scout|manual-selection|parseInjectedMemoryPrefixFromUser|memory-context-summary" src`][依赖:0.1] 定位 builder、send orchestration、UI render、history loader 的影响面。
- [x] 0.3 [P0][输入: `.github/workflows/heavy-test-noise-sentry.yml`, `.github/workflows/large-file-governance.yml`][输出: CI sentry implementation constraints confirmed][验证: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` + `node --test scripts/check-large-files.test.mjs`][依赖:0.1] 确认本 change 的测试写法不依赖平台特性，并理解两个 sentry 的 parser contracts。
- [x] 0.Exit [P0][输出: 可进入实现][验证: `openspec validate project-memory-retrieval-pack-cleaner --strict --no-interactive`][依赖:0.1-0.3] OpenSpec artifact strict pass。

## 1. Retrieval Pack Core

- [x] 1.1 [P0][文件: `src/features/project-memory/utils/*`][输出: `ProjectMemoryRetrievalPack` / record / cleaner result types][验证: 新增 unit tests 覆盖 type builders][依赖:0.Exit] 定义 pack、source record、stable index、field truncation、diagnostic shape。
- [x] 1.2 [P0][文件: `src/features/project-memory/utils/*`][输出: detailed source record builder][验证: tests 覆盖 conversation_turn、manual_note、legacy fallback][依赖:1.1] 从 ProjectMemoryItem 生成包含 userInput/assistantResponse/source metadata 的 detailed record。
- [x] 1.3 [P0][文件: `src/features/project-memory/utils/*`][输出: pack formatter/parser][验证: tests 覆盖 `[M1]` 稳定索引、metadata、truncated markers、sanitization][依赖:1.2] 生成 model-facing `<project-memory-pack>` 或兼容可识别块。
- [x] 1.4 [P1][文件: `src/features/project-memory/utils/*`][输出: budget policy][验证: tests 覆盖字段级裁剪、总量裁剪、保留 metadata][依赖:1.3] 实现详细记录预算，不用 summary 替代可容纳的详细字段。

## 2. Memory Cleaner

- [x] 2.1 [P0][文件: `src/features/project-memory/utils/*`][输出: deterministic Memory Cleaner][验证: tests 覆盖 relevantFacts、irrelevantRecords、conflicts、confidence][依赖:1.3] 实现只读清洗器，输入仅为用户请求和候选记忆 records。
- [x] 2.2 [P0][文件: `src/features/project-memory/utils/*`][输出: cleaner timeout/failure result mapping][验证: tests 覆盖 timeout/error 不抛出完整记忆正文][依赖:2.1] 清洗失败降级为 source records only 或无 pack，不能阻断发送。
- [x] 2.3 [P1][文件: `src/features/project-memory/utils/memoryScout.ts` 或替代模块][输出: improved deterministic retrieval scoring][验证: tests 覆盖 title/summary/tags/userInput/assistantResponse/detail/cleanText 多字段召回][依赖:1.2] 改善当前整句 contains 和 summary-only scoring 的弱召回问题。

## 3. Send Path Integration

- [x] 3.1 [P0][文件: `src/features/threads/hooks/useThreadMessaging.ts`][输出: manual `@@` uses retrieval pack][验证: `pnpm vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][依赖:1.3] 将 selectedMemoryIds 注入从 legacy context lines 切到 detailed retrieval pack。
- [x] 3.2 [P0][文件: `src/features/threads/hooks/useThreadMessaging.ts`][输出: Memory Reference uses retrieval + cleaner + pack][验证: hook tests 覆盖 ok/empty/timeout/error][依赖:2.2-2.3] Memory Reference 成功时注入 cleaned context + detailed records。
- [x] 3.3 [P0][文件: `src/features/threads/hooks/useThreadMessaging.ts`][输出: clean capture contract preserved][验证: tests 断言 `captureTurnInput.userInput` 仍为 visible user text][依赖:3.1-3.2] 防止 pack 污染 canonical Project Memory userInput。
- [x] 3.4 [P1][文件: `src/features/threads/hooks/useThreadMessaging.ts`][输出: debug diagnostics updated][验证: tests/rg 确认日志只含 count/ids/chars/status/elapsed][依赖:3.2] 诊断不输出完整记忆正文或 cleaned context。

## 4. UI And History Presentation

- [x] 4.1 [P0][文件: `src/features/messages/components/messagesMemoryContext.ts`,`MessagesRows.tsx`][输出: retrieval pack parser/render model][验证: messages tests 覆盖 pack 解析和用户气泡剥离][依赖:1.3] 解析 `<project-memory-pack>` 并保留旧 `<project-memory>` 兼容。
- [x] 4.2 [P0][文件: `src/features/messages/components/MessagesRows.tsx`,`src/styles/messages.part*.css`][输出: associated resource card indexes][验证: UI tests 断言 `[M1]` card 独立于 `.message.user .bubble`][依赖:4.1] 关联资源卡片显示与 pack 一致的 memory indexes。
- [x] 4.3 [P0][文件: `src/features/threads/loaders/*`][输出: history replay preserves retrieval pack][验证: `pnpm vitest run src/features/threads/loaders/historyLoaders.test.ts`][依赖:4.1] Codex remote/local history 保留 pack provenance，用户气泡只显示真实输入。
- [x] 4.4 [P1][文件: `src/features/composer/**`][输出: manual selected memory preview index alignment][验证: composer tests 覆盖 selected chips/card indexes][依赖:3.1-4.2] 发送前 UI preview 与 pack indexes 对齐。

## 5. Cross-Engine Verification

- [x] 5.1 [P0][验证: `pnpm vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: Claude/Codex/Gemini pack parity][依赖:3.1-3.2] 三引擎发送路径使用同一 pack builder。
- [x] 5.2 [P0][验证: `pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts`][输出: message surface regression pass][依赖:4.1-4.3] 确认独立关联资源展示不回退。
- [x] 5.3 [P0][验证: `pnpm vitest run src/features/project-memory src/features/composer src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: focused frontend regression pass][依赖:1.Exit-4.Exit] 覆盖 retrieval pack、manual `@@`、Memory Reference、UI 关联资源。

## 6. Release Gates

- [x] 6.1 [P0][验证: `openspec validate project-memory-retrieval-pack-cleaner --strict --no-interactive`][输出: OpenSpec strict pass][依赖:5.1-5.3] 变更 artifacts 严格通过。
- [x] 6.2 [P0][验证: `npm run typecheck`][输出: TS typecheck pass][依赖:5.1-5.3] 前端类型门禁通过。
- [x] 6.3 [P0][验证: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` + `npm run check:heavy-test-noise`][输出: test noise sentry pass][依赖:6.1-6.2] 新增测试不输出完整记忆正文、cleaned context、prompt pack 或非必要 stdout/stderr payload。
- [x] 6.4 [P0][验证: `node --test scripts/check-large-files.test.mjs` + `npm run check:large-files:near-threshold` + `npm run check:large-files:gate`][输出: large file governance pass][依赖:6.1-6.3] 新增 pack/cleaner/parser/UI/history 代码按职责拆分，不制造 large-file hard debt。
- [x] 6.5 [P0][输入: changed implementation/test files][输出: implementation review checklist][验证: `git diff --check` + 对本 change 修改的实现/测试文件执行 `rg -n "console\\.(log|warn|error)|\\.only\\(|full memory|cleaned context"`][依赖:6.3-6.4] Review 前确认没有调试输出、独占测试、完整记忆正文日志或大段 prompt fixture 泄漏；不要全仓扫描既有治理脚本导致误报。
- [x] 6.Exit [P0][输出: ready for implementation review][完成定义: 所有任务完成，手动验证 `@@` 和 Memory Reference 都向主会话注入 detailed retrieval pack，并且 UI 独立展示相同 `[Mx]` 资源索引；两个 CI sentry 对应命令通过][依赖:6.1-6.5]
