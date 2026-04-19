## 1. Backend Session Catalog Contract

- [x] 1.1 盘点各引擎现有 history source 与 archive/delete 能力（优先级: P0；依赖: 无；输入: Codex/Claude/Gemini/OpenCode/Shared 现有 command 与文件来源；输出: catalog source matrix；验证: design 中的 source mapping 与代码位置一一对应）
- [x] 1.2 设计统一 `list_workspace_sessions` request/response contract（优先级: P0；依赖: 1.1；输入: workspace/query/cursor/limit；输出: 可分页 catalog payload；验证: spec delta 覆盖字段、cursor 与 degraded marker）
- [x] 1.3 设计统一 archive / unarchive / delete batch command contract（优先级: P0；依赖: 1.2；输入: session ids + workspace id；输出: 支持部分成功/失败保留的结果结构；验证: spec delta 覆盖 partial success 与 retry 语义）
- [x] 1.4 定义 workspace-scoped catalog metadata persistence 方案（优先级: P0；依赖: 1.2；输入: archive state / visibility state；输出: file-based metadata layout + lock/atomic write strategy；验证: design 中明确 storage path 与 concurrency contract）

## 2. Session Management Settings Page

- [x] 2.1 设计独立 `Session Management` 设置页入口与导航落位（优先级: P0；依赖: 1.2；输入: 当前 SettingsView section 结构；输出: 独立入口方案；验证: proposal/design 与现有 `OtherSection` 解耦）
- [x] 2.2 定义会话管理页的查询模型与页面状态机（优先级: P0；依赖: 2.1；输入: keyword/engine/status/cursor/select state；输出: 管理页 view model；验证: tasks/spec 覆盖 active/archived/all 切换）
- [x] 2.3 定义列表交互 contract：查询、分页、多选、批量 archive/unarchive/delete（优先级: P0；依赖: 2.2；输入: catalog payload；输出: 页面交互清单；验证: spec delta 覆盖单条/批量/部分失败/防重入）
- [x] 2.4 规划 `ProjectSessionManagementSection` 的迁移策略（优先级: P1；依赖: 2.1；输入: 现有 settings section；输出: 删除/降级/跳转方案；验证: 不再把核心管理逻辑继续堆在 OtherSection）

## 3. Main Surface Visibility Contract

- [x] 3.1 定义 archive 后默认主界面不可见的统一规则（优先级: P0；依赖: 1.4；输入: sidebar/home/topbar 现有会话入口；输出: active-only projection contract；验证: conversation lifecycle delta 明确 restart-verifiable visibility）
- [x] 3.2 补充“当前已打开 session 被 archive”的软语义规则（优先级: P1；依赖: 3.1；输入: active tab / active thread 场景；输出: 当前上下文保留还是立即收起的产品约束；验证: design open question 收敛为明确决策）
- [x] 3.3 对齐 workspace home recent list 与 topbar tabs 的 archive 过滤边界（优先级: P1；依赖: 3.1；输入: home recent list / topbar rotation window 逻辑；输出: 跨 surface 一致性规则；验证: spec 或测试点明确这些 surface 不回显 archived sessions）

## 4. Validation And Rollout

- [x] 4.1 设计分页正确性验证矩阵（优先级: P0；依赖: 1.2；输入: 200+ 会话、不同引擎混合历史；输出: cursor/page regression checklist；验证: 能证明不是伪分页）
- [x] 4.2 设计 archive visibility 回归矩阵（优先级: P0；依赖: 3.1；输入: archive/unarchive/restart/main UI refresh；输出: 可见性回归用例；验证: archive 后默认主界面消失，unarchive 后恢复）
- [x] 4.3 设计批量操作部分失败与重试回归矩阵（优先级: P0；依赖: 1.3；输入: batch archive/delete/unarchive 场景；输出: 部分失败保留测试点；验证: 失败项保留且可重试）
- [ ] 4.4 规划首期 rollout 边界与回滚方案（优先级: P1；依赖: 4.1-4.3；输入: settings page、main surface filters、catalog command；输出: 分阶段上线方案；验证: design 中包含 rollback path）

## Verification Notes (2026-04-19)

- [x] `pnpm vitest run src/features/settings/components/SettingsView.test.tsx src/features/threads/hooks/useThreadActions.test.tsx src/services/tauri.test.ts`
- [x] `cargo test --manifest-path src-tauri/Cargo.toml session_management::tests -- --nocapture`
- [x] `pnpm vitest run src/app-shell-parts/workspaceThreadListLoadGuard.test.ts src/features/threads/hooks/useThreads.sidebar-cache.test.tsx`
- [x] `pnpm tsc --noEmit`
- [x] `npm run check:large-files`
