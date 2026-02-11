# 记忆 Kind 自动分类修复 — 实施计划（细节打磨版）

> 创建：2026-02-11  
> 最后更新：2026-02-11  
> 目标：让 5 种 Kind（`conversation` / `project_context` / `code_decision` / `known_issue` / `note`）全部可被稳定产出，不再被硬编码吞没为 `conversation`  
> 风险等级：中档（局部重构，可回滚）  
> 执行建议：按本文件任务清单逐项落地，适配 `wf-plan-execute`

---

## 1. 背景与根因

### 1.1 现象

记忆面板 Kind 筛选中长期只有 `conversation` 有数据，其它类型几乎为空。

### 1.2 根因链路（双重硬编码）

```text
用户消息
  -> Rust captureAuto:
       kind = "note"                  // 硬编码 #1（未接入 classify_kind）
  -> TS mergeMemoryFromPendingCapture:
       kind = "conversation"          // 硬编码 #2（无条件覆写）
       importance = "medium"          // 同时覆写重要性
  -> 最终落盘：kind 基本固定 conversation
```

### 1.3 关键证据（代码位点）

- `src-tauri/src/project_memory.rs`：`classify_kind()` 已存在但未接入主链路
- `src-tauri/src/project_memory.rs`：`captureAuto` 里 `kind: "note".to_string()`
- `src/features/threads/hooks/useThreads.ts`：merge update/create 路径写死 `kind: "conversation"`
- `src/features/threads/hooks/useThreads.ts`：merge 路径写死 `importance: "medium"`

---

## 2. 目标、非目标、完成定义

### 2.1 目标（In Scope）

1. Rust `captureAuto` 阶段输出真实 `kind`（不再固定 `note`）。
2. TS merge 阶段基于合并文本重新分类（不再固定 `conversation`）。
3. 规则采用“加权关键词 + 阈值 + 否定词 + tiebreak”，并确保 Rust/TS 一致。
4. 提供可重复验证的测试矩阵与手测步骤。

### 2.2 非目标（Out of Scope）

1. 不引入 LLM 分类、向量检索、TF-IDF/ML 训练。
2. 不改 UI 交互形态（面板展示逻辑保持不变）。
3. 不做历史数据迁移脚本（仅影响新增/更新记忆）。

### 2.3 完成定义（Definition of Done）

1. 新增记忆可稳定落到 5 类中的合理类别，且 `conversation` 不再“全量吞并”。
2. Rust/TS 对同样输入的分类结果一致（允许 `note -> conversation` 的 merge 升级差异）。
3. 单测 + 集成测试 + 手测全部通过。
4. 文档中每个任务都有输入、动作、输出、验收标准、回滚锚点。

---

## 3. 分类规则唯一真源（Single Source of Truth）

### 3.1 分类流程

1. **阶段一（Rust capture）**：基于用户输入初判 `kind`。  
2. **阶段二（TS merge）**：基于“用户输入 + 助手输出”的合并文本复判 `kind`。  
3. 若阶段二结果为 `note`，升级为 `conversation`（因为该条本质是对话记忆）。

### 3.2 评分机制

1. 每个 kind 维护三层信号：强（3）/中（2）/弱（1）。
2. 同一层级命中多个词组只计一次（防止重复刷分）。
3. 命中否定词则该 kind 本轮不计分。
4. 分数低于阈值不入选。
5. 多类命中时取最高分；并列时按优先级：  
   `known_issue > code_decision > project_context`

### 3.3 conversation 与 note 的边界

1. `note`：分类算法 fallback（信息不足）。  
2. `conversation`：只在 merge 阶段由 `note` 升级产生，或明确命中会话型策略（若后续扩展）。

### 3.4 规则一致性约束

1. Rust 与 TS 规则表字段必须同构（kind/signals/negations/threshold）。
2. 任一侧新增关键词时，另一侧必须同 PR 同步。
3. 必须保留“规则一致性测试样例集”（见第 5 节测试矩阵）。

---

## 4. 实施任务分解（可执行清单）

### 任务 A：Rust 分类器升级并接入 capture

**文件**
- `src-tauri/src/project_memory.rs`

**输入**
- 现有 `classify_kind()` 与 `captureAuto` 链路

**动作**
1. 重写 `classify_kind()` 为加权打分模型。
2. `captureAuto` 中把 `kind: "note".to_string()` 改为 `kind: classify_kind(&clean_text)`。
3. 保留/复用 `classify_importance()`，避免行为回退。

**输出**
- Rust 侧可产出非 `note` 的初始 kind。

**验收**
- 编译通过；Rust 单测通过。
- 给定问题文本能落到 `known_issue`，而非固定 `note`。

**回滚锚点**
- 仅回滚 `classify_kind()` 与 `captureAuto` 相关 diff。

---

### 任务 B：TS 分类器落地（与 Rust 对齐）

**文件**
- 新增 `src/features/project-memory/utils/classifyKind.ts`
- 新增 `src/features/project-memory/utils/classifyKind.test.ts`

**输入**
- 第 3 节规则与 Rust 逻辑

**动作**
1. 实现 `classifyKind(text)` 与 `classifyImportance(text)`。
2. 规则命名与字段对齐 Rust（便于审查与扩展）。
3. 写测试覆盖：双语、否定词、阈值、并列分数、空文本。

**输出**
- TS 端在不增加 IPC 的前提下完成 merge 阶段复判。

**验收**
- `vitest` 定向测试通过。
- 与 Rust 样例集对齐（见第 5 节）。

**回滚锚点**
- 删除新增分类器文件并恢复 merge 旧逻辑（仅应急使用）。

---

### 任务 C：merge 写入去硬编码

**文件**
- `src/features/threads/hooks/useThreads.ts`

**输入**
- merge update/create 两条写入路径

**动作**
1. 导入 TS 分类函数。
2. update 路径：`kind/importance` 改为动态计算。
3. create 路径：同样动态计算，保证路径一致。
4. `note` 分类结果在 merge 阶段升级为 `conversation`。

**输出**
- 最终写入不再固定 `conversation`。

**验收**
- 集成测试不再断言固定 kind。
- 合并后详情含 error/decision/context 信号时，kind 与预期一致。

**回滚锚点**
- 单文件回滚 `useThreads.ts` 到改造前版本。

---

### 任务 D：端到端验证与发布前检查

**动作**
1. 执行构建与测试命令。
2. 按手测样例验证面板筛选。
3. 核对上下文注入标签随 kind 变化正常。

**输出**
- 发布前验证记录（命令结果 + 手测结果）。

**验收**
- 5 类 Kind 均可在面板筛选中看到数据。
- 无明显性能回退（本地分类应在毫秒级）。

---

## 5. 最小测试矩阵（必须覆盖）

| ID | 输入样例 | 预期 kind | 说明 |
|---|---|---|---|
| K1 | `The API returned error 500 with stack trace` | `known_issue` | 英文问题强信号 |
| K2 | `接口报错了，出现空指针异常` | `known_issue` | 中文问题强信号 |
| K3 | `There was no error after retry` | `note`（merge 后可升 `conversation`） | 否定词抑制 |
| K4 | `We decided to use React instead of Vue` | `code_decision` | 决策类 |
| K5 | `项目使用 Vue3 + Vite + TypeScript` | `project_context` | 项目上下文 |
| K6 | `你好，帮我写个排序算法` | `note`（merge 后升 `conversation`） | 泛对话 |
| K7 | 空字符串/噪声文本 | `note` | fallback |
| K8 | 同时含 issue+decision 词 | 最高分或按优先级 tiebreak | 冲突裁决 |

### 5.1 命令清单

```bash
# 规则一致性合同测试（PR 必跑）
npm run test:memory-kind-contract

# Rust
cd src-tauri && cargo test

# TS 分类器
npx vitest run src/features/project-memory/utils/classifyKind.test.ts

# 相关集成（按项目现有测试名调整）
npx vitest run src/features/threads/hooks/useThreads.memory-race.integration.test.tsx

# 构建
cd src-tauri && cargo build
cd .. && pnpm build
```

---

## 6. 风险、监控与回滚

### 6.1 主要风险

1. Rust/TS 规则漂移导致同文本分类不一致。
2. 关键词过宽导致误报（尤其 `known_issue`）。
3. merge 逻辑改造触发竞态路径回归。

### 6.2 失败信号

1. Kind 再次集中到单一类别（分布异常）。
2. 集成测试出现写入覆盖/竞态失败。
3. 手测时筛选无数据或标签错位。

### 6.3 回滚策略

1. 优先局部回滚 `useThreads.ts` 的动态分类改动，保留 Rust 初判。
2. 若问题来自规则本身，回滚规则表到上一稳定版本。
3. 保持数据结构不变，避免落盘格式回滚成本。

---

## 7. 里程碑与交付物

1. M1：Rust 分类器接入完成 + Rust 单测通过。  
2. M2：TS 分类器与测试完成 + 与 Rust 样例一致。  
3. M3：merge 去硬编码完成 + 集成测试通过。  
4. M4：端到端验证通过 + 形成发布说明/commit。

---

## 8. 提交建议（可直接使用）

```bash
git add src-tauri/src/project_memory.rs \
        src/features/project-memory/utils/classifyKind.ts \
        src/features/project-memory/utils/classifyKind.test.ts \
        src/features/threads/hooks/useThreads.ts \
        docs/plans/2026-02-11-memory-kind-classification-fix.md

git commit -m "feat(memory): activate kind auto-classification with weighted scoring"
```
