# CodeMoss 项目记忆模块 — 架构设计图

**文档类型**: 架构设计
**更新时间**: 2026-02-10
**基准**: 基于当前分支代码生成，Phase 1 全部完成

---

## 1. 系统全景图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CodeMoss Desktop App                          │
│                                                                             │
│  ┌─────────────────────────── Frontend (React) ──────────────────────────┐  │
│  │                                                                       │  │
│  │  ┌──────────────┐   ┌────────────────────┐   ┌───────────────────┐   │  │
│  │  │  PanelTabs   │──▶│ ProjectMemoryPanel │   │ useThreadMessaging│   │  │
│  │  │  (Tab 入口)   │   │  (管理弹窗 UI)     │   │  (消息发送 hook)  │   │  │
│  │  └──────────────┘   └────────┬───────────┘   └─────────┬─────────┘   │  │
│  │                              │                         │              │  │
│  │                    ┌─────────▼──────────┐    ┌─────────▼──────────┐   │  │
│  │                    │  useProjectMemory  │    │ Auto Capture Flow  │   │  │
│  │                    │  (CRUD/筛选/分页)   │    │ (ABCD Pipeline)    │   │  │
│  │                    └─────────┬──────────┘    └─────────┬──────────┘   │  │
│  │                              │                         │              │  │
│  │                    ┌─────────▼─────────────────────────▼──────────┐   │  │
│  │                    │        projectMemoryFacade                   │   │  │
│  │                    │   (Facade 层 — 统一 API 收口)                │   │  │
│  │                    └─────────────────────┬────────────────────────┘   │  │
│  │                                          │                            │  │
│  │                    ┌─────────────────────▼────────────────────────┐   │  │
│  │                    │        tauri.ts (Tauri invoke 封装)          │   │  │
│  │                    └─────────────────────┬────────────────────────┘   │  │
│  └──────────────────────────────────────────┼────────────────────────────┘  │
│                                              │ IPC (Tauri invoke)            │
│  ┌──────────────────────────────────────────┼──────────────────────────────┐│
│  │                     Backend (Rust / Tauri)│                              ││
│  │                    ┌─────────────────────▼────────────────────────┐     ││
│  │                    │      lib.rs (Tauri Command 注册)             │     ││
│  │                    └─────────────────────┬────────────────────────┘     ││
│  │                                          │                              ││
│  │                    ┌─────────────────────▼────────────────────────┐     ││
│  │                    │   project_memory.rs (~1483 行)               │     ││
│  │                    │                                              │     ││
│  │                    │  ┌─ Mutex<()> + with_file_lock() ────────┐  │     ││
│  │                    │  │  8 个 Tauri Command (CRUD/设置/采集)   │  │     ││
│  │                    │  └───────────────────────────────────────┘  │     ││
│  │                    │                                              │     ││
│  │                    │  ┌─ 核心处理管线 ────────────────────────┐  │     ││
│  │                    │  │  normalize_text → desensitize         │  │     ││
│  │                    │  │  → classify_kind → classify_importance│  │     ││
│  │                    │  │  → calculate_fingerprint (SHA-256)    │  │     ││
│  │                    │  │  → deduplicate → write_date_file      │  │     ││
│  │                    │  └───────────────────────────────────────┘  │     ││
│  │                    └─────────────────────┬────────────────────────┘     ││
│  │                                          │                              ││
│  │                    ┌─────────────────────▼────────────────────────┐     ││
│  │                    │   ~/.codemoss/project-memory/                │     ││
│  │                    │   ├── settings.json                          │     ││
│  │                    │   └── {workspace-slug}--{id8}/              │     ││
│  │                    │       ├── YYYY-MM-DD.json                    │     ││
│  │                    │       └── ...                                │     ││
│  │                    └──────────────────────────────────────────────┘     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 前端组件层级图

```
useLayoutNodes.tsx
  └── filePanelMode === "memory"
        └── ProjectMemoryPanel.tsx
              ├── <PanelTabs />                    ← 侧边栏 Tab 按钮
              └── {managerOpen && <Modal />}        ← 全屏管理弹窗
                    ├── Modal Header
                    │     ├── 标题 "项目记忆"
                    │     └── Actions: [刷新] [设置] [关闭]
                    ├── Toolbar
                    │     ├── 搜索输入框
                    │     ├── Kind 下拉筛选
                    │     ├── Importance 下拉筛选
                    │     └── Tag 输入筛选
                    ├── Settings Panel (可折叠)
                    │     └── Workspace 自动采集开关
                    ├── Content (grid: 38% + 62%)
                    │     ├── 左侧 List
                    │     │     └── ListItem[] (kind badge + importance + title + summary)
                    │     └── 右侧 Detail
                    │           ├── Title 编辑框
                    │           ├── Detail 编辑框
                    │           └── Actions: [保存] [删除]
                    ├── Create Area
                    │     ├── Title 输入框
                    │     ├── Detail 文本域
                    │     └── [新增] 按钮
                    ├── Pagination
                    │     └── [上一页] "1-50 of N" [下一页]
                    └── Error Display
```

---

## 3. 数据模型

```
ProjectMemoryItem {
  id:           string       // UUID
  workspaceId:  string       // workspace 隔离键
  kind:         string       // "note" | "conversation" | "project_context" | "code_decision" | "known_issue"
  title:        string       // 标题
  summary:      string       // 摘要（≤140 字符）
  detail:       string?      // 详情（可空）
  rawText:      string?      // 原始输入文本（可空）
  cleanText:    string       // 清洗后文本
  tags:         string[]     // 标签数组
  importance:   string       // "high" | "medium" | "low"
  threadId:     string?      // 关联对话线程 ID
  messageId:    string?      // 关联消息 ID
  source:       string       // 来源标识（如 "manual" | "auto" | "composer_send" | "assistant_output_digest"）
  fingerprint:  string       // SHA-256 截断 128 bit (32 hex)
  createdAt:    number       // Unix 毫秒时间戳
  updatedAt:    number       // Unix 毫秒时间戳
  deletedAt:    number?      // 软删除时间戳（Unix 毫秒）
  workspaceName:string?      // workspace 名称（可空）
  workspacePath:string?      // workspace 路径（可空）
}

ProjectMemorySettings {
  autoEnabled:        boolean          // 全局自动采集开关
  captureMode:        string           // "balanced"
  dedupeEnabled:      boolean          // 去重开关
  desensitizeEnabled: boolean          // 脱敏开关
  workspaceOverrides: Record<string, { autoEnabled: boolean }>
}
```

---

## 4. ABCD 自动采集管线

```
用户发送消息
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  A. 输入采集确权 (useThreadMessaging.ts)                        │
│                                                                  │
│  Claude 引擎路径 ──┐                                            │
│                     ├──▶ projectMemoryCaptureAuto(text)          │
│  Codex 引擎路径  ──┘     ├── Rust 后端处理:                     │
│                          │   normalize → desensitize → classify  │
│                          │   → fingerprint → deduplicate → save  │
│                          │                                       │
│                          └──▶ 返回 memoryId (或 null)            │
│                                    │                             │
│  onInputMemoryCaptured(memoryId) ◀─┘                            │
│         │                                                        │
│         ▼                                                        │
│  useThreads.ts: pendingMemoryCaptureRef[threadId] = {            │
│    workspaceId, threadId, turnId, inputText, memoryId            │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
    │
    │  (等待 assistant 回复完成)
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  B. 输出压缩器 (outputDigest.ts)                                │
│                                                                  │
│  buildAssistantOutputDigest(assistantText)                       │
│    ├── cleanMarkdown()     → 清洗 fenced code, inline code,     │
│    │                          heading, bold, list, quote, table  │
│    ├── splitSentences()    → 按句号/问号/感叹号/换行拆分          │
│    ├── extractTitle()      → 首句截断 ≤50 字符                   │
│    ├── extractSummary()    → 前 3 句截断 ≤200 字符               │
│    ├── extractDetail()     → 全文截断 ≤800 字符                  │
│    └── 返回 OutputDigest | null (无效文本返回 null)              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  C. 融合写入 (useThreads.ts → handleAgentMessageCompletedForMemory) │
│                                                                  │
│  事件链: useThreadItemEvents                                     │
│          → useThreadEventHandlers                                │
│          → useThreads (onAgentMessageCompletedExternal)          │
│                                                                  │
│  ┌─ 有 memoryId? ──────────────────────────────────────────┐    │
│  │  YES → projectMemoryUpdate(memoryId, {                  │    │
│  │          title, summary,                                 │    │
│  │          detail: "用户输入：...\n助手输出摘要：...\n     │    │
│  │                   助手输出：..."                          │    │
│  │        })                                                │    │
│  │        ├── 成功 → 清理 pending                           │    │
│  │        └── 失败 → 降级 create ──┐                        │    │
│  │                                  │                       │    │
│  │  NO ─────────────────────────────┤                       │    │
│  │                                  ▼                       │    │
│  │  projectMemoryCreate({                                   │    │
│  │    workspaceId, kind: "conversation",                    │    │
│  │    title, summary, detail, threadId, messageId,          │    │
│  │    source: "assistant_output_digest"                     │    │
│  │  })                                                      │    │
│  │        ├── 成功 → 清理 pending                           │    │
│  │        └── 失败 → console.warn 诊断日志                  │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  D. 交叉验证                                                    │
│                                                                  │
│  ├── npm run typecheck          → 零错误                        │
│  ├── vitest outputDigest.test   → 12/12 通过                    │
│  └── cargo test project_memory  → 63/63 通过                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 后端处理管线（Rust）

```
project_memory_capture_auto(text, workspaceId, threadId?, messageId?, source?)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  with_file_lock()  ← static Mutex<()> 全局锁        │
│                                                      │
│  1. normalize_text(text)                             │
│     └── 去除前后空白、压缩连续空行                    │
│                                                      │
│  2. desensitize(cleanText)  (if desensitizeEnabled)  │
│     └── 10 条 regex 模式匹配 + 1 条兜底规则:          │
│         SSH key, AWS key, GitHub token/PAT,          │
│         sk-*, JWT, Bearer, DB URL, Email,            │
│         长 base64, 兜底混合字母数字                   │
│                                                      │
│  3. classify_kind(text)                              │
│     └── 关键词匹配:                                  │
│         "error/exception/failed/bug" → known_issue     │
│         "decide/decision/architecture/tradeoff"        │
│                                 → code_decision        │
│         "project/workspace/context/stack"              │
│                                 → project_context      │
│         默认                  → note                  │
│                                                      │
│  4. classify_importance(text)                        │
│     └── "critical/urgent/security/production" → high │
│         文本长度 >= 240                     → medium  │
│         其他                                → low     │
│                                                      │
│  5. calculate_fingerprint(cleanText)                 │
│     └── SHA-256 → 截断前 128 bit → 32 hex 字符      │
│                                                      │
│  6. deduplicate(fingerprint)  (if dedupeEnabled)     │
│     └── 遍历已有记忆检查 fingerprint 冲突             │
│         + calculate_legacy_fingerprint 双检兼容       │
│                                                      │
│  7. 重复? → 返回 null (跳过写入)                      │
│     不重复? → 构造 ProjectMemoryItem                   │
│              → workspace_dir / today_str               │
│              → write_date_file                         │
│              → 返回新记忆                              │
└─────────────────────────────────────────────────────┘
```

---

## 6. 前端 API 层级

```
ProjectMemoryPanel.tsx (UI)
         │
         ▼
useProjectMemory.ts (Hook — 状态管理 + 业务逻辑)
  ├── items / total / page / selectedItem / loading / error
  ├── query / kind / importance / tag (筛选状态)
  ├── settings / workspaceAutoEnabled (设置状态)
  ├── refresh()
  ├── createMemory()
  ├── updateMemory()
  ├── deleteMemory()
  └── toggleWorkspaceAutoCapture()
         │
         ▼
projectMemoryFacade.ts (Facade — 统一 API 收口)
  ├── getSettings()
  ├── updateSettings()
  ├── list(params)
  ├── get(memoryId, workspaceId)
  ├── create(params)
  ├── update(memoryId, workspaceId, patch)
  ├── delete(memoryId, workspaceId)
  └── captureAuto(input)
         │
         ▼
tauri.ts (Tauri invoke 封装)
  ├── projectMemoryGetSettings()     → invoke("project_memory_get_settings")
  ├── projectMemoryUpdateSettings()  → invoke("project_memory_update_settings")
  ├── projectMemoryList()            → invoke("project_memory_list")
  ├── projectMemoryGet()             → invoke("project_memory_get")
  ├── projectMemoryCreate()          → invoke("project_memory_create")
  ├── projectMemoryUpdate()          → invoke("project_memory_update")
  ├── projectMemoryDelete()          → invoke("project_memory_delete")
  └── projectMemoryCaptureAuto()     → invoke("project_memory_capture_auto")
         │
         │  IPC (Tauri invoke)
         ▼
project_memory.rs (Rust Backend — 8 个 Tauri Command)
```

---

## 7. 文件清单

| 层级 | 文件 | 职责 |
|------|------|------|
| **UI** | `src/features/project-memory/components/ProjectMemoryPanel.tsx` | 管理弹窗 UI（搜索/筛选/列表/详情/创建/分页） |
| **UI** | `src/features/layout/components/PanelTabs.tsx` | 侧边栏 Tab 按钮（git/files/memory） |
| **UI** | `src/features/layout/hooks/useLayoutNodes.tsx` | 面板挂载（memory tab → ProjectMemoryPanel） |
| **UI** | `src/styles/project-memory.css` | 记忆模块样式 |
| **Hook** | `src/features/project-memory/hooks/useProjectMemory.ts` | CRUD/筛选/分页/设置状态管理 |
| **Facade** | `src/features/project-memory/services/projectMemoryFacade.ts` | 统一 API 收口 |
| **Utils** | `src/features/project-memory/utils/outputDigest.ts` | 输出压缩器（纯函数） |
| **API** | `src/services/tauri.ts` | Tauri invoke 封装 |
| **Auto Capture** | `src/features/threads/hooks/useThreadMessaging.ts` | 输入侧自动采集触发（A） |
| **Auto Capture** | `src/features/threads/hooks/useThreads.ts` | 融合写入（C）+ pending 状态管理 |
| **Auto Capture** | `src/features/threads/hooks/useThreadItemEvents.ts` | agent 消息完成事件传递 |
| **Auto Capture** | `src/features/threads/hooks/useThreadEventHandlers.ts` | 事件处理器中转 |
| **i18n** | `src/i18n/locales/en.ts` / `zh.ts` | 国际化文本 |
| **Backend** | `src-tauri/src/project_memory.rs` | 核心逻辑（CRUD/搜索/设置/采集/去重/脱敏/分类） |
| **Backend** | `src-tauri/src/lib.rs` | Tauri Command 注册 |
| **Backend** | `src-tauri/Cargo.toml` | sha2/regex 依赖 |
| **Test** | `src/features/project-memory/utils/outputDigest.test.ts` | 输出压缩器单测（12 case） |
| **Test** | `src/features/project-memory/hooks/useProjectMemory.test.tsx` | Hook 单测（3 case） |
| **Test** | `src-tauri/src/project_memory.rs` (内联测试) | Rust 单测（63 case） |

---

## 8. 未来演进方向

```
Phase 2（增强）                    Phase 3（结构化演进）
┌────────────────────┐            ┌──────────────────────┐
│ ★ 记忆消费/注入机制│            │ Provider 抽象（可插拔）│
│   导入/导出        │            │ SQLite Provider       │
│   批量操作         │    ───▶    │ 全文检索评估          │
│   标签多值筛选     │            │ 语义向量检索（远期）   │
│   Kind/Importance  │            │                       │
│   i18n 国际化      │            │                       │
└────────────────────┘            └──────────────────────┘

核心价值闭环（下一优先级）：
  采集记忆 → 存储记忆 → ★ 消费记忆 ★ → 反馈优化
             (已完成)     (待实现)
```
