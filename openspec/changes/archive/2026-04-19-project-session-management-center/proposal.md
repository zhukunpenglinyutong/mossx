## Why

当前客户端的“项目会话管理”仍然只是 `Settings > Other` 下的一个局部 section，它复用的是主界面线程列表数据，而不是一个独立的 session management data domain。这导致它在小规模场景下还能工作，但一旦进入“跨引擎、多历史、需要正确分页、需要治理 archive/delete”的真实使用方式，就会出现语义漂移：页面展示的是当前可见列表，不是真实历史目录；删除链路能跑，但 archive 语义没有被正式建模；主界面、设置页、重启后的可见性也缺少统一契约。

现在需要把这块从“顺手挂在设置页里的管理区”升级为“独立会话管理中心”，用一个统一的 workspace-scoped session catalog 承载分页查询、筛选、批量治理与归档可见性规则。这样既能解决你要的“每个项目真实会话历史正确分页读取”，也能把“archive 后主界面默认隐藏”变成稳定 contract，而不是散落在某几个 helper 里的偶然过滤。

## Current Status (2026-04-19)

本提案已经进入实现中段，不再停留在纯方案阶段。当前代码状态与提案目标的对齐情况如下：

- 已完成 workspace-scoped session catalog 基础 contract：
  - `list_workspace_sessions`
  - `archive_workspace_sessions`
  - `unarchive_workspace_sessions`
  - `delete_workspace_sessions`
- 已在设置页落地独立的项目会话管理视图与查询模型，支持：
  - workspace 选择
  - keyword / engine / status 过滤
  - 分页读取
  - 多选
  - 批量 archive / unarchive / delete
- 已落地 archive visibility contract：
  - archived session 默认不再出现在主界面标准会话入口中
  - 设置页中仍可查询 archived 并恢复/删除
- 已修复一个实现阶段暴露的边界问题：
  - 当某 workspace 没有 active 会话、只剩 archived 会话时，主界面左侧不得因为空结果而反复自动刷新
  - 该问题已通过前端守卫与回归测试收口

当前提案仍然保留“独立设置页能力中心化”的总方向，但实际实现选择是“先在 Settings 内形成明确的独立管理视图与数据域”，而不是等待完整设置壳重构后再交付会话治理能力。

## 目标与边界

### 目标

- 将当前“项目会话管理”从 `OtherSection` 升级为独立设置页入口，例如 `Settings > Session Management`。
- 为每个 workspace 提供真实历史会话目录（real session history catalog），支持 cursor/page 分页读取，而不是复用主界面一次性线程列表。
- 保留并增强现有查询、选择、批量删除能力。
- 新增“归档（archive）/取消归档（unarchive）”能力，并把 archive 语义纳入统一前后端 contract。
- 明确 archive 后的默认可见性：主界面（sidebar / workspace home recent list / topbar tabs 等主会话入口）默认不展示 archived sessions。
- 允许用户在会话管理页中查看 archived sessions、恢复它们，或继续彻底删除。
- 保持 `Codex / Claude / Gemini / OpenCode / Shared Session` 在用户侧的管理语义尽量一致，并把引擎差异限制在 adapter / backend catalog 层。

### 边界

- 本提案先聚焦 desktop 客户端内的 session management，不扩展到跨设备同步或云端多端一致性。
- 本提案优先建立统一 catalog contract，不要求第一阶段就重写所有历史列表 UI。
- `Codex` 现有原生 `thread/archive` 能力继续复用；其他引擎是否具备原生 archive 不作为本提案前提，必要时允许通过本地 metadata 实现逻辑 archive。
- 本提案不引入数据库；继续使用当前 file-based persistence 与 lock + atomic write 模式。
- Session Radar 的最近完成历史管理不并入本次 capability，只要求 archive 规则不要破坏现有 Radar 行为。

## 非目标

- 不把设置页做成通用“运行时任务管理器”或取代现有聊天主界面。
- 不在本提案内重构整个 conversation rendering / message persistence 系统。
- 不承诺所有历史列表一次性统一成同一视觉组件；首期重点是 contract、分页与 archive visibility。
- 不在本提案内新增外部依赖服务或数据库迁移。

## What Changes

- 新增独立 capability：`workspace-session-management`
  - 提供独立设置页入口，而不是继续放在 `OtherSection` 中堆功能。
  - 提供 workspace 维度的 session catalog，支持分页、搜索、状态过滤、引擎过滤、多选、批量操作。
- 新增 archive / unarchive 管理语义：
  - session management 页支持批量 archive、批量 unarchive、批量 delete。
  - archived session 默认不再出现在客户端主界面的 session surfaces 中。
- 建立统一的 session catalog response contract：
  - 返回统一字段，例如 `sessionId / engine / title / updatedAt / archivedAt / source / visibility / nextCursor`。
  - 允许后端按 workspace 聚合真实历史，再由前端消费分页结果。
- 将主界面会话展示从“直接消费历史列表”改为“消费 active-only catalog”：
  - Sidebar 线程列表、Workspace Home recent list、Topbar session tabs 默认仅读取未归档会话。
  - archived session 仅在会话管理页或显式恢复场景中可见。
- 统一 archive 后的跨视图一致性：
  - archive 成功后，会话管理页与主界面可见列表必须同步收敛。
  - 重启后 archived session 不得重新出现在默认主界面列表中。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 继续扩现有 `ProjectSessionManagementSection`，前端基于当前 `threadsByWorkspace` 做筛选/分页假象 | 改动小，能快速补一点 UI | 仍是伪分页，archive/delete/filter 会继续和主列表耦合，数据语义不干净 | 不采用 |
| B | 新增后端统一 session catalog，由设置页独立消费；主界面只消费 active-only 结果 | 语义最清晰，分页与 archive 规则统一，后续可持续演进 | 首次需要跨 frontend/service/backend/spec 一起改 | **采用** |
| C | 直接引入数据库做全量会话索引 | 能力最强 | 对当前项目过重，明显超出 YAGNI | 不采用 |

取舍：采用方案 B。核心理由不是“更高级”，而是它能把“真实历史分页”和“archive 后主界面隐藏”这两个要求收敛到同一个 contract 上，避免前端继续拿主列表拼装治理逻辑。

## Capabilities

### New Capabilities

- `workspace-session-management`: 独立设置页中的 workspace 级会话管理中心，负责真实历史分页、查询、筛选、多选、archive、unarchive、delete 以及 active/archived 视图切换。

### Modified Capabilities

- `codex-cross-source-history-unification`: 当前统一历史能力需要扩展为可分页的 catalog 读取模型，并显式暴露 archive metadata / visibility filter，而不是只返回简单统一列表。
- `conversation-lifecycle-contract`: 需要补充 archive 语义，明确“archive 成功后默认主界面不可见、重启后仍不可见、恢复后重新可见”的 restart-verifiable contract。

## Impact

- Affected frontend:
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/components/ProjectSessionManagementSection.tsx`
  - `src/features/settings/components/settings-view/sections/OtherSection.tsx`
  - 新增 `src/features/session-management/**` feature slice
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/hooks/useThreadActions.helpers.ts`
  - `src/features/workspaces/components/WorkspaceHome.tsx`
  - `src/features/layout/hooks/topbarSessionTabs.ts`
- Affected service / contracts:
  - `src/services/tauri.ts`
  - `src/types.ts`
- Affected backend:
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/codex/mod.rs`
  - 可能新增 `src-tauri/src/session_management.rs` 或等效模块
  - `src-tauri/src/storage.rs`
  - `src-tauri/src/state.rs`
- Affected persistence:
  - workspace-scoped session catalog / archive metadata file
  - lock + atomic write contract
- Affected tests:
  - session catalog pagination tests
  - archive visibility regression tests
  - settings page interaction tests
  - cross-view consistency tests

## 验收标准

- 当某 workspace 拥有 200+ 条会话历史时，会话管理页必须按 cursor/page 正确读取，不得只展示主界面已加载的局部列表。
- 用户可在会话管理页按关键词、引擎、状态（active / archived）查询会话。
- 用户可对会话执行单条/批量 archive、unarchive、delete，且部分失败时保留失败项以便重试。
- archive 成功后，目标会话必须从默认主界面 session surfaces 中移除；包括 sidebar、workspace home recent list，以及已打开 tab 的可见窗口恢复逻辑。
- app 重启后，已 archive 的会话默认仍不得重新出现在主界面列表中。
- unarchive 成功后，会话必须重新回到默认主界面可见集合。
- archive/delete 不得中断正在进行中的无关会话，也不得污染 Session Radar 的进行中聚合。
- 当某 workspace 已经完成一次 active-only 主界面列表 hydrate，且结果为空（例如只剩 archived sessions）时，主界面 MUST 稳定停留在空态，不得进入持续重复刷新。
