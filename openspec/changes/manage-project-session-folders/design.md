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

### Current Implementation Snapshot

当前代码已经落地以下基础：

- `src-tauri/src/session_management.rs` 定义 folder metadata、catalog entry `folder_id`、folder CRUD/assignment commands、archive/delete metadata cleanup、projection summary。
- Folder metadata 使用 file-based JSON，路径由 `catalog_metadata_path()` 派生到 `session-management/workspaces/<workspaceId>.json`。
- `assign_workspace_session_folder_core()` 已验证 workspace 存在、session id 合法、target folder 在该 workspace metadata 中存在，并支持 root fallback。
- `apply_folder_assignment()` 会按 owner workspace metadata 把 `folderId` 合入 catalog entry；Codex raw id 与 `codex:` prefixed id 做了兼容。
- `WorkspaceSessionFolderTree.tsx` 已支持 nested folder 渲染、inline create/rename/delete confirm、keyboard expand/collapse、context menu。
- `ThreadList`/`useSidebarMenus` 已支持右键菜单 `Move to folder`，目标由 `buildWorkspaceSessionFolderMoveTargets()` 从当前 project folder tree 构造。
- 三引擎 catalog 已在 `build_workspace_scope_catalog_data()` / `build_global_engine_catalog_entries()` 汇入 Codex、Claude Code、Gemini，并暴露 partial source。

当前代码尚未落地或仍有风险：

- assignment command 没有复用 catalog/attribution resolver 去证明 source session 真实属于目标 project scope。
- folder metadata 仍是每个 command 独立 read-modify-write，没有 workspace-scoped mutation helper 或 lock。
- `build_catalog_page()` 在过滤/排序/分页前已经拿到了完整 `entries`；上游 scanner 仍可能用 `usize::MAX` 或无 cursor 扫描。
- folder collapsed state 是 `WorkspaceSessionFolderTree` 内部 `useState(new Set())`，刷新或 remount 后丢失。
- `Move to folder` 目标列表是线性 menu items，大 folder 数量下没有 searchable picker。

### 2026-05-08 Follow-up Snapshot

本次收口后，session folder 提案需要吸收一个相邻事实：sidebar/folder tree 的 root session 默认展示窗口不再是前端硬编码，而是 workspace settings 的 `visibleThreadRootCount`。

- 默认值为 `20`，未配置时与显式保存 `20` 等价。
- 用户输入与后端写入均按有效正整数处理，超出范围统一 clamp 到 `1..200`。
- 该配置只影响 sidebar/worktree/folder tree 的折叠态 root session 展示窗口，不改变 catalog page size、owner membership、folder assignment 或 archive/delete routing。
- `More...` 与 `Load older...` 的门禁继续遵循 folder 提案的 projection 原则：先展开当前已加载 root sessions，再进入后端分页。
- `.github/workflows/large-file-governance.yml` 与 `.github/workflows/heavy-test-noise-sentry.yml` 已切到 Linux/macOS/Windows matrix，文档/门禁层面对跨平台路径与 shell 差异做基础兜底。

## Goals / Non-Goals

**Goals:**

- 为每个 project 提供独立 session folder tree。
- 支持 folder CRUD、nested hierarchy。
- 支持菜单移动路径：session 菜单可选择目标 folder/root。
- 禁止跨 project session move。
- Assignment command 必须从 catalog/source owner 反证 session 属于目标 project scope，不能只信任前端 workspace id。
- Folder metadata 的写入必须避免同一 workspace 下 read-modify-write 竞争导致更新丢失。
- 大历史 catalog 的后端扫描必须逐步具备 bounded page acquisition，首屏不应为了构造一个 page 而扫描全部历史。
- Folder 展开状态需要 project-local 持久化；大量 folder target 需要可搜索或可扫描的菜单移动入口。
- 将 Codex、Claude Code、Gemini 历史查询收口到统一 project attribution contract，其中 Codex 与 Claude Code 是 P0，Gemini 是 best-effort。
- 修复 Claude Code project history 漏显：有 cwd/git root/workspace catalog 证据时必须正确进入对应 project strict 或 related surface。
- 保持 archive/delete/unarchive owner-aware routing，不因 folder 组织层改变底层 owner。
- 将 sidebar root session 可见数量从硬编码阈值解耦为 workspace setting，并确保 folder tree/root list 共享同一阈值语义。

**Non-Goals:**

- 不引入数据库。
- 不重写 engine transcript 格式。
- 不支持跨 project owner migration。
- 不实现 session-to-folder drag and drop；当前设计以 explicit menu move 降低误操作和实现复杂度。
- 不把 unresolved history 强行归属。
- 不重构 chat runtime 或 session execution lifecycle。
- 不在本轮改用数据库或引入全局索引服务；hardening 继续基于现有 file-based metadata 与 engine adapter。
- 不让 root session 可见数量影响 backend catalog limit 或 folder membership；它只是 UI 折叠态窗口设置。

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

### Decision 2: Session folder assignment 走 explicit menu move，command 层做 project boundary validation

**Decision**

- 当前已落地的移动路径是 menu-based assignment；本提案不再要求 session-to-folder drag and drop。
- 前端菜单只能展示当前 project folder/root，但后端 command 必须再次校验：
  - source session owner project
  - target folder owner project
  - target folder existence
  - no cyclic folder parenting
- source project 与 target project 不一致时，命令拒绝并返回明确错误。

**Why**

- explicit menu move 的意图更清晰，也更适合大量 session 与无障碍场景。
- 跨 project move 当前没有 owner migration 设计，必须 hard block。

**Alternatives considered**

- 加 session-to-folder drag and drop：交互意义有限，且会放大 hover/drop 反馈、跨项目误放、触控板误操作与测试成本。
- 允许跨 project 移动并修改 attribution：风险过大，会引入误归属、误删和历史文件迁移问题。

### Decision 2.2: Folder assignment command 必须 owner-aware

**Decision**

- 当前代码只验证 target folder 属于传入 `workspaceId`，尚未证明 source session 的真实 owner；本决策是 v0.4.14 hardening 的 P0 缺口。
- `assign session to folder/root` 必须先解析 source session 的真实 owner workspace/project scope。
- 目标 `workspaceId` 与 source session owner/project scope 不一致时，命令必须拒绝，错误需要能区分：
  - target folder 不存在
  - source session 不属于该 project scope
  - source session 无法解析 owner
- 校验应优先复用 session catalog / attribution resolver 的 canonical identity，而不是前端当前可见 row。

**Why**

- v0.4.14 已经把 folder target 校验放在后端，但仍需要证明 source session 本身属于当前 project。
- 只信任调用方传入的 workspace id 会让错误调用写入 dangling 或跨 project assignment metadata。

**Alternatives considered**

- 仅依赖 UI 菜单过滤：正常路径足够，但 command 层仍对测试、脚本和未来入口脆弱。

### Decision 2.3: Folder metadata mutation 需要 workspace-scoped atomic helper

**Decision**

- 当前代码每个 command 直接 `read_catalog_metadata()` 后 `write_catalog_metadata()`，没有共享临界区；该 helper 需要作为后续 hardening 引入。
- create/rename/move/delete folder 与 assign session folder 必须通过同一个 workspace-scoped mutation helper 写入 metadata。
- helper 负责 read -> validate/mutate -> write 的临界区，避免同一 workspace 下并发操作互相覆盖。
- 当前 file-based storage 可用 in-process per-workspace lock 先收口；跨进程强一致不是本轮目标，但错误日志应能定位写入失败。

**Why**

- folder metadata 当前是 JSON read-modify-write。快速连续移动、重命名、删除时，后写可能覆盖先写。
- 不引入数据库仍可以通过局部锁显著降低实际风险。

**Alternatives considered**

- 直接改数据库：能力更强，但对当前需求过重。
- 保持无锁并依赖 UI 串行：无法覆盖多入口、重试和未来自动化调用。

### Decision 2.1: Menu move 是唯一 session folder assignment 入口

**Decision**

- Session row 菜单必须提供 `Move to folder...` 或等价操作。
- 合法 target 仅包含 same-project folder 与 same-project root。
- 非法 target 包括 other project、other project folder、archived-only 或不可变更 surface。
- 后端仍必须拒绝非法 assignment，前端在失败后保留原 assignment。

**Why**

- 对小白来说，菜单移动的显式确认更可解释，且不会引入移动目标不清晰的问题。
- 菜单路径对触控板、键盘用户和无障碍场景更稳定。

**Alternatives considered**

- 只做拖拽：可发现性和可访问性不足，不采用。
- 菜单 + DnD 双入口：能力重复，增加测试面和误操作面，不采用。

### Decision 2.2: Shared session 不复用 native session folder assignment

**Decision**

- `Claude Code + Codex` 会话是 `threadKind=shared` 的 canonical `shared:*` thread，不是 `Claude` 或 `Codex` native session。
- native folder assignment 只处理 native catalog session；`shared:*` 不能通过 `assignWorkspaceSessionFolder` 强行移动。
- shared session 的 hidden native bindings 只是执行引擎内部绑定，不能作为 shared conversation 的 folder placement 真值。
- V1 可接受限制：空 shared session 不保证立即进入目标 folder；发生对话后，现有 refresh/projection 可能 best-effort 将其显示到目标 folder。
- 后续若要完整支持，必须新增 shared-specific folder assignment contract，把 folder id 写入 shared session meta 或 workspace folder metadata 的 shared mapping。

**Why**

- shared session 和 native session 的 owner/catalog 生命周期不同。复用 native assignment 会触发 ownership mismatch，也容易把 hidden binding 暴露成用户可见会话。
- folder 是 workspace organization layer，不能反向改变 shared session 的 canonical identity。

**Alternatives considered**

- 让 `assignWorkspaceSessionFolder` 接受 `shared:*`：短期省事，但会把 native catalog 与 shared meta 耦合，不采用。
- 移动 hidden Claude/Codex binding 来代表 shared session：会污染 native history projection，并破坏 shared session 的单一用户身份，不采用。

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

### Decision 5.2: Root session visibility threshold 是 workspace display preference

**Decision**

- `visibleThreadRootCount` 存在 workspace settings 中，由 `项目管理 -> 会话管理` 暴露编辑。
- sidebar、worktree 与 folder tree root list 使用同一 normalized threshold。
- 默认值为 `20`，有效范围为 `1..200`，无效值在消费前收敛。
- 该值不参与 session catalog backend limit、不改变 strict/related membership，也不改变 folder assignment。

**Why**

- folder tree 解决的是组织层；root session visibility 解决的是折叠态扫读密度，两者共享 sidebar surface，但职责不同。
- 把阈值做成 workspace scoped 可以适配“历史很多的大项目”和“只需少量默认展示的小项目”，不污染全局偏好。
- 边界 clamp 同时放在前端解析与后端 settings update，能防止异常输入、旧 payload 或命令路径绕过 UI 造成展示漂移。

**Alternatives considered**

- 继续硬编码：无法适配项目差异，也会让 folder tree/root list 的默认扫读窗口不可控。
- 做成全局 app setting：实现简单，但不符合不同 project session 密度差异。

### Decision 5.1: Catalog pagination 必须逐步下沉到 engine scanner

**Decision**

- 当前代码已经有 `limit` clamp、offset cursor 与前端 `Load older`，但分页发生在完整候选集构造之后；这不是最终 bounded backend acquisition。
- 前端首屏只请求首个 page 只是第一层保护；后端 catalog builder 也必须支持 bounded acquisition。
- Backend should prefer engine-specific cursor/limit where available, and otherwise cap scanned pages/items with partial/degraded marker.
- Cursor semantics must remain stable across filters and source degradation.

**Why**

- 如果后端先扫描全部 Codex/Claude/Gemini/OpenCode 历史再分页，大历史项目仍会卡在 backend IO。
- `Load older` 的用户体验只有在前后端都 bounded 时才成立。

**Alternatives considered**

- 只保留前端分页：实现简单，但不能解决真实 IO 和 parsing 压力。

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
- 立即支持手动排序：用户体验更完整，但会引入额外排序持久化与交互复杂度。

### Decision 7: Folder 展开状态是 UI preference，不是 organization truth

**Decision**

- 当前 folder expand/collapse state 只存在组件内存中，已支持 keyboard toggle，但不跨刷新恢复。
- Folder expand/collapse state 应按 project 持久化到 UI preference/local metadata。
- 展开状态不得参与 session membership、assignment、archive/delete routing。
- Folder 被删除或 parent 修复后，失效的 collapsed id 必须被清理或忽略。

**Why**

- 多层 folder 的可用性依赖用户整理后的视图能跨刷新保留。
- 这是 UI preference，不应污染组织层 truth。

### Decision 8: 大量 folder target 时 Move to folder 入口需要 searchable fallback

**Decision**

- 当前实现使用 Tauri menu 的线性 target list，适合少量 folder，不适合长期项目的大量 folder。
- 少量 folder 可继续使用当前 menu target list。
- 当 target 数量超过阈值时，使用 searchable picker / command palette / grouped selector，至少支持按 folder path 文本过滤。
- Root target 必须始终可达。

**Why**

- 长菜单在几十个 folder 后不可扫描，菜单移动路径会变成名义存在。
- 小白需要菜单路径，重度用户需要快速定位目标。

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

type WorkspaceSessionFolderUiState = {
  projectId: string;
  collapsedFolderIds: string[];
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
   - 校验 source session owner/project scope
   - 使用 workspace-scoped metadata mutation helper
3. 接入 frontend folder tree：
   - project row 下渲染 folder hierarchy
   - 支持 expand/collapse
   - session menu 支持移动到同项目 folder/root
4. 梳理三引擎 scanner：
   - Codex adapter 保持现有 unified history 语义
   - Claude Code adapter 补 transcript evidence extraction
   - Gemini adapter 输出同一 attribution contract，但以 best-effort + degraded/unassigned 为边界
5. 更新 project/global views：
   - project strict/related/global 共享 canonical state
   - folder view 使用 assignment 分组 projection entries
6. 追加 hardening：
   - backend catalog builder 优先接入 limit/cursor-aware scanner
   - folder collapsed state 持久化为 UI preference
   - folder target 数量过多时切换 searchable move picker

## Rollback

- 若 folder tree 出现严重问题，可隐藏 folder UI，并保留 root session list；assignment metadata 不参与 owner routing，回滚风险低。
- 若某个 engine scanner 引入误归属，可单独关闭该 engine 的 project attribution adapter，并在 global history 中保留 unresolved entries。
- 若 bounded scanner 在某 engine 上表现不稳定，可先对该 engine 回退到 capped scan + degraded marker，不影响其它 engine。
- 若 collapsed-state persistence 出现异常，可忽略 UI preference 并回退到默认展开/折叠策略，不影响 assignment metadata。

## Risks / Trade-offs

- [Risk] Folder assignment 与 archive/delete 状态不同步  
  Mitigation：mutation 成功后按 canonical session identity 清理或刷新 assignment；delete 成功必须移除 dangling assignment。

- [Risk] Claude Code transcript metadata 不稳定  
  Mitigation：按证据强度分级；无法稳定归属时返回 `unassigned`，同时保留 global visibility 与 degraded marker。

- [Risk] 错误入口或脚本绕过菜单导致 owner 污染
  Mitigation：后端 command 以 project id 和 canonical owner 做最终裁决；菜单过滤只作为第一层保护。

- [Risk] Folder tree 与 pagination 混用造成“只展示当前页 folder 内容”的误解  
  Mitigation：payload 区分 filtered total、visible window 与 folder counts；UI 对 partial/degraded state 明确提示。

- [Risk] 三引擎 canonical identity 冲突  
  Mitigation：canonical identity 必须包含 engine/source namespace，不允许仅靠 title/prompt dedupe。

## Open Questions

- Gemini 当前本地历史 metadata 完整度需要实现阶段实测确认；若不足，应先保证 global visibility 与 `unassigned` 状态。
