## 1. Codex Sidebar Continuity Merge

- [x] 1.1 [P0][Depends:none][Input: `useThreadActions.ts` 当前 `listThreadsForWorkspace()` 的 live list / active catalog / local scan merge 路径][Output: `Codex` degraded continuity merge 规则，能在 partial omission 下保留 last-good visible finalized sessions][Verify: targeted tests 覆盖“refresh 非空但遗漏部分 Codex entries 时，已可见 session 不被静默移除”] 在 thread summary merge 层收敛 `Codex` sidebar continuity truth。
- [x] 1.2 [P0][Depends:1.1][Input: `useThreadsReducer.ts` 的 `setThreads` replace 逻辑与现有 active/pending preservation][Output: 针对 finalized `Codex` sessions 的 bounded continuity retention 与 downgrade guard][Verify: reducer tests 覆盖 active->completed cutover、partial refresh omission、authoritative remove 三类场景] 将 reducer 从“只保活 active/pending”升级为支持 `Codex` finalized continuity。

## 2. Title Truth Precedence

- [x] 2.1 [P0][Depends:1.1][Input: `useThreadsReducer.ts` 首条 user-message rename、`useThreads.ts` custom title/mapped title 写入、catalog title merge 逻辑][Output: 稳定 title precedence contract（custom/mapped > catalog > transient rename > ordinal fallback）][Verify: targeted tests 覆盖 confirmed title 在 refresh 后不回退为 `Agent x`，以及 stronger source 可升级 weaker title] 收紧 `Codex` thread title truth 的优先级与降级保护。
- [x] 2.2 [P1][Depends:2.1][Input: `ThreadList` / `PinnedThreadList` / workspace home recent threads 对 `thread.name` 的消费路径][Output: 所有 sidebar-related surfaces 共享同一 title truth 结果，不再各自回退 fallback][Verify: 组件/selector 级测试覆盖 sidebar、pinned list、recent threads 三个 surface 标题一致] 对齐多 surface 的标题呈现一致性。

## 3. Codex Session Sidebar State Parity

- [x] 3.1 [P0][Depends:1.1-2.1][Input: `spawn_agent`/agent-style `Codex` 子会话在 active catalog 与 finalized history 间的切换窗口][Output: agent-style session 的 active-to-completed visibility continuity contract][Verify: `useThreadActions.native-session-bridges.test.tsx` 或等价测试覆盖 agent 子会话不会在 cutover 窗口闪烁消失] 修复 agent-style `Codex` 子会话的 sidebar 可见性连续性。
- [x] 3.2 [P0][Depends:1.2,2.2][Input: `useAppShellSearchRadarSection.ts` 的 recent thread 派生与 sidebar thread summaries store][Output: workspace home recent threads 与左侧 thread list 的 parity 收敛][Verify: partial/degraded refresh 下 recent threads 与 sidebar 对同一 `Codex` session 的可见性与标题保持一致] 收敛 workspace home / recent conversations 与 sidebar 的 projection parity。

## 4. Verification

- [x] 4.1 [P0][Depends:1.1-3.2][Input: `useThreadActions.native-session-bridges.test.tsx`、`useThreadsReducer.threadlist-pending.test.ts`、`useThreadActions.test.tsx` 现有测试基线][Output: 覆盖 partial omission continuity、title rollback prevention、agent cutover continuity 的回归矩阵][Verify: 相关 Vitest targeted suites 全部通过，并新增至少一条“非空 refresh 仍遗漏 subset”的 regression case] 补齐本 change 的核心自动化回归。
- [x] 4.2 [P0][Depends:4.1][Input: 本 change 受影响前端模块与 OpenSpec artifacts][Output: 可进入 apply 的实现门禁记录][Verify: `openspec validate fix-codex-session-sidebar-state-parity --strict`、相关 targeted tests 通过；必要时补跑 `npm run typecheck` 与 `npm run test`] 完成规范校验与最小实现前验证。
