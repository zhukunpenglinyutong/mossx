# 修复 note 未清理 + 每条记忆打上引擎标签

> **Claude 必读**: 使用 wf-plan-execute 实施此计划

**目标**: 修复 Claude 引擎路径下记忆 `kind` 为 `note` 未被升级为 `conversation` 的 Bug，并为每条记忆新增 `engine` 字段标识来源大模型。

**架构**: 两处改动 — (1) `classify_kind()` 默认值从 `"note"` 改为 `"conversation"`，因为 captureAuto 场景均为对话上下文；(2) 数据模型新增 `engine: Option<String>` 字段，全链路透传。

**技术栈**: Rust (Tauri backend) + TypeScript (React frontend)

---

## 一、问题诊断

### Bug 根因

`project_memory_capture_auto`（Rust）用 `classify_kind()` 对用户输入文本做关键词匹配：

```
known_issue  ← 包含 error/exception/failed/bug
code_decision ← 包含 decide/decision/architecture/tradeoff
project_context ← 包含 project/workspace/context/stack
note         ← 默认兜底（最常见）
```

融合写入（`handleAgentMessageCompletedForMemory`）会把 `note` 升级为 `conversation`，但有**竞态条件**：
- `captureAuto` 是异步 fire-and-forget
- 如果 promise 在 assistant 输出完成**之后**才 resolve，`pendingMemoryCaptureRef` 中没有 pending 数据
- 融合写入被跳过，`note` 保留

Claude 引擎回复速度快，更容易命中这个竞态。Codex 引擎因为回复链路较长，captureAuto 通常能先 resolve。

### 缺少引擎标签

当前 `source` 字段统一是 `"composer_send"` 或 `"assistant_output_digest"`，无法区分 Claude/Codex/Gemini。

---

## 二、修复方案

### 改动总览

| 步骤 | 文件 | 改动 |
|:---|:---|:---|
| S1 | `project_memory.rs` | `classify_kind()` 默认值 `"note"` → `"conversation"` |
| S2 | `project_memory.rs` | `ProjectMemoryItem` 新增 `engine: Option<String>` |
| S3 | `project_memory.rs` | `AutoCaptureInput` / `CreateProjectMemoryInput` 新增 `engine: Option<String>` |
| S4 | `project_memory.rs` | `capture_auto` / `create` 写入 engine 字段 |
| S5 | `project_memory.rs` | 更新已有单元测试 + 新增 engine 相关测试 |
| S6 | `tauri.ts` | `ProjectMemoryItem` / `captureAuto` / `create` 类型扩展 engine 字段 |
| S7 | `projectMemoryFacade.ts` | facade `captureAuto` / `create` 入参扩展 engine |
| S8 | `useThreadMessaging.ts` | 两条路径的 `captureAuto` 调用传入 `engine: activeEngine` |
| S9 | `useThreads.ts` | `PendingMemoryCapture` 扩展 engine；merge write `create`/`update` 传入 engine |
| S10 | 验证 | `cargo test` + `npx tsc --noEmit` |

### 向后兼容性

- `engine` 字段为 `Option<String>` + `#[serde(default)]`，旧数据反序列化时为 `None`
- `classify_kind` 默认值变化不影响旧数据（只影响新创建的记忆）

---

## 三、逐步实施

### S1: classify_kind 默认值修正

**文件:** `src-tauri/src/project_memory.rs:511`

**之前:**
```rust
"note".to_string()
```

**之后:**
```rust
"conversation".to_string()
```

**理由:** captureAuto 场景下所有输入都来自用户与 AI 的对话，`conversation` 语义更准确。`note` 应该保留给用户手动创建的记忆。

---

### S2: 数据模型扩展 — ProjectMemoryItem

**文件:** `src-tauri/src/project_memory.rs:41` (在 `workspace_path` 之后)

**新增:**
```rust
#[serde(default)]
pub engine: Option<String>,
```

---

### S3: 输入结构扩展

**文件:** `src-tauri/src/project_memory.rs`

**AutoCaptureInput (行 ~116, workspace_path 之后):**
```rust
pub engine: Option<String>,
```

**CreateProjectMemoryInput (行 ~93, workspace_path 之后):**
```rust
pub engine: Option<String>,
```

---

### S4: Command 写入 engine

**文件:** `src-tauri/src/project_memory.rs`

**project_memory_capture_auto (~行 890-891, workspace_path 之后):**
```rust
engine: input.engine.clone(),
```

**project_memory_create 中构建 item 时 (~行 792-793, workspace_path 之后):**
```rust
engine: input.engine.clone(),
```

---

### S5: 单元测试更新

**文件:** `src-tauri/src/project_memory.rs` (tests module)

1. 修改 `classify_kind` 相关测试：默认分支断言从 `"note"` 改为 `"conversation"`
2. 所有构建 `ProjectMemoryItem` 的测试辅助代码加 `engine: None`
3. 新增测试：验证 `classify_kind("hello world")` 返回 `"conversation"`

---

### S6: TS 类型扩展

**文件:** `src/services/tauri.ts`

**ProjectMemoryItem 类型 (~行 1022):**
```typescript
engine?: string | null;
```

**projectMemoryCaptureAuto 入参 (~行 1133):**
```typescript
engine?: string | null;
```

**projectMemoryCaptureAuto invoke 传参 (~行 1143):**
```typescript
engine: input.engine ?? null,
```

**projectMemoryCreate 入参 (~行 1068):**
```typescript
engine?: string | null;
```

**projectMemoryCreate invoke 传参 (~行 1083):**
```typescript
engine: input.engine ?? null,
```

---

### S7: Facade 扩展

**文件:** `src/features/project-memory/services/projectMemoryFacade.ts`

**captureAuto 入参 (~行 82):**
```typescript
engine?: string | null;
```

**CreateProjectMemoryParams (~行 15):**
```typescript
engine?: string | null;
```

---

### S8: useThreadMessaging 调用点传入 engine

**文件:** `src/features/threads/hooks/useThreadMessaging.ts`

**Claude 路径 captureAuto 调用 (~行 362):**
```typescript
engine: activeEngine ?? null,
```

**Codex 路径 captureAuto 调用 (~行 449):**
```typescript
engine: activeEngine ?? null,
```

**两个 onInputMemoryCaptured 回调也扩展 engine 字段:**
```typescript
engine: activeEngine ?? null,
```

**onInputMemoryCaptured 类型定义 (~行 86) 新增:**
```typescript
engine: string | null;
```

---

### S9: useThreads 融合写入传入 engine

**文件:** `src/features/threads/hooks/useThreads.ts`

**PendingMemoryCapture 类型 (~行 40) 新增:**
```typescript
engine: string | null;
```

**handleInputMemoryCaptured payload 类型新增:**
```typescript
engine: string | null;
```

**projectMemoryUpdate 调用 (~行 695) — patch 新增:**
不需要改（update 不需要传 engine，保留创建时的值）

**projectMemoryCreate 调用 (~行 721) 新增:**
```typescript
engine: pending.engine,
```

---

### S10: 验证

```bash
# Rust 单元测试
cd src-tauri && cargo test --lib project_memory

# TypeScript 类型检查
npx tsc --noEmit
```

**通过标准:** 零失败、零类型错误。

---

## 四、风险与回滚

| 风险 | 概率 | 影响 | 应对 |
|:---|:---|:---|:---|
| 旧数据 engine 为 null | 100% | 低 | `Option<String>` + `serde(default)` 向后兼容 |
| classify_kind 默认值变化 | 100% | 低 | 只影响新记忆，旧记忆不变 |
| 引擎标签值不一致 | 低 | 低 | 统一使用 `activeEngine` 枚举值 |

**回滚方案:** git revert 即可，无数据迁移。
