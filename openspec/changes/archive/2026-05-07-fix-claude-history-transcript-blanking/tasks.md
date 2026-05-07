## 0. 执行约束与 DoD

- 范围约束：仅允许修改 `Claude Code` history restore 的可见面判断与相关测试，不扩散到其他引擎。
- 行为约束：不得通过伪造 assistant text 解决问题；保留 transcript 原语义。
- 兼容约束：不修改 conversation storage schema，不改 Rust session file 结构。

### DoD

- [x] transcript-heavy `Claude` 历史恢复后不再落到 empty-thread placeholder
- [x] fallback 只对 `Claude` 生效，不影响 `Codex/Gemini/OpenCode`
- [x] 普通有 assistant text 的 `Claude` 历史仍保持现有阅读体验
- [x] focused tests 通过

## 1. OpenSpec And Spec Delta

- [x] 1.1 补 proposal/design/tasks，明确这是 `Claude Code` 专属 history transcript blanking 修复。验证：人工审阅 `openspec/changes/fix-claude-history-transcript-blanking/`
- [x] 1.2 新增 `claude-history-transcript-visibility` spec，并补 `conversation-render-surface-stability` / `thread-actions-session-runtime-compatibility` delta。验证：`openspec validate --all --strict --no-interactive`

## 2. Claude History Transcript Fallback

- [x] 2.1 在 `Messages` presentation 层识别 `Claude` transcript-heavy history profile。输入：`timelinePresentationItems`、assistant text 数量、tool/reasoning evidence；输出：narrow fallback predicate；验证：unit tests
- [x] 2.2 在 `Claude`、非 realtime、空白误判场景下放开必要的 tool transcript 可见面。输入：fallback predicate；输出：history visible surface 不再近空；验证：Messages focused tests
- [x] 2.3 保持其他引擎与普通 `Claude` 历史行为不变。验证：existing tests + targeted assertions

## 3. Regression Coverage

- [x] 3.1 为 `Claude` loader 增加 transcript-heavy history 样本测试，锁定 reasoning/tool 主导场景。验证：`claudeHistoryLoader.test.ts`
- [x] 3.2 为 `Messages` 增加 `Claude history transcript-heavy` 不显示 empty placeholder 的测试。验证：`Messages.history-loading.test.tsx`
- [x] 3.3 为 `useThreadActions` 增加 `Claude history reload` 在 transcript-heavy history 下仍设置可读 thread items 的测试。验证：`useThreadActions.claude-history.test.tsx`

## 4. Validation

- [x] 4.1 运行 OpenSpec 严格校验。验证：`openspec validate --all --strict --no-interactive`
- [x] 4.2 运行 focused frontend tests。验证：`npx vitest run src/features/messages/components/Messages.history-loading.test.tsx src/features/threads/loaders/claudeHistoryLoader.test.ts src/features/threads/hooks/useThreadActions.claude-history.test.tsx`
- [x] 4.3 运行静态门禁。验证：`npm run lint && npm run typecheck`
