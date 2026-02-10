# CodeMoss 项目记忆功能全景（Phase 1 完成版）

**文档类型**: 功能全景（合并自原 00-调研总结 / 01-现状分析 / 04-适配方案）
**更新时间**: 2026-02-10
**状态**: Phase 1 全部完成（ABCD + Phase 1.5 + UI 简化），Phase 2/3 待推进

---

## 1. 结论

项目记忆功能已完成 **Phase 1 全部能力建设**：

1. 按 `workspace_id` 隔离
2. CRUD + 搜索 + 类型/优先级/标签筛选 + 分页
3. Modal-First 管理 UI（弹窗模式，含列表、详情、创建、删除、筛选、分页、刷新、设置）
4. 双引擎自动捕获（Claude + Codex）+ 输入输出融合写入（ABCD 闭环）
5. 并发保护（Mutex + file lock）
6. SHA-256 指纹去重 + 10 条 regex 脱敏规则 + 1 条兜底规则
7. 设置项（自动捕获、去重、脱敏、workspace override）
8. 63 条 Rust 测试 + 12 条压缩器单测 + 前端 hook 测试

---

## 2. 已实现能力清单

### 2.1 数据与存储

| 项 | 说明 |
|----|------|
| 记忆实体 | `ProjectMemoryItem` |
| 隔离键 | `workspace_id` |
| 存储 | `~/.codemoss/project-memory/{workspace-slug}--{id8}/YYYY-MM-DD.json`（settings 保持独立） |
| 设置 | `~/.codemoss/project-memory/settings.json` |
| 代码 | `src-tauri/src/project_memory.rs` (~1483 行) |
| 并发保护 | `static Mutex<()>` + `with_file_lock()` 包裹全部 8 个 Tauri command |

### 2.2 后端命令（8 个，均受 Mutex 保护）

- `project_memory_get_settings`
- `project_memory_update_settings`
- `project_memory_list`
- `project_memory_get`
- `project_memory_create`
- `project_memory_update`
- `project_memory_delete`
- `project_memory_capture_auto`

后端核心能力：
- 自动分类（`classify_kind`）：5 种类型
- 自动优先级（`classify_importance`）：high / medium / low
- 去重（fingerprint）：SHA-256 截断 128 bit + legacy 双检兼容
- 脱敏（`desensitize`）：`regex` + `LazyLock`（10 条模式 + 1 条兜底混合字母数字规则）
- 噪声过滤：短文本、纯空白、重复内容跳过

### 2.3 前端能力

UI 支持（Modal-First 模式）：搜索、类型筛选、优先级筛选、标签筛选、分页、新增/编辑/删除、刷新、设置。

交互：点击 Memory Tab → 自动打开管理弹窗 → 关闭弹窗自动切回 Git Tab。

### 2.4 自动采集（ABCD 闭环）

| 阶段 | 说明 | 状态 |
|------|------|------|
| A 输入采集确权 | 双引擎覆盖（Claude + Codex），`onInputMemoryCaptured` 回调传递 `memoryId` | ✅ |
| B 输出压缩器 | `buildAssistantOutputDigest(text) → OutputDigest \| null`，可插拔纯函数 | ✅ |
| C 融合写入 | `handleAgentMessageCompletedForMemory`，update 优先 + create 降级 | ✅ |
| D 交叉验证 | typecheck 零错误 + vitest 12/12 + cargo test 63/63 | ✅ |

---

## 3. 文件清单

| 层级 | 文件 | 职责 |
|------|------|------|
| **UI** | `src/features/project-memory/components/ProjectMemoryPanel.tsx` | 管理弹窗 UI |
| **UI** | `src/features/layout/components/PanelTabs.tsx` | 侧边栏 Tab 按钮 |
| **UI** | `src/features/layout/hooks/useLayoutNodes.tsx` | 面板挂载 |
| **UI** | `src/styles/project-memory.css` | 记忆模块样式 |
| **Hook** | `src/features/project-memory/hooks/useProjectMemory.ts` | CRUD/筛选/分页/设置 |
| **Facade** | `src/features/project-memory/services/projectMemoryFacade.ts` | 统一 API 收口 |
| **Utils** | `src/features/project-memory/utils/outputDigest.ts` | 输出压缩器 |
| **API** | `src/services/tauri.ts` | Tauri invoke 封装 |
| **Auto Capture** | `src/features/threads/hooks/useThreadMessaging.ts` | 输入侧自动采集触发 (A) |
| **Auto Capture** | `src/features/threads/hooks/useThreads.ts` | 融合写入 (C) + pending 管理 |
| **Auto Capture** | `src/features/threads/hooks/useThreadItemEvents.ts` | agent 消息完成事件传递 |
| **Auto Capture** | `src/features/threads/hooks/useThreadEventHandlers.ts` | 事件处理器中转 |
| **i18n** | `src/i18n/locales/en.ts` / `zh.ts` | 国际化文本 |
| **Backend** | `src-tauri/src/project_memory.rs` | 核心逻辑 |
| **Backend** | `src-tauri/src/lib.rs` | Tauri Command 注册 |
| **Backend** | `src-tauri/Cargo.toml` | sha2/regex 依赖 |
| **Test** | `src/features/project-memory/utils/outputDigest.test.ts` | 压缩器单测 (12) |
| **Test** | `src/features/project-memory/hooks/useProjectMemory.test.tsx` | Hook 单测 (3) |
| **Test** | `src-tauri/src/project_memory.rs` (内联) | Rust 单测 (47) |

---

## 4. 与原始方案的主要偏差

1. **存储层**：当前为 JSON，非 SQLite。
2. **模型字段**：包含 `rawText/cleanText/fingerprint/source/deletedAt`，与原始建议模型不完全一致。
3. **可插拔层**：尚未完成多后端 provider；当前为单实现（前端 facade 已收口）。
4. **UI 模式**：采用 Modal-First 交互（非内联面板），侧边栏仅保留 Tab 按钮。

---

## 5. 已解决的风险

| 风险项 | 原级别 | 解决方案 |
|--------|--------|----------|
| 并发写入无锁 | P0 | `static Mutex<()>` + `with_file_lock()` 包裹 8 个 command |
| 仅 Codex 引擎采集 | P0 | Claude 引擎路径已接入自动采集 |
| Fingerprint 不稳定 | P1 | SHA-256 截断 128 bit + legacy 双检兼容 |
| 脱敏覆盖窄 | P1 | `regex` + `LazyLock`（10 条模式 + 1 条兜底规则） |
| 测试基线薄 | P1 | Rust 63 条 + 压缩器 12 条 + 前端 hook 测试 |
| 错误静默吞掉 | P2 | `console.warn("[project-memory]")` 诊断日志 |

---

## 6. MemOS 设计思想借鉴（来自外部调研 → 详见 02-memos-architecture-analysis.md）

| MemOS 思路 | CodeMoss 当前映射 |
|---|---|
| 隔离单元（MemCube） | 已映射为 `workspace_id` |
| 统一操作接口 | 已实现 8 个 command |
| metadata 驱动检索 | 已实现基础字段与筛选 |
| 多层存储（图+向量） | 暂未引入（Phase 3 评估） |

**适配原则**：
1. 先可用，再复杂。
2. 先低侵入，再抽象。
3. 先测试，再扩展。
4. 先加固，再叠加。

---

## 7. 质量基线

- TypeScript `typecheck` 零错误
- 前端测试：Hook 3 用例 + 压缩器 12 用例 + Thread 事件测试
- Rust 后端测试：63 用例（含存储重构新增测试：slugify/日期分桶/迁移/跨天聚合）

---

## 8. 当前缺口（待 Phase 2/3）

1. 存储未切换 SQLite
2. 后端多 provider 可插拔未完成
3. 导入导出、批量操作未做
4. 标签体验优化（多值/快捷筛选）
5. Kind/Importance i18n 国际化（列表中显示翻译而非原始英文值）
6. 记忆消费/注入机制未实现（→ 详见 04-project-memory-consumption-research.md）
7. ~~记忆落盘结构改造~~：✅ 已完成（按项目分文件夹 + 按天分桶 + 兼容迁移）
