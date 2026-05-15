## 0. Baseline

- [x] 0.1 [P0][输入: current Memory Reference send path][输出: duplicate card root cause confirmed][验证: `rg -n "memory-scout-querying|memory-scout-context|Memory Reference: querying" src/features/threads/hooks/useThreadMessaging.ts src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][依赖:无] 确认 querying/result 当前使用不同 id 导致两张卡。
- [x] 0.Exit [P0][输出: artifacts valid][验证: `openspec validate fix-memory-reference-single-status-card --strict --no-interactive`][依赖:0.1] OpenSpec strict pass。

## 1. Single Status Card

- [x] 1.1 [P0][文件: `src/features/threads/hooks/useThreadMessaging.ts`][输出: stable memory scout summary id][验证: focused hook test][依赖:0.Exit] 让 Memory Reference querying 与 final preview 使用同一个 item id。
- [x] 1.2 [P0][文件: `src/features/threads/hooks/useThreadMessaging.ts`][输出: final result updates querying card][验证: focused hook test][依赖:1.1] 确保 empty/found/timeout/error 结果不新增第二张 Memory Reference 摘要卡。
- [x] 1.3 [P1][文件: `src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: regression tests][验证: `pnpm vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][依赖:1.2] 增加测试覆盖 no-related 与 found-memory 两类状态只保留一张卡。
- [x] 1.4 [P1][文件: `src/features/messages/components/messagesMemoryContext.ts`, `src/features/messages/components/MessagesRows.tsx`][输出: normalized memory context display][验证: `pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts`][依赖:1.3] 查询到的记忆在 live/history 中统一展示为独立结构化资源卡；legacy Markdown 摘要保留格式化渲染。
- [x] 1.5 [P1][文件: `src/features/messages/components/messagesMemoryContext.ts`, `src/features/messages/components/MessagesRows.tsx`, `src/styles/messages.part1.css`][输出: display index + sent detail inspector][验证: `pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts`][依赖:1.4] 多个记忆包展示时使用 UI-only 唯一编号，并提供真实发送 payload 详情入口。
- [x] 1.6 [P1][文件: `src/features/messages/components/MessagesRows.tsx`, `src/styles/messages.part1.css`][输出: unclipped sent detail dialog][验证: `pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts`][依赖:1.5] 真实发送详情通过 document-level portal 渲染，避免被消息滚动/transform 容器裁剪。
- [x] 1.7 [P1][文件: `src/features/messages/components/MessagesRows.tsx`, `src/styles/messages.part1.css`, `src/i18n/locales/*.part1.ts`][输出: markdown rendered sent detail dialog][验证: `pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts src/i18n/locales/chatLocaleMerge.test.ts`][依赖:1.6] 真实发送详情默认按包渲染 `Cleaned Context` Markdown，raw payload 折叠保留，并修复右上角关闭控件可见性。
- [x] 1.8 [P1][文件: `src/features/project-memory/utils/projectMemoryRetrievalPack.ts`, `src/features/messages/components/messagesMemoryContext.ts`, `src/features/messages/components/MessagesRows.tsx`][输出: parser reuse after review][验证: `pnpm vitest run src/features/project-memory/utils/projectMemoryRetrievalPack.test.ts src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts`][依赖:1.7] Review 后移除消息组件内重复 retrieval-pack parser，统一复用 project-memory parser 输出。

## 2. Release Gates

- [x] 2.1 [P0][验证: `pnpm vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`][输出: hook regression pass][依赖:1.3] 目标 hook 测试通过。
- [x] 2.2 [P0][验证: `npm run typecheck`][输出: TS typecheck pass][依赖:1.3] 类型门禁通过。
- [x] 2.3 [P0][验证: `git diff --check`][输出: whitespace check pass][依赖:2.1-2.2] diff whitespace 通过。
- [x] 2.4 [P1][验证: `pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts`][输出: message display regression pass][依赖:1.4-1.8] 消息资源卡归一化测试通过。
- [x] 2.5 [P0][验证: `npm run lint`][输出: lint pass][依赖:1.8] Review 后 lint 门禁通过。
- [x] 2.6 [P1][验证: `npm run check:large-files`][输出: large-file sentry pass][依赖:1.7] CSS 分片修改后 large-file sentry 通过。
- [x] 2.Exit [P0][输出: ready for review][完成定义: OpenSpec strict、目标测试、lint、typecheck、diff check、large-file sentry 全部通过][依赖:2.1-2.6]
