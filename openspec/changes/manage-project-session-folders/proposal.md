## Why

项目左侧工作区的 session 数量增长后，当前扁平列表已经无法支撑有效管理；用户需要用父子文件夹把同一项目内的会话分组、收纳、拖拽移动。

同时，`Codex`、`Claude Code`、`Gemini` 三类引擎的历史会话归属与展示口径不一致，尤其是 Claude Code 部分历史无法在对应项目中正确显示，导致用户误以为会话丢失。

典型用户故事：

- 作为新手用户，我希望在项目旁边直接看到“新建文件夹”入口，把调试、需求、重构类 session 分开放，而不是在几十条会话里翻找。
- 作为经常同时使用 Codex 与 Claude Code 的用户，我希望同一项目的两类历史都能正确出现在项目里，不需要猜它们被藏到哪里。
- 作为谨慎用户，我希望拖拽到错误项目时系统提前阻止，而不是移动后才发现 session 归属错乱。

## 目标与边界

### 目标

- 在左侧工作区项目区域增加 session folder tree，用父子层级管理当前项目内的 sessions。
- 允许 session 在同一项目内通过 drag and drop 移入 folder、移出 folder、跨 folder 移动。
- 提供非拖拽移动路径，使用户可以通过 session 菜单选择 `Move to folder` 完成同项目移动。
- 明确禁止跨项目拖拽或移动 session，避免 owner workspace 与底层历史文件归属被污染。
- 梳理 `Codex`、`Claude Code`、`Gemini` 三大引擎的历史会话查询与 project attribution contract，其中 Codex 与 Claude Code 是 P0 正确性目标，Gemini 是 best-effort 可见性目标。
- 修复 Claude Code 历史在对应项目中漏显的问题，使可归属历史能稳定出现在正确项目内。

### 边界

- 本提案只定义项目内 session folder 管理与三引擎历史查询归属，不实现云同步、多设备共享或团队级权限。
- Folder tree 是应用侧组织层，不改变底层引擎原始 transcript/history 文件的存储格式。
- Drag and drop 只改变 session 的 folder assignment，不改变 session 的真实 owner project/workspace。
- 跨项目移动和跨项目拖拽在本轮明确禁止；未来若要支持，必须单独设计 owner migration 与 destructive risk gate。

## 非目标

- 不把 folder tree 设计成通用文件系统浏览器。
- 不支持 folder 直接跨 project 复制或移动。
- 不重写现有 chat runtime、thread execution 或 transcript parser。
- 不承诺把无法获得足够 metadata 的历史强行归属到某项目。
- 不新增数据库依赖；优先沿用现有 file-based storage 与 workspace/session catalog 模型。

## What Changes

- 新增 `workspace-session-folder-tree` capability：
  - 每个 project/workspace 拥有独立的 session folder tree。
  - Folder 支持创建、重命名、删除、父子层级调整。
  - Session 支持同项目内 folder assignment 变更。
  - UI 支持 folder expand/collapse、folder 内 session 展示、拖拽移动。
  - Move contract 必须验证 source project 与 target project 一致。
- 修改 `workspace-session-management`：
  - 项目 session catalog 返回 folder assignment 或等价组织 metadata。
  - Archive、delete、unarchive、query、pagination 不得被 folder 组织层破坏。
  - Folder 删除时必须有明确策略：移出 folder 或阻止删除非空 folder。
- 修改 `workspace-session-catalog-projection`：
  - Sidebar / Workspace Home / Session Management 继续共享同一 strict project scope resolver。
  - Folder tree 只作为当前 project projection 的 presentation/organization layer，不扩大 session membership。
- 修改 `session-history-project-attribution`：
  - Attribution 从 Codex 扩展到 `Codex`、`Claude Code`、`Gemini` 三类 engine。
  - 每条历史必须携带 engine/source、canonical session identity、owner workspace/project 或 unresolved marker。
  - Codex 与 Claude Code 历史必须根据 transcript metadata、cwd、project path、known workspace catalog 等证据做 project attribution。
  - Gemini 历史在 metadata 足够时参与同一 attribution contract；metadata 不足时保留在 global/unassigned，而不是阻塞本提案交付。
- 修改 `global-session-history-archive-center`：
  - 全局历史中心支持按 engine 查询 `Codex`、`Claude Code`、`Gemini` 历史。
  - Project view 与 global view 的同一 canonical session 状态保持一致。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只在前端本地维护临时 folder UI state | 改动最快 | 刷新后丢失，无法被 catalog/query/mutation 复用，不能支撑长期管理 | 不采用 |
| B | 在 workspace session catalog 增加轻量 folder assignment metadata | 兼容现有 file-based storage，改动面可控，能保持 owner routing | 需要补 migration/default folder 与 DnD validation | **采用** |
| C | 引入完整数据库/树形索引服务重做 session catalog | 查询能力最强 | 对当前需求过重，会放大迁移、备份、跨平台风险 | 不采用 |

取舍：采用 B。Folder tree 是当前项目 session 的组织层，不是新的 truth source；真实归属仍由 session catalog 与 engine history attribution 决定。

## Capabilities

### New Capabilities

- `workspace-session-folder-tree`: 定义项目内 session folder tree、父子层级、同项目 drag and drop、跨项目移动保护与 folder assignment 行为。

### Modified Capabilities

- `workspace-session-management`: 项目会话管理需要感知 folder assignment，并保证 archive/delete/unarchive/query 与 folder 组织层一致。
- `workspace-session-catalog-projection`: 默认 workspace session projection 需要允许 folder organization，但不得改变 strict project membership。
- `session-history-project-attribution`: 从 Codex-only 归属扩展为 `Codex`、`Claude Code`、`Gemini` 三引擎归属，重点补齐 Claude Code project history 漏显。
- `global-session-history-archive-center`: 全局历史中心从 Codex-only 扩展为按 engine 查询三大引擎历史。

## 验收标准

- 用户可以从项目行或项目菜单中发现 `New folder` 入口，并能理解该入口创建的是当前项目内的 session folder。
- 项目没有 folder 时，系统必须以 root session list 作为默认态，不得出现空白树或让用户误以为 session 丢失。
- 用户可以在某个项目下创建多层 session folder，并看到父子树形结构。
- 用户可以把当前项目内 session 拖入 folder、拖出 folder、从一个 folder 移到另一个 folder。
- 用户可以不使用拖拽，通过 session 菜单或等价操作把 session 移动到同项目 folder/root。
- 当用户尝试把 session 拖到另一个项目或另一个项目的 folder 时，系统必须阻止并给出明确反馈。
- 当用户拖拽悬停到非法跨项目目标时，系统必须在 drop 前显示禁用态或不可投放反馈。
- Folder assignment 变化后，session 的真实 owner workspace/project 不得改变。
- Folder tree 不得影响 archive、unarchive、delete、query、pagination 的正确性。
- Codex 与 Claude Code 历史会话必须在对应项目中按统一 attribution contract 查询与展示。
- Claude Code 历史如果具备可归属证据，必须出现在对应项目的 session catalog 或 related surface 中。
- Gemini 历史如果具备可归属证据，应该进入同一查询模型；证据不足时必须保留在 global/unassigned 或 degraded 状态，不得影响 Codex/Claude Code 的正确性。
- 缺失 metadata 或候选项目不唯一的历史必须保留为 unresolved/unassigned，不得强行归属或静默丢弃。
- 三引擎任一 history source 扫描失败时，其它 source 的结果仍可返回，并暴露 degraded marker。

## Impact

- Affected behavior specs:
  - 新增 `openspec/specs/workspace-session-folder-tree/spec.md`
  - 修改 `openspec/specs/workspace-session-management/spec.md`
  - 修改 `openspec/specs/workspace-session-catalog-projection/spec.md`
  - 修改 `openspec/specs/session-history-project-attribution/spec.md`
  - 修改 `openspec/specs/global-session-history-archive-center/spec.md`
- Likely affected frontend:
  - workspace sidebar / project list session surface
  - session management settings surface
  - drag and drop interaction layer
  - session tree rendering and empty states
- Likely affected backend:
  - workspace/session catalog read model
  - folder assignment persistence
  - session move validation command
  - Codex / Claude Code / Gemini history scanners and attribution adapters
- Validation focus:
  - folder CRUD and nested rendering
  - same-project DnD move success
  - cross-project DnD/move rejection
  - disabled drop feedback before illegal cross-project drop
  - menu-based move path for non-DnD users
  - folder assignment persistence across refresh
  - Claude Code project history attribution regression
  - Codex history attribution regression
  - Gemini best-effort degraded/unassigned behavior
