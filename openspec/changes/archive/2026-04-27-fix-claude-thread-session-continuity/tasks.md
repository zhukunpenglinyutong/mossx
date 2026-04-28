## 1. Canonical Continuity Core

- [x] 1.1 [P0][Depends: none][Input: 现有 `threadAliases`、`resolveCanonicalThreadId`、`Claude` pending->finalized 事件链][Output: `Claude` continuity helper 与 canonical identity 判定边界][Verify: helper 只能消费已验证 alias / pending anchor / turn lineage，不引入“猜最近 session”误绑] 为 `Claude` thread/session continuity 定义统一 canonical resolve helper。
- [x] 1.2 [P0][Depends: 1.1][Input: `useThreadTurnEvents.ts` 的 `onThreadSessionIdUpdated`、pending->finalized rebind 逻辑][Output: `Claude` pending->finalized 只收敛到一个 canonical conversation 的事件处理][Verify: targeted tests 覆盖“安全 rename 成功”和“证据不足时进入 reconcile 而不是 duplicate thread”] 收紧 `Claude` session-id update 的 lineage 配对与 rebind 行为。

## 2. Continuation Paths

- [x] 2.1 [P0][Depends: 1.1-1.2][Input: approval event / decision submit、`requestUserInput` event / submit 当前 thread routing][Output: approval 与 `requestUserInput` 恢复链路统一消费 canonical thread identity][Verify: 提交 approval 或问题回答后，后续 processing / assistant 结果继续出现在原可见 `Claude` 会话，不再假死或漂到 ghost thread] 修复 `Claude` approval / `requestUserInput` continuity。
- [x] 2.2 [P0][Depends: 1.1][Input: `setActiveThreadId`、lazy resume、`resumeThreadForWorkspace` 返回值][Output: active selection 与 history loading owner 能随 recovered canonical thread 迁移][Verify: 选择需要 reconcile 的 `Claude` 会话时，active/loading 不再固着在 stale id 上] 让异步 resume / reopen 消费 recovered canonical thread id。

## 3. Sidebar And History Reopen

- [x] 3.1 [P0][Depends: 2.2][Input: `Claude` history reopen、JSONL load、sidebar selected entry 当前行为][Output: readable-first reconcile 模型与显式 reconcile/failure surface][Verify: 重新打开 `Claude` 历史会话后，不再出现“先看到历史、1 秒后消失”的空白回退] 修复 `Claude` history reopen 的 readable surface continuity。
- [x] 3.2 [P1][Depends: 3.1][Input: sidebar selected state、canonical replacement、ghost pending/finalized duplicate 现象][Output: selected entry 与 canonical replacement 的 truth convergence 规则][Verify: sidebar 不再出现会自行消失的 duplicate `Claude` 会话，selected entry 与实际打开会话一致] 收敛 sidebar truth 与 canonical replacement 的呈现。

## 4. Diagnostics And Validation

- [x] 4.1 [P1][Depends: 1.2-3.2][Input: continuity helper、event routing、reopen/reconcile 关键节点][Output: continuity-scoped debug diagnostics 与 targeted tests][Verify: 扩展 `useThreadActions.claude-history.test.tsx`、`useThreads.sidebar-cache.test.tsx`、`Messages.history-loading.test.tsx`，覆盖 pending->finalized、approval continue、`requestUserInput` submit、history reopen late reconcile 四类回归链路] 为 `Claude` continuity 回归补齐可定位证据与测试。
- [x] 4.2 [P0][Depends: 4.1][Input: 本 change 的 proposal/design/specs/tasks 与测试结果][Output: 可进入 apply 阶段的完整 OpenSpec change][Verify: `openspec validate fix-claude-thread-session-continuity --strict` 通过，并记录相关前端验证命令] 完成 OpenSpec 校验与最小实现门禁记录。
