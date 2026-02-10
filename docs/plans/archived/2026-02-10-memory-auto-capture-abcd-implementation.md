# Memory Auto Capture ABCD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把自动记忆采集从“仅输入快照”升级为“输入+输出压缩融合”的回合级记忆。

**Architecture:** 在 `composer_send` 保留输入侧自动采集（A），新增 Assistant 完成后的输出压缩（B），并用 `memoryId` 回写合并（C）。状态通过 `useThreads` 内的 `ref` 维护，避免渲染状态污染；最后用单测+类型检查+后端单测做交叉校验（D）。

**Tech Stack:** React Hooks, Tauri invoke, Rust backend commands, Vitest, Cargo test

---

## Scope Lock（本轮边界）

本轮只交付 ABCD 闭环（输入采集 -> 输出压缩 -> 融合写入 -> 验证）。  
不在本轮强制落地的项：Fingerprint 算法替换、脱敏规则扩展、存储层演进（保留在 Phase 1.5）。

### Task 0: 前置加固（最小阻塞项）

> 仅保留会直接导致 ABCD 失效的 P0 项，其他优化放后续。

**Files:**
- Modify: `src-tauri/src/project_memory.rs`
- Modify: `src/features/threads/hooks/useThreadMessaging.ts`

**Step 1: Claude 引擎路径补齐自动采集（P0）**

- `useThreadMessaging.ts` 中 Claude 引擎路径当前未调用 `projectMemoryCaptureAutoService`。
- 需在 Claude 引擎的消息发送逻辑中同步接入自动采集，与 Codex 路径（~line 418）保持一致。
- 否则 Task 1 的 `onInputMemoryCaptured` 回调对 Claude 用户无效，ABCD 功能半残。

**Step 2: 错误可观测性（P0）**

- `useThreadMessaging.ts` ~line 424 的 `.catch(() => {})` 改为 `.catch((err) => console.warn('[project-memory] auto capture failed:', err))`。
- Task 3 的 merge handler 中也需要同样的日志兜底，避免写入失败完全静默。

---

### Task 1: A 输入采集确权与关联键（input side）

> **前置依赖**: Task 0 Step 2（Claude 引擎补齐）必须先完成，否则本 Task 的回调仅 Codex 引擎生效。

**Files:**
- Modify: `src/features/threads/hooks/useThreadMessaging.ts`
- Modify: `src/features/threads/hooks/useThreads.ts`

**Step 1: 定义 pending capture 数据结构**

- 在 `useThreads.ts` 新增：
  - `type PendingMemoryCapture = { workspaceId; threadId; turnId; inputText; memoryId; createdAt; }`
  - `const pendingMemoryCaptureRef = useRef<Record<string, PendingMemoryCapture>>({})`

**Step 2: 暴露输入侧回调给 messaging hook**

- 在 `useThreadMessaging` 新增可选回调参数：
  - `onInputMemoryCaptured?(payload: { workspaceId; threadId; turnId; inputText; memoryId | null; }): void`
- `projectMemoryCaptureAuto` 成功后触发该回调。

**Step 3: 在 useThreads 接住并落入 ref**

- 在 `useThreads` 传入 `onInputMemoryCaptured`。
- 回调里更新 `pendingMemoryCaptureRef.current[threadId] = payload`。
- 只保留最新一条，保证幂等。

### Task 2: B 输出压缩器（assistant side）

**Files:**
- Create: `src/features/project-memory/utils/outputDigest.ts`
- Test: `src/features/project-memory/utils/outputDigest.test.ts`

**Step 1: 新增纯函数压缩器**

- 导出 `buildAssistantOutputDigest(text: string)`。
- 行为：
  - 清洗 markdown 符号/多空行/代码块噪声。
  - 提取前若干核心句生成 `summary`。
  - 生成 `detail`（截断到上限，避免过长）。
  - 生成 `title`（基于第一句/关键词）。
  - 无效文本返回 `null`。

**Step 2: 写失败优先单测**

- 覆盖：
  - 空文本 -> `null`
  - 纯噪声 -> `null`
  - 正常回复 -> `{ title, summary, detail }`
  - 混合代码块长文本 -> 截断且保留关键句

### Task 3: C 回合融合写入（merge/update）

> **前置依赖**: Task 0 Step 1（并发写入保护）必须先完成，否则 merge write 的 update + create 与自动采集的 write 可能产生竞态覆盖。

**Files:**
- Modify: `src/features/threads/hooks/useThreadItemEvents.ts`
- Modify: `src/features/threads/hooks/useThreadEventHandlers.ts`
- Modify: `src/features/threads/hooks/useThreads.ts`

**Step 1: 给 item-completed 注入外部回调**

- 在 `useThreadItemEvents` 增加可选参数：
  - `onAgentMessageCompletedExternal?(payload: { workspaceId; threadId; itemId; text; }): void`
- 在内部 `onAgentMessageCompleted` 尾部调用该回调。

**Step 2: 在 useThreads 实现 merge handler**

- 从 `pendingMemoryCaptureRef` 读取 thread 对应输入采集。
- 对 assistant 文本执行 `buildAssistantOutputDigest`。
- 若 digest 为空则跳过并清理 pending。

**Step 3: 优先 update，失败回退 create**

- 若有 `memoryId`：
  - `projectMemoryUpdate(memoryId, workspaceId, { kind: "conversation", title, summary, detail, importance })`
- 若无 `memoryId` 或 update 失败：
  - `projectMemoryCreate({ workspaceId, kind: "conversation", title, summary, detail, threadId, messageId, source: "assistant_output_digest" })`

**Step 4: 合并细则**

- `detail` 合并结构：
  - `用户输入：<input>`
  - `助手输出摘要：<summary>`
  - `助手输出要点：<detail>`
- `importance`：默认 `medium`（后续再接规则升级）
- 成功/失败都清理 pending，防止重复写入
- **错误处理**：merge handler 中 update 和 create 都失败时，必须 `console.warn` 记录诊断日志（含 threadId、memoryId、错误信息），不能 `.catch(() => {})` 静默吞掉

### Task 4: D 交叉验证（本轮）

**Files:**
- Create: `src/features/project-memory/utils/outputDigest.test.ts`
- Modify: `src/features/threads/hooks/useThreadItemEvents.test.ts`

**Step 1: 扩展 hook 单测**

- 验证 `onAgentMessageCompletedExternal` 会被调用且参数正确。
- 验证 Claude 引擎路径和 Codex 引擎路径都能触发 `onInputMemoryCaptured`。

**Step 2: 执行验证命令**

- `npm run -s typecheck`
- `npx vitest run src/features/project-memory/utils/outputDigest.test.ts src/features/threads/hooks/useThreadItemEvents.test.ts`
- `cargo test project_memory --manifest-path src-tauri/Cargo.toml`

**Expected:**
- TypeScript 无类型错误
- 目标测试全部通过
- Rust `project_memory` 相关测试通过

### Task 5: 文档回写

**Files:**
- Modify: `docs/research/01-project-memory-design.md`

**Step 1: 更新能力定义**

- 把自动采集改为“输入采集 + 输出压缩融合”。

**Step 2: 更新约束与边界**

- 明确当前压缩器为规则版，后续可替换为 LLM 版（可插拔）。

---

## Rollback Plan

1. 仅回退新增的 assistant merge 路径，保留原输入侧采集。
2. 删除 `outputDigest` 相关调用，恢复到 `project_memory_capture_auto` 单点路径。
3. 通过现有 `project_memory` 列表查询确认无写入异常。

---

## Done Definition（交付判定）

1. 同一轮对话能产出 1 条融合记忆（含“输入 + 输出摘要”）。
2. Codex/Claude 两条引擎路径都能触发自动采集。
3. 空输出/噪声输出不会写入脏记忆。
4. 所有验证命令通过且无新增类型错误。
