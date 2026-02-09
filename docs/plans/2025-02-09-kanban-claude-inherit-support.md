# 看板“继承当前”功能（Claude Code）执行报告

**创建日期**: 2025-02-09  
**最后更新**: 2026-02-09  
**状态**: ✅ 已完成（Ready for PR）

---

## 1. 目标与结论

目标：让看板“继承当前”在 Claude Code 模式下可用，并与 Codex 行为一致。  
结论：已完成。当前 `inherit` 策略不再被引擎类型硬编码拦截；Claude 会话可被 fork 并切换到新的 `claude:<sessionId>` 线程。

---

## 2. 实际实现（与旧方案对齐结果）

### 2.1 前端策略层

- 已移除 `contextMode` 中“非 codex 强制 new”的限制。
- `inherit` 仅由上下文前置条件决定（线程/工作区一致性等），不再按引擎提前降级。

Refers to:
- `src/features/kanban/utils/contextMode.ts`
- `src/features/kanban/utils/contextMode.test.ts`

### 2.2 线程 fork 流程

- `useThreadActions` 在 fork 时新增 Claude 分支：
1. 识别 `threadId` 为 `claude:*`
2. 解析 `sessionId`
3. 调用 `forkClaudeSession(workspacePath, sessionId)`
4. 按返回线程 id 自动识别 engine（`claude` / `codex`）并 `ensureThread`

Refers to:
- `src/features/threads/hooks/useThreadActions.ts`
- `src/features/threads/hooks/useThreadActions.test.tsx`

### 2.3 Tauri 接口扩展

- 新增前端 invoke 包装：`forkClaudeSession`
- 新增 Rust command：`fork_claude_session`
- 在 Claude history 模块中实现 JSONL 克隆并重写 `session_id/sessionId` 到新的 UUID

Refers to:
- `src/services/tauri.ts`
- `src/services/tauri.test.ts`
- `src-tauri/src/engine/commands.rs`
- `src-tauri/src/engine/claude_history.rs`
- `src-tauri/src/lib.rs`

---

## 3. 验证记录

### 3.1 单测

已执行：
```bash
npm run test -- src/features/kanban/utils/contextMode.test.ts src/features/threads/hooks/useThreadActions.test.tsx src/services/tauri.test.ts
```

结果：`3 passed / 44 passed`。

### 3.2 类型检查

已执行：
```bash
npm run typecheck
```

结果：通过（无 TypeScript 错误）。

---

## 4. 验收清单

- [x] Claude 模式可走 inherit 策略（满足前置条件时）
- [x] Claude fork 能返回新 session/thread
- [x] fork 后线程 engine 正确标记为 `claude`
- [x] 相关单测覆盖并通过
- [x] Typecheck 通过

---

## 5. 风险与回滚

### 风险

- Claude JSONL 结构未来变更时，`session_id/sessionId` 字段重写逻辑需同步维护。

### 回滚

- 回滚点：撤销 `fork_claude_session` command 与前端调用分支。
- 最小回滚文件：
  - `src/features/kanban/utils/contextMode.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/services/tauri.ts`
  - `src-tauri/src/engine/commands.rs`
  - `src-tauri/src/engine/claude_history.rs`

---

## 6. PR 说明建议（可直接用）

- 支持 Claude Code 看板“继承当前”能力。
- 新增 Claude session fork 端到端链路（Frontend invoke + Tauri command + JSONL clone/rewrite）。
- 保持 Codex 行为不变，补齐单测与 typecheck。
