## Why

当前 `Session Management`、sidebar 和 `Workspace Home` 对“这个项目有哪些会话”使用了不同的数据口径：

- `Session Management` 读取真实 catalog，main workspace 会聚合 child worktrees，并且会暴露 partial/degraded source。
- sidebar 与 `Workspace Home` 主要依赖 `threadsByWorkspace` 等运行时投影，只展示当前 active/unarchived 的内存线程结果。

结果是同一 workspace 在不同入口会出现数量、范围、归属口径不一致。用户无法判断这到底是 archive、worktree 聚合、分页窗口，还是实现写死/漏读导致的差异，因此这已经不是文案问题，而是 catalog semantics 缺失。

## 目标与边界

### 目标

- 为 sidebar、`Workspace Home`、`Session Management` 建立一套共享的 `workspace session catalog projection` 语义。
- 明确定义 main workspace、worktree、active、archived、strict、partial source 的口径。
- 让“项目会话数量”与“主界面可见会话集合”都能追溯到同一 scope resolver，而不是各自猜测。
- 让默认主界面继续以 active/unarchived 为主，但不再与 `Session Management` 的默认 project view 形成语义断裂。
- 让 change 进入可直接实现状态，而不是停留在问题描述。

### 边界

- 本提案只覆盖 workspace/session catalog 口径、跨 surface 计数一致性、partial source 可解释性，以及相关 UI contract。
- 本提案允许不同 surface 继续使用不同展示窗口（例如 sidebar 只展示一部分最近 active 会话），但其 membership/count 必须来自同一 projection 语义。
- 本提案不改变 archive/delete/unarchive 基础 mutation 语义。
- 本提案不重做整个 homepage / sidebar 视觉设计，只收敛数据 contract。

## 非目标

- 不在本轮重构全部 thread lifecycle 或 runtime cache 架构。
- 不在本轮改变 `related` catalog 的归因算法，只明确 `strict` 与默认主界面的共享边界。
- 不在本轮引入新的存储格式或历史迁移脚本。
- 不要求所有 surface 一次性展示“完整项目历史”；主界面仍可保持 active-first、windowed UI。

## What Changes

- 新增一个共享 capability：`workspace-session-catalog-projection`，定义跨 surface 的 scope resolver、projection summary 与 degraded semantics。
- 规定 main workspace 的 project scope 必须统一为“main workspace + child worktrees”，worktree scope 必须保持 worktree-only。
- 规定 sidebar 与 `Workspace Home` 的默认会话集合必须来自共享 catalog 的 `strict + active + unarchived` projection；运行时线程状态只做 overlay，不再单独决定 membership。
- 规定 `Session Management` 的默认 project view 继续使用真实 paginated catalog，但 count/scope/hint 必须与共享 projection 对齐，并区分“filtered total”和“current page visible”。
- 规定 partial/degraded source 必须显式出现在 summary/hint 中，禁止把不完整结果伪装成准确总量。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 保持各 surface 现状，只补提示文案 | 改动最小 | 根因不变，count mismatch 继续出现，用户仍无法判断哪边才是真相 | 不采用 |
| B | 让 sidebar/home 继续用本地线程列表，`Session Management` 单独维护 catalog，只在 UI 上做“解释性对齐” | 侵入小于彻底统一 | 仍然存在两套 source-of-truth，后续新增 worktree/archive/partial source 行为时会再次漂移 | 不采用 |
| C | 引入共享 `workspace session catalog projection` contract，统一 scope/count/degraded 语义，surface 只决定展示窗口和交互层 | source-of-truth 清晰，后续可持续演进，能自然覆盖 worktree 与 archive 边界 | 需要补 backend summary/adapter、前端 hook 与测试 | **采用** |

## Capabilities

### New Capabilities

- `workspace-session-catalog-projection`: 定义跨 sidebar、`Workspace Home`、`Session Management` 共享的 workspace scope resolver、active/default projection、filtered total 与 degraded source 语义。

### Modified Capabilities

- `workspace-session-management`: 项目级会话管理需要以共享 projection 解释默认 project scope、filtered total、page slice 与 degraded hint。
- `workspace-sidebar-visual-harmony`: sidebar 的 workspace/worktree 聚合信号与默认会话集合需要遵守共享 active projection，而不是仅依赖本地线程列表。

## 验收标准

- 当用户选择同一 main workspace，sidebar、`Workspace Home` 与 `Session Management(strict + active)` MUST 使用同一 project scope（main workspace + child worktrees）。
- 当用户选择 worktree，sidebar、`Workspace Home` 与 `Session Management(strict + active)` MUST 只使用该 worktree 自身 scope，不得隐式带入 parent/sibling。
- `Session Management` MUST 将 filtered total 与 current page visible 分开表达，禁止继续用 `entries.length` 冒充完整项目数量。
- sidebar 或 `Workspace Home` 若只展示 active projection 的窗口子集，MUST 通过共享 projection summary 说明“当前显示子集”与“active total”的关系。
- 任一 source unavailable 时，系统 MUST 暴露 partial/degraded marker；主界面与 `Session Management` MUST 不得把该结果渲染成“完整准确总量”。
- archive/unarchive 后，默认主界面的 active projection 与 `Session Management(strict + active)` MUST 在下一次刷新后保持一致。
- 必须补齐 backend contract、frontend hook/surface 和 Windows/macOS 兼容相关最小回归测试。

## Impact

- Affected backend/runtime:
  - `src-tauri/src/session_management.rs`
  - `src/services/tauri/sessionManagement.ts`
  - `src/services/tauri.ts`
- Affected frontend:
  - `src/app-shell.tsx`
  - `src/features/settings/components/settings-view/sections/SessionManagementSection.tsx`
  - `src/features/workspaces/components/WorkspaceHome.tsx`
  - `src/features/home/components/HomeChat.tsx`
- Affected validation:
  - session catalog / projection Rust tests
  - workspace/session management React tests
  - `npm run lint`
  - `npm run typecheck`
  - targeted `vitest`
  - targeted `cargo test`
