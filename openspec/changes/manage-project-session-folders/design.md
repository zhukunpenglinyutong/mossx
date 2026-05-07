## Context

当前项目 session 管理已经有几条关键 contract：

- `workspace-session-management` 负责 project-aware session catalog、分页、archive/unarchive/delete 与 owner-aware mutation。
- `workspace-session-catalog-projection` 负责让 sidebar、Workspace Home、Session Management 复用同一套 project/worktree scope resolver。
- `session-history-project-attribution` 目前主要围绕 Codex 历史做 strict / inferred / unassigned 归属。
- `global-session-history-archive-center` 目前主要覆盖 Codex 的全局历史治理。

用户反馈暴露出两个缺口：

- session 数量多后，扁平列表不再可管理，需要项目内 folder tree 组织能力。
- 三大引擎历史读取不一致，特别是 Claude Code 有一部分具备项目证据的历史没有显示到对应项目里。

这不是单个 UI bug。核心设计必须把“组织层”和“真实归属层”拆开：folder tree 只能组织当前 project 已归属 session，不能改变 owner；历史 scanner/attribution 决定 session 应该属于哪个 project 或是否 unresolved。

## Goals / Non-Goals

**Goals:**

- 为每个 project 提供独立 session folder tree。
- 支持 folder CRUD、nested hierarchy、same-project session drag and drop。
- 支持非拖拽移动路径：session 菜单可选择目标 folder/root。
- 禁止跨 project session move 或 drag and drop。
- 将 Codex、Claude Code、Gemini 历史查询收口到统一 project attribution contract，其中 Codex 与 Claude Code 是 P0，Gemini 是 best-effort。
- 修复 Claude Code project history 漏显：有 cwd/git root/workspace catalog 证据时必须正确进入对应 project strict 或 related surface。
- 保持 archive/delete/unarchive owner-aware routing，不因 folder 组织层改变底层 owner。

**Non-Goals:**

- 不引入数据库。
- 不重写 engine transcript 格式。
- 不支持跨 project owner migration。
- 不把 unresolved history 强行归属。
- 不重构 chat runtime 或 session execution lifecycle。

## Decisions

### Decision 1: Folder tree 是 organization metadata，不是 session owner truth

**Decision**

- 新增 project scoped folder tree persistence。
- Session entry 只保存 `folderId` 或等价 assignment metadata。
- Session 的真实 owner 继续来自 workspace/session catalog 与 engine attribution。
- Folder move 不会改写 owner workspace/project。

**Why**

- 用户要的是“收纳和管理”，不是迁移底层历史。
- archive/delete 这类高风险 mutation 必须按真实 owner routing，不能由 UI folder 推导。
- 这样可以复用现有 catalog、pagination、mutation contract。

**Alternatives considered**

- 把 folder path 写入 session owner：会污染归属层，跨 project 风险高。
- 仅前端 state：刷新丢失，无法支持长期治理。

### Decision 2: Drag and drop 在 command 层做 project boundary validation

**Decision**

- 前端 DnD 可以先做 optimistic guard，但后端 command 必须再次校验：
  - source session owner project
  - target folder owner project
  - target folder existence
  - no cyclic folder parenting
- source project 与 target project 不一致时，命令拒绝并返回明确错误。

**Why**

- DnD 是 UI 易错区，不能只依赖前端判断。
- 跨 project move 当前没有 owner migration 设计，必须 hard block。

**Alternatives considered**

- 允许跨 project 拖拽并修改 attribution：风险过大，会引入误归属、误删和历史文件迁移问题。

### Decision 2.1: DnD 需要 drop 前反馈，且不能作为唯一移动路径

**Decision**

- 合法 target：
  - same-project folder
  - same-project root
- 非法 target：
  - other project
  - other project folder
  - archived-only 或不可变更 surface
- Hover 到非法 target 时，UI 必须在 drop 前显示 disabled cursor、禁止态或等价不可投放反馈。
- Drop 到非法 target 后端仍必须拒绝，前端保留原 assignment。
- Session row 菜单必须提供 `Move to folder...` 或等价操作，允许用户不用 DnD 完成同项目移动。

**Why**

- 对小白来说，“拖过去才报错”反馈太晚。
- DnD 对触控板、键盘用户和无障碍场景不稳定，必须有菜单备用路径。

**Alternatives considered**

- 只做 DnD：实现更快，但可发现性和可访问性不足。
- 允许非法 drop 后自动回弹但不提示：用户无法理解失败原因。

### Decision 3: 三引擎 scanner 共享输出 contract，各自保留 adapter，Codex/Claude Code 优先

**Decision**

- 建立统一输出模型：
  - `engine`
  - `canonicalSessionId`
  - `title`
  - `updatedAt`
  - `ownerWorkspaceId | null`
  - `attributionStatus`
  - `attributionReason`
  - `sourceMetadata`
  - `degradedSource`
- Codex、Claude Code、Gemini 各自保留 scanner/parser adapter，不强行统一底层解析。
- Codex 与 Claude Code 的 project attribution 正确性是 P0。
- Gemini adapter 只要求 best-effort：能读则进入统一模型，不能稳定归属则保留 `unassigned` 或 degraded marker。

**Why**

- 三个 engine 的历史格式不同，强行统一 parser 会扩大 blast radius。
- 产品层需要统一的是 attribution 与 list/mutation contract，不是底层文件格式。
- Claude Code 漏显问题通常来自 metadata extraction 与 project mapping 缺口，适合在 Claude adapter + shared attribution resolver 中修复。
- Gemini 本轮不是主要用户痛点，不应该扩大实现风险或阻塞 Codex/Claude Code 正确性。

**Alternatives considered**

- 为三引擎建立一个通用 transcript parser：过度抽象，容易牺牲 engine-specific 证据。
- 继续各 surface 自己查历史：会延续口径分裂。

### Decision 4: Claude Code attribution 优先读取 transcript evidence，再走 project mapping

**Decision**

Claude Code scanner 应按证据强度输出 attribution candidates：

1. transcript/session metadata 中的 cwd strict 命中 project/workspace。
2. cwd 所在 git root 命中 known workspace/project。
3. transcript path 或 Claude project directory 与 workspace catalog 映射命中。
4. parent-scope/worktree mapping 命中。
5. 证据不足时保持 `unassigned`。

证据矩阵：

| Evidence | Classification | Reason |
|---|---|---|
| `cwd` 位于 workspace path 内 | `strict-match` | 真实执行目录落在项目边界内 |
| `cwd` 的 git root 等于 workspace root | `strict-match` | Git root 与项目根一致 |
| `cwd` 属于 known child worktree | `strict-match` for that worktree / project projection | worktree 是项目边界的一部分 |
| Claude project directory 可映射到唯一 workspace | `inferred-related` | 来源目录提供弱归属证据 |
| parent-scope/worktree mapping 可唯一指向项目 | `inferred-related` | 间接证据，不混入 strict |
| metadata 缺失或候选项目不唯一 | `unassigned` | 宁可不归属，也不能错归属 |

**Why**

- 用户反馈的“Claude Code 部分 session 无法显示”大概率来自严格路径或 metadata 解析不完整。
- 归属必须可解释，不能靠标题、prompt 或模糊字符串猜测。

**Alternatives considered**

- 用 title/prompt fuzzy match 归属：误判率不可控，不适合作为 history ownership contract。

### Decision 5: Folder tree projection 不参与 membership 计算

**Decision**

- Sidebar count、Workspace Home session membership、Session Management strict list 继续由 shared projection resolver 决定。
- Folder tree 只负责把 projection 结果按 assignment 分组。
- 不在当前 page/window 中的 session 不因 folder tree 被当成完整 total。

**Why**

- 现有规范已经明确 filtered total 与 visible window 的差异。
- Folder UI 如果参与 membership，容易造成 count 膨胀、跨项目混入和 pagination 假象。

### Decision 6: MVP 固定删除与排序策略

**Decision**

- 非空 folder 删除默认阻止，提示用户先移动或清空内容。
- 本轮不做“删除 folder 并自动移动 children/sessions”。
- 默认排序：
  - folders before sessions
  - folders 按 `name asc`，同名按 `createdAt asc`
  - sessions 继续按既有 session projection ordering
- 手动排序不是本轮目标。

**Why**

- 阻止非空删除最安全，避免小白误以为删除 folder 不会影响里面内容。
- 自动移动内容虽然方便，但需要更多确认弹窗和撤销语义，本轮不引入。
- 固定 deterministic order 可以先解决“顺序乱”和测试不稳定问题。

**Alternatives considered**

- 删除非空 folder 时自动移动到 parent/root：更便捷，但需要额外确认和 undo 设计。
- 立即支持手动排序：用户体验更完整，但会引入排序持久化与 DnD 冲突面。

## Data Model Sketch

```ts
type WorkspaceSessionFolder = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type SessionFolderAssignment = {
  projectId: string;
  canonicalSessionId: string;
  folderId: string | null;
  updatedAt: string;
};

type EngineHistoryEntry = {
  engine: "codex" | "claude" | "gemini";
  canonicalSessionId: string;
  ownerWorkspaceId: string | null;
  attributionStatus: "strict-match" | "inferred-related" | "unassigned";
  attributionReason?: string;
  sourceMetadata: Record<string, unknown>;
};
```

说明：这是 contract 草图，不要求实现时逐字使用该 TypeScript 类型。关键是 assignment 与 owner 分离，engine identity 参与 canonical identity。

## Migration Plan

1. 新增 folder storage：
   - 首次读取 project folder tree 时，如果没有 folder metadata，返回空 tree 与 root assignments。
   - 不修改 existing sessions。
2. 增加 backend commands：
   - list/create/rename/delete/move folder
   - assign session to folder
   - 校验 same-project boundary
3. 接入 frontend folder tree：
   - project row 下渲染 folder hierarchy
   - 支持 expand/collapse 与 same-project drag and drop
   - cross-project drop 显式 reject
   - session menu 支持移动到同项目 folder/root
4. 梳理三引擎 scanner：
   - Codex adapter 保持现有 unified history 语义
   - Claude Code adapter 补 transcript evidence extraction
   - Gemini adapter 输出同一 attribution contract，但以 best-effort + degraded/unassigned 为边界
5. 更新 project/global views：
   - project strict/related/global 共享 canonical state
   - folder view 使用 assignment 分组 projection entries

## Rollback

- 若 folder tree 出现严重问题，可隐藏 folder UI，并保留 root session list；assignment metadata 不参与 owner routing，回滚风险低。
- 若某个 engine scanner 引入误归属，可单独关闭该 engine 的 project attribution adapter，并在 global history 中保留 unresolved entries。
- 若 DnD 出现异常，可保留 folder CRUD 与手动 move command，临时禁用拖拽入口。

## Risks / Trade-offs

- [Risk] Folder assignment 与 archive/delete 状态不同步  
  Mitigation：mutation 成功后按 canonical session identity 清理或刷新 assignment；delete 成功必须移除 dangling assignment。

- [Risk] Claude Code transcript metadata 不稳定  
  Mitigation：按证据强度分级；无法稳定归属时返回 `unassigned`，同时保留 global visibility 与 degraded marker。

- [Risk] DnD 跨项目误放造成 owner 污染  
  Mitigation：前后端双层校验；后端 command 以 project id 和 canonical owner 做最终裁决。

- [Risk] 只做 DnD 导致用户不知道如何移动 session  
  Mitigation：session 菜单提供 `Move to folder...`；folder/root target 可搜索或分层选择。

- [Risk] Folder tree 与 pagination 混用造成“只展示当前页 folder 内容”的误解  
  Mitigation：payload 区分 filtered total、visible window 与 folder counts；UI 对 partial/degraded state 明确提示。

- [Risk] 三引擎 canonical identity 冲突  
  Mitigation：canonical identity 必须包含 engine/source namespace，不允许仅靠 title/prompt dedupe。

## Open Questions

- Gemini 当前本地历史 metadata 完整度需要实现阶段实测确认；若不足，应先保证 global visibility 与 `unassigned` 状态。
