# CodeMoss 项目记忆功能设计方案（活文档）

**文档类型**: 技术设计方案
**更新时间**: 2026-02-10
**状态**: Phase 1 全部落地，Phase 2/3 待推进

---

## 1. 目标与边界

### 1.1 目标

实现按 Workspace 隔离的项目记忆，支持可管理与可检索。

### 1.2 非目标（当前阶段）

- 不做语义向量检索
- 不做自动生命周期迁移
- 不做复杂多后端运行时切换

---

## 2. 数据模型（代码事实）

```typescript
ProjectMemoryItem {
  id, workspaceId, kind, title, summary, detail,
  rawText, cleanText, tags, importance,
  threadId, messageId, source, fingerprint,
  createdAt, updatedAt, deletedAt,
  workspaceName?, workspacePath?
}

ProjectMemorySettings {
  autoEnabled, captureMode, dedupeEnabled,
  desensitizeEnabled, workspaceOverrides
}
```

---

## 3. API（8 个 Tauri Command）

- `project_memory_get_settings`
- `project_memory_update_settings`
- `project_memory_list`
- `project_memory_get`
- `project_memory_create`
- `project_memory_update`
- `project_memory_delete`
- `project_memory_capture_auto`

---

## 4. ABCD 自动采集闭环（已实现）

### A. 输入采集确权

- 双引擎覆盖（Claude + Codex）
- 触发：`useThreadMessaging.ts`
- 通过 `onInputMemoryCaptured` 回调传递 `memoryId` 至 `useThreads`
- 错误路径 `console.warn("[project-memory]")`

### B. 输出压缩器（规则版，可插拔）

- `buildAssistantOutputDigest(text) → OutputDigest | null`
- markdown 噪声清洗 → 句子拆分 → title/summary/detail 提取
- 纯函数边界，后续可替换为 LLM summarizer

### C. 融合写入

- `handleAgentMessageCompletedForMemory`
- 事件链：`useThreadItemEvents` → `useThreadEventHandlers` → `useThreads`
- update 优先 + create 降级兜底
- detail 合并：`用户输入 + 助手输出摘要 + 助手输出`

### D. 交叉验证

- typecheck 零错误 + vitest 12/12 + cargo test 63/63

---

## 5. UI 交互设计（Modal-First）

- 点击 Memory Tab → 自动打开全屏管理弹窗
- 弹窗内：搜索/筛选 + 列表/详情 + 创建/分页
- Header：标题 + 刷新 + 设置 + 关闭
- 关闭弹窗 → 自动切回 Git Tab

---

## 6. Phase 规划

### Phase 1.5（加固项，全部已完成）

1. ~~并发写入保护~~：✅ `static Mutex<()>` + `with_file_lock()`
2. ~~Fingerprint 稳定化~~：✅ SHA-256 截断 128 bit + legacy 双检
3. ~~Claude 引擎路径补齐~~：✅ 双引擎覆盖
4. ~~基线测试补全~~：✅ 63 条 Rust 测试
5. ~~脱敏规则扩展~~：✅ 10 条 regex + 1 条兜底规则

### Phase 2（增强）

1. **记忆落盘结构改造**：按项目分文件夹 + 按天分桶（→ 归档 plan：`plans/archived/2026-02-10-memory-storage-restructure.md`）
2. **记忆消费/注入机制**：AI 对话时自动检索并注入 context（→ 调研：`04-project-memory-consumption-research.md`）
3. 导入/导出
4. 批量操作
5. 标签体验优化（多值/快捷筛选）
6. Kind/Importance 标签 i18n 国际化

### Phase 3（结构化演进）

1. 后端 provider 抽象（可插拔）
2. SQLite provider
3. 评估全文检索

---

## 7. 实施状态矩阵

| 能力项 | 状态 |
|---|---|
| 输入自动采集（Codex） | ✅ |
| 输入自动采集（Claude） | ✅ |
| 输出压缩（规则版，可插拔） | ✅ |
| 输入输出融合写入 | ✅ |
| 并发写入保护 | ✅ |
| Fingerprint 稳定算法 | ✅ |
| 脱敏规则扩展 | ✅ |
| ABCD 测试闭环 | ✅ |
| UI Modal-First 模式 | ✅ |
| 存储结构改造 | ✅ 已完成（项目分目录 + 按天分桶 + 迁移） |
| 记忆消费/注入 | 📋 调研完成 |

---

## 8. 风险控制

1. 不改动现有 workspace 主链路
2. 记忆模块改动保持局部收敛
3. 新功能先补测试再扩展能力
4. ~~并发安全~~：✅ 已解决
5. ~~引擎覆盖~~：✅ 已解决
6. ~~错误可观测性~~：✅ 已解决

---

## 9. 可插拔演进原则

1. **压缩器可替换**：纯函数 `(text: string) → OutputDigest | null`，调用方零改动
2. **采集-融合解耦**：回调链传递，不绑定具体存储实现
3. **存储适配层**：`project_memory_*` command 作为稳定 contract，后续可挂接多 provider
