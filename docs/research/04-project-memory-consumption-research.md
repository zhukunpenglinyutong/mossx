# CodeMoss 项目记忆消费机制研究

**文档类型**: 技术调研
**更新时间**: 2026-02-10
**状态**: 调研完成，方案已确认（待实施）

---

## 1. 问题定义

当前记忆模块已完成 **采集 → 存储** 闭环，但 **消费（AI 对话时使用已有记忆）** 尚未实现。

```
采集记忆 → 存储记忆 → ★ 消费记忆 ★ → 反馈优化
           (已完成)     (本研究)
```

核心问题：**用户与 AI 对话时，如何让 AI 知道项目已有的记忆（上下文、决策、已知问题等）？**

---

## 2. 当前消息发送架构分析

### 2.1 消息流路径

```
用户输入文本
    │
    ▼
useThreadMessaging.ts
  ├── expandCustomPromptText(text)     ← 自定义 prompt 展开
  ├── finalText = expanded text
  │
  ├── Claude 引擎路径 (line ~312):
  │     engineSendMessageService(workspaceId, {text: finalText, ...})
  │         │
  │         ▼
  │     engine_send_message (Rust Command)
  │         │
  │         ▼
  │     claude.rs → build_message_content()
  │         │
  │         ▼
  │     Claude CLI (claude -p) ← 自带 CLAUDE.md 系统 prompt
  │
  └── Codex 引擎路径 (line ~404):
        sendUserMessageService(...)
            │
            ▼
        Codex API 调用
```

### 2.2 关键发现

1. **CodeMoss 应用层无显式 system prompt 注入** — Claude 路径当前仅透传 `text`，未在应用层拼装 system message；workspace 侧 `CLAUDE.md` 由 CLI 机制读取。
2. **自定义 prompt 展开已存在** — `expandCustomPromptText()` 在 `useThreadMessaging.ts` 中将 `/prompt` token 展开为实际内容。
3. **消息文本在前端构造后直传后端** — 后端 `engine_send_message` 接收 `text` 参数直接传给 Claude CLI。
4. **workspace 路径作为工作目录传递** — Claude CLI 在该目录下运行，自动获得项目上下文。

---

## 3. 记忆注入方案对比

### 方案 A：前端消息注入（推荐）

在 `useThreadMessaging.ts` 的 `expandCustomPromptText` 之后、发送之前，将相关记忆注入到消息文本中。

```
用户输入: "帮我优化数据库查询"
    │
    ▼
检索相关记忆 (projectMemoryList + 关键词匹配)
    │
    ▼
构造注入文本:
  "[项目记忆上下文]
   - 已知问题：数据库连接池配置过小，高并发时超时
   - 技术决策：使用 PostgreSQL + pgBouncer
   - 项目上下文：数据量约 500 万条，主要查询是订单表

   [用户问题]
   帮我优化数据库查询"
    │
    ▼
发送给 AI
```

**优点**：
- 实现简单，复用现有 expandCustomPromptText 模式
- 前端完全可控，不需改后端
- 用户可见（透明）

**缺点**：
- 占用 token（注入内容消耗上下文窗口）
- 前端负责检索逻辑，增加前端复杂度
- 每次发送都需要检索

### 方案 B：后端 system message 注入

在 Rust 后端 `claude.rs` 的 `build_message_content()` 中，将记忆作为 system message 前置。

```
engine_send_message(workspaceId, text)
    │
    ▼
project_memory_list(workspaceId, relevance_filter)
    │
    ▼
system_message = format_memories(memories)
    │
    ▼
messages = [system_message, user_message]
    │
    ▼
Claude CLI
```

**优点**：
- 后端统一管理，前端无感知
- 可以做更复杂的检索逻辑（后续接全文检索/向量检索）
- 与脱敏/过滤逻辑共用 Rust 管线

**缺点**：
- 需要修改 Claude CLI 调用方式（当前是单消息模式）
- 后端与引擎耦合加深
- 调试困难（用户看不到注入了什么）

### 方案 C：Workspace CLAUDE.md 自动生成

将项目记忆导出为 workspace 级别的 CLAUDE.md（或其 include 文件），供 Claude CLI 在 workspace 中读取。

```
记忆变更时 (create/update/delete)
    │
    ▼
生成 .claude/project-memory-context.md
    │
    ▼
Claude CLI 自动加载 → AI 获得记忆上下文
```

**优点**：
- 改动面小（复用 Claude CLI 已有机制）
- 持久化，不需每次检索
- 与 Claude Code 生态完美兼容

**缺点**：
- 不是实时的（文件生成有延迟）
- 无法按对话主题智能筛选
- 文件大小有限制
- 仅适用于 Claude 引擎（Codex 不支持）

### 方案 D：混合方案（推荐长期方向）

组合方案 A + C：

1. **静态层（C）**：高 importance 的记忆自动写入 workspace `.claude/` 目录，作为持久上下文
2. **动态层（A）**：每次对话时检索与当前问题相关的记忆，注入到消息中
3. **后续演进**：动态层从关键词匹配升级为向量检索

---

## 4. 推荐实施路线（可执行版）

### 4.1 Phase 2.1（MVP：纯前端注入，不改 Rust Command）

**目标**：在发送消息前，注入高价值项目记忆，形成最小可用消费闭环。  
**边界**：只改前端，不新增 Tauri command，不改存储结构。

**代码落点**：
- `src/features/threads/hooks/useThreadMessaging.ts`
- `src/features/project-memory/services/projectMemoryFacade.ts`（可选封装）

**新增配置（前端本地）**：
- key: `projectMemory.contextInjectionEnabled`
- 默认：`true`
- 读取方式：hook 内初始化读取 localStorage；失败时回退默认值

**建议函数签名**：

```ts
// useThreadMessaging.ts
async function injectProjectMemoryContext(params: {
  workspaceId: string;
  userText: string;
  enabled: boolean;
}): Promise<string>

function formatMemoryContextBlock(items: Array<{
  kind: string;
  summary: string;
}>): string

function clampContextBudget(text: string, maxChars: number): string
```

```ts
// projectMemoryFacade.ts（可选）
async function getContextMemories(workspaceId: string): Promise<ProjectMemoryItem[]>
```

**执行流程（伪代码）**：

```text
sendMessage()
  -> expandCustomPromptText(messageText)
  -> if contextInjectionEnabled is false: return expandedText
  -> list memories by:
       workspaceId = current
       importance = "high"
       page = 0
       pageSize = 5
  -> sort by updatedAt desc (若后端已保证，可不重复排序)
  -> map each memory to one line:
       [kind-label] summary
  -> build block:
       <project-memory>
       ...lines
       </project-memory>
  -> clamp block to budget (例如 1000 chars)
  -> finalText = block + "\n\n" + expandedText
  -> continue existing send pipeline (Claude/Codex)
```

**注入格式（MVP 固定）**：

```text
<project-memory>
[已知问题] ...
[技术决策] ...
[项目上下文] ...
</project-memory>

用户原始问题...
```

**异常处理**：
- 记忆查询失败：降级为“无注入发送”，并 `console.warn`。
- 查询结果为空：不注入，保持原消息。
- localStorage 异常：回退默认启用，不阻塞发送。

### 4.2 Phase 2.2（增强：相关性检索 + 设置下沉）

**目标**：减少噪声，提升命中率与可控性。

**改动方向**：
1. 在 `settings.json` 正式增加 `contextInjectionEnabled`。
2. 引入关键词相关性排序（可先前端实现，再考虑后端 command）。
3. 查询条件从“仅 high”升级为“high 优先 + query 匹配 top N”。

### 4.3 Phase 2.3（远期：语义检索）

1. 记忆入库时生成 embedding。
2. 用户 query 生成 embedding。
3. 向量相似度召回 + importance 重排。
4. 根据部署形态选择本地模型或 API 服务。

### 4.4 验收标准（Phase 2.1）

1. 开关开启时：发送文本前可看到 `<project-memory>` 前缀被拼入最终消息。
2. 开关关闭时：发送文本与当前行为一致（零行为回归）。
3. 记忆接口失败时：消息仍能正常发送。
4. Claude/Codex 两条路径均可工作。

### 4.5 回滚方案

1. 保留注入逻辑在单函数中（`injectProjectMemoryContext`）。
2. 通过开关一键禁用（不需要回滚数据库/后端）。
3. 如需彻底回滚，仅移除调用点并删除本地开关读取逻辑。

---

## 5. Token 预算控制

记忆注入会消耗 AI 的上下文窗口，需要严格控制：

| 参数 | 建议值 | 说明 |
|------|--------|------|
| 最大注入记忆条数 | 5 条 | 避免过多干扰 |
| 单条记忆最大字符 | 200 字符 | 使用 summary 而非 detail |
| 注入总字符上限 | 1000 字符 | 约 250-500 token |
| 注入策略 | importance=high 优先 | 其次按 updatedAt 倒序 |
| 用户控制 | Phase 2.1 前端本地开关 | `contextInjectionEnabled`（Phase 2.2 再下沉 settings） |

---

## 6. 风险与约束

1. **Token 消耗**：注入记忆占用上下文窗口，需要预算控制。
2. **噪声干扰**：不相关的记忆注入会降低 AI 回答质量。
3. **延迟**：每次发送前多一次 API 调用（检索记忆），需要缓存优化。
4. **引擎差异**：Claude 和 Codex 引擎的上下文注入方式可能不同。
5. **隐私**：注入的记忆内容会被发送到 AI 服务，需遵循脱敏规则。

---

## 7. 已确认决策（Phase 2.1）

1. **注入位置**：采用前端注入（方案 A），不改 Rust Command。
2. **触发时机**：默认自动注入，保留 workspace 级开关可一键关闭。
3. **注入格式**：固定使用 `<project-memory>` 标签块。
4. **可见性策略**：用户可见注入结果，UI 默认折叠显示“已注入 N 条记忆”，支持展开查看明细。

---

## 8. 质量护栏（Phase 2.1 必做）

### 8.1 Relevance Gate（相关性闸门）

目标：避免“高优先级但不相关”的记忆污染当前问题。

MVP 规则（无需向量检索）：
1. 对 `userText` 与记忆 `summary/title/tags` 做关键词归一化（小写、去标点、去停用词）。
2. 计算简单 overlap score：`hitTerms / queryTerms`。
3. 仅注入 score ≥ `0.2` 的候选；若全量低于阈值，则不注入。
4. 排序：`importance(desc) -> relevance(desc) -> updatedAt(desc)`。

### 8.2 Deterministic Budget（确定性预算裁剪）

目标：在不同机器/会话中保证注入输出稳定可复现。

执行顺序（固定）：
1. 单条裁剪：每条记忆先裁到 `maxItemChars=200`。
2. 总量裁剪：累计到 `maxTotalChars=1000` 立即停止。
3. 裁剪标记：若发生裁剪，在块头追加 `truncated=true`。
4. 稳定输出：排序后再拼接，禁止依赖非稳定迭代顺序。

建议注入头部格式：

```text
<project-memory source="project-memory" count="3" truncated="false">
[已知问题] ...
[技术决策] ...
[项目上下文] ...
</project-memory>
```

### 8.3 Observability（可观测性）

目标：可追踪“是否注入、注入了多少、为何没注入”。

前端埋点/日志最小集合：
1. `injected_count`
2. `injected_chars`
3. `retrieval_ms`
4. `disabled_reason`（`switch_off` / `empty_result` / `low_relevance` / `query_failed`）

日志约束：
1. 默认只记录统计，不打印完整记忆正文（避免隐私泄漏）。
2. 开发模式可开启 debug 输出（受开关控制）。

---

## 9. 增强验收标准（补充）

在原 4 条验收标准基础上，新增：
1. 当相关性不足时，系统应选择“不注入”而非强行注入。
2. 同一输入在同一记忆集下，注入结果顺序与内容稳定一致。
3. 可以在日志/埋点中定位本次是否注入以及未注入原因。
