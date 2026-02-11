# Phase 2 路线图：项目记忆模块待落地全清单

> 创建：2026-02-10
> 来源：交叉扫描 `docs/research/` 全部文档 + `docs/plans/` 已有计划
> 状态：持续更新中（已按代码现状同步）

---

## 一、信息来源索引

| 编号 | 文件 | 提取的未落地项 |
|------|------|---------------|
| R-00 | `research/00-project-memory-feature-overview.md` §8 "当前缺口" | 7 项 |
| R-01 | `research/01-project-memory-design.md` §6 "Phase 2/3" | 9 项 |
| R-03 | `research/03-project-memory-architecture.md` §8 "未来演进方向" | 6 项 |
| R-04 | `research/04-project-memory-consumption-research.md` §4/§7 | 消费机制 3 个子阶段 + 4 个决策点 |
| P-01 | `plans/archived/2026-02-10-memory-storage-restructure.md` | 存储改造完整 plan（✅ 已归档） |
| P-02 | `plans/archived/2026-02-10-memory-auto-capture-abcd-implementation.md` | ABCD 闭环（✅ 已归档） |
| P-03 | `plans/archived/2026-02-10-fix-note-cleanup-and-engine-tag.md` | note/conversation 竞态修复 + engine 标签（✅ 已归档） |

---

## 二、去重合并后的完整待办清单

按 **业务价值 × 技术复杂度** 分为 3 个优先级梯队。

### T1 — 高优（基础设施 + 核心价值闭环）

| # | 待办项 | 来源 | 详细设计 | 状态 |
|---|--------|------|----------|------|
| **T1-1** | **记忆落盘结构改造**：单文件 → 按项目分文件夹 + 按天分桶 + 注入 workspace 元数据 | R-00§8.7, R-01§6.P2.1 | ✅ 归档 plan：`plans/archived/2026-02-10-memory-storage-restructure.md` | ✅ 已实施并归档 |
| **T1-2** | **记忆消费/注入 MVP**：AI 对话前自动检索高价值记忆，注入到消息文本 | R-00§8.6, R-01§6.P2.2, R-04§4.1 | ✅ 已实现：`memoryContextInjection.ts` + `useThreadMessaging.ts`，并通过定向测试 | ✅ 已实施 |
| **T1-3** | **Kind/Importance i18n 国际化**：列表中显示翻译标签而非原始英文值 | R-00§8.5, R-01§6.P2.6 | 无独立 plan | 📋 待设计 |

### T2 — 中优（体验增强）

| # | 待办项 | 来源 | 说明 | 状态 |
|---|--------|------|------|------|
| **T2-2** | **批量操作** | R-00§8.3, R-01§6.P2.4 | 已实现：全选、批量删除、清空全部、批量标记 importance | ✅ 已实施 |
| **T2-3** | **标签体验优化** | R-00§8.4, R-01§6.P2.5 | 已实现：多值标签筛选（逗号分隔）、快捷标签点击、输入自动完成 | ✅ 已实施 |
| **T2-4** | **消费机制决策点闭合**（4 个） | R-04§7 | 见下方§三 | ✅ 已闭合（按 Phase 2.1 实现） |

### T3 — 低优/远期（结构化演进）

| # | 待办项 | 来源 | 说明 | 状态 |
|---|--------|------|------|------|
| **T3-1** | 后端 provider 抽象（可插拔） | R-01§6.P3.1, R-03§8 | facade 已有收口，provider interface 待抽象 | 📋 远期 |
| **T3-2** | SQLite provider | R-00§8.1, R-01§6.P3.2 | 替代 JSON 文件存储 | 📋 远期 |
| **T3-3** | 全文检索 / 关键词相关性排序 | R-01§6.P3.3, R-04§4.2 | 消费注入增强（Phase 2.2 级别） | 📋 远期 |
| **T3-4** | 语义向量检索 | R-03§8, R-04§4.3 | embedding 生成 + 向量相似度召回 | 📋 远期 |

---

## 三、记忆消费机制决策点（T2-4，已闭合）

来自 `research/04-project-memory-consumption-research.md` §7：

| # | 决策点 | 调研推荐 | 结果 |
|---|--------|----------|------|
| D1 | Phase 2.1 注入位置：前端（方案 A）还是后端（方案 B）？ | **方案 A（前端注入）**：实现简单，复用 `expandCustomPromptText` 模式，不需改后端 | ✅ 前端注入 |
| D2 | 注入触发时机：每次发送都注入，还是用户手动开关？ | **每次自动 + 开关控制**：默认开启 `contextInjectionEnabled`，用户可关闭 | ✅ 已实现本地开关 |
| D3 | 注入格式：XML 标签（`<project-memory>`）还是 markdown？ | **XML 标签**：AI 识别清晰，不与用户内容混淆 | ✅ 已实现 XML 标签 |
| D4 | 是否需要用户可见注入内容（调试/透明性）？ | **Phase 2.1 不可见**（注入在发送层；Phase 2.2 可加调试面板） | ✅ 已按 Phase 2.1 落地 |

---

## 四、推荐执行顺序

```
Step 1: T1-1 存储改造 ← 已实施，先做回归验收与归档
  │
  │  （解除存储层债务，为后续功能打基础）
  ▼
Step 2: T1-3 Kind/Importance i18n ← 小改动，快速见效
  │
  ▼
Step 3: T1-2 记忆消费 MVP ← 已实施并通过定向测试
  │
  ▼
Step 4: T2-2/T2-3 ← 体验增强，按需求优先级排列
  │
  ▼
Step 5: T3-* ← 远期结构化演进，数据驱动决策
```

---

## 五、已归档的 plan

| 文件 | 状态 | 建议操作 |
|------|------|----------|
| `plans/archived/2026-02-10-memory-auto-capture-abcd-implementation.md` | ✅ 全部完成 | 已归档 |
| `plans/archived/2026-02-10-memory-storage-restructure.md` | ✅ 全部完成 | 已归档 |
| `plans/archived/2026-02-10-fix-note-cleanup-and-engine-tag.md` | ✅ 全部完成 | 已归档 |
| `plans/archived/2026-02-10-phase2-memory-consumption-mvp-implementation-plan.md` | ✅ 已被 2026-02-11 修正版替代 | 已归档 |
| `plans/archived/2026-02-10-auto-memory-tagging-mvp.md` | ✅ 自动写入标签提取 MVP 已完成（含测试） | 已归档 |
| `plans/archived/2026-02-11-memory-kind-classification-fix.md` | ✅ Kind 自动分类修复已完成（含合同测试与集成测试） | 已归档 |

---

## 六、风险提醒

1. **T1-1（存储改造）与 T1-2（消费注入）均已完成**：消费注入依赖 `project_memory_list`，当前 API 契约已保持稳定。
2. **T1-3（i18n）无依赖**，可与 T1-1 并行或在其间隙插入。
3. **T3-2（SQLite）与 T1-1（文件夹分桶）存在路径冲突**：如果确定短期内切 SQLite，T1-1 的文件夹方案可能被废弃。但根据当前优先级判断，T1-1 先落地合理（文件方案够用，SQLite 是远期）。
