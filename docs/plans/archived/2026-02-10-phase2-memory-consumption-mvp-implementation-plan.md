# Phase 2.1 实施计划：项目记忆消费注入 MVP

> 创建：2026-02-10
> 来源：`docs/research/04-project-memory-consumption-research.md`（已确认版）
> 状态：待执行

---

## 1. 目标

在不改 Rust command 与存储结构的前提下，完成“发送前注入项目记忆上下文”的最小闭环，并满足双引擎（Claude/Codex）一致行为。

---

## 2. 范围与非范围

### 2.1 In Scope（本次必须做）

1. 前端发送链路注入：`useThreadMessaging.ts`。
2. 本地开关：`projectMemory.contextInjectionEnabled`（默认 `true`）。
3. 相关性闸门（关键词 overlap）。
4. 预算裁剪（单条 + 总量，确定性顺序）。
5. 可观测性日志字段：`injected_count` / `injected_chars` / `retrieval_ms` / `disabled_reason`。
6. 基础测试与回归验证（至少覆盖关键纯函数与开关行为）。

### 2.2 Out of Scope（本次不做）

1. Rust 后端 system message 注入。
2. settings.json 下沉 `contextInjectionEnabled`。
3. embedding / 向量检索。
4. UI 调试面板（仅先做日志可观测）。

---

## 3. 设计约束（执行铁律）

1. Fail-Open：任意注入异常不得阻塞消息发送。
2. Precision First：低相关结果允许“不注入”。
3. Deterministic：同输入 + 同记忆集 => 同注入输出。
4. Zero Regression：开关关闭时行为与当前版本一致。

---

## 4. 实施步骤

## Step A：发送链路接入注入函数

改动文件：`src/features/threads/hooks/useThreadMessaging.ts`

1. 在 `expandCustomPromptText()` 之后接入 `injectProjectMemoryContext()`。
2. 仅在 `enabled === true` 时执行检索与注入。
3. 注入失败降级为原始 `expandedText`，并记录 `disabled_reason=query_failed`。

## Step B：实现注入管线（纯函数优先）

改动文件：`src/features/threads/hooks/useThreadMessaging.ts`（或拆分到 utils）

1. `normalizeQueryTerms(userText)`：归一化 query terms。
2. `scoreMemoryRelevance(memory, queryTerms)`：计算 overlap score。
3. `selectContextMemories(memories, queryTerms)`：按
`importance(desc) -> relevance(desc) -> updatedAt(desc)` 选 TopN。
4. `clampContextBudget(lines, limits)`：先单条裁剪，再总量裁剪。
5. `formatMemoryContextBlock(result)`：输出
`<project-memory source="project-memory" count="N" truncated="bool">`。

## Step C：封装数据读取

改动文件：`src/features/project-memory/services/projectMemoryFacade.ts`

1. 新增 `getContextMemories(workspaceId)`（或在现有 list 基础上封装）。
2. 默认过滤 `importance=high`，`pageSize=20`（供相关性再筛）。
3. 保留调用层重排能力，不在 facade 中做强耦合业务逻辑。

## Step D：可观测性

改动文件：`src/features/threads/hooks/useThreadMessaging.ts`

1. 输出结构化 `console.debug/console.warn`（开发环境）。
2. 字段包含：
`injected_count`, `injected_chars`, `retrieval_ms`, `disabled_reason`。
3. 默认不输出记忆正文。

## Step E：测试与回归

改动文件：
- `src/features/threads/hooks/useThreadMessaging.test.tsx`（若存在则扩展）
- 或新增：`src/features/threads/hooks/__tests__/memoryInjection.test.ts`

最小测试集：
1. 开关关闭：不注入。
2. 相关性不足：不注入。
3. 预算超限：发生裁剪且 `truncated=true`。
4. 查询异常：降级发送。
5. 排序稳定性：重复运行结果一致。

---

## 5. 验收标准（DoD）

1. Claude/Codex 两条发送路径都能收到正确 `finalText`。
2. 关闭开关时，与当前行为字节级等价（无注入前缀）。
3. 注入块格式稳定，包含 `count/truncated`。
4. 任意异常均不影响发送成功。
5. 关键测试通过，`npm run typecheck` 通过。

---

## 6. 风险与缓解

1. 噪声注入风险：阈值默认 `0.2`，低于阈值不注入。
2. 首 token 延迟：先不引入缓存，记录 `retrieval_ms` 后再决策优化。
3. 引擎行为差异：验收时分别走 Claude/Codex 手工回归。

---

## 7. 回滚方案

1. 软回滚：将 `projectMemory.contextInjectionEnabled=false`。
2. 代码回滚：移除 `injectProjectMemoryContext()` 调用点。
3. 本次无数据结构变更，无需数据库/文件迁移回滚。

---

## 8. 里程碑与工时预估

1. M1（0.5d）：注入主流程 + 格式化 + fail-open。
2. M2（0.5d）：相关性闸门 + 预算裁剪 + 观测日志。
3. M3（0.5d）：测试补齐 + 双引擎回归 + 文档更新。

总计：约 1.5 人天。

---

## 9. 实施后文档同步清单

1. 更新 `docs/research/04-project-memory-consumption-research.md` 状态为“Phase 2.1 实施中/已完成”。
2. 在 `docs/research/00-project-memory-feature-overview.md` §8 将“消费/注入”从缺口移除。
3. 如完成，新增 `docs/plans/archived/` 归档记录。
