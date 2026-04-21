## 1. P0 Backend Projection Contract（前置依赖）

- [x] 1.1 在 `src-tauri/src/session_management.rs` 定义共享 `workspace session projection summary` DTO，输入为 workspace + status/filter，输出至少包含 `scopeKind`、`ownerWorkspaceIds`、`activeTotal`、`archivedTotal`、`allTotal`、`partialSources`；验证：新增/更新 Rust 单测覆盖 main/worktree scope。
- [x] 1.2 复用现有 `catalog_workspace_scope()` 与 strict catalog 聚合逻辑实现 summary，避免 frontend 复制 scope 规则；验证：main workspace 聚合 child worktrees、worktree-only 隔离场景通过。
- [x] 1.3 补 Windows/macOS 兼容回归，确认路径分隔符、大小写和 worktree 归属不会影响 projection summary；验证：targeted `cargo test` 与现有 local usage/session tests。

## 2. P0 Frontend Shared Adapter

- [x] 2.1 在 `src/services/tauri/sessionManagement.ts` / `src/services/tauri.ts` 增加 summary contract 封装，并在 frontend 提供共享 hook/adapter；验证：TypeScript 类型与调用测试通过。
- [x] 2.2 将 `SessionManagementSection` 改为消费 shared summary，明确区分 `filtered total`、`current page visible`、`selected count`；验证：React 测试覆盖分页/partial source/count copy。
- [x] 2.3 将 sidebar 与 `Workspace Home` 切到 shared `strict + active + unarchived` projection 作为 membership source，运行时线程状态仅做 overlay；验证：同 workspace 下主界面与 `Session Management(strict + active)` 的 scope/count 对齐。

## 3. P1 UX Copy And Degraded Semantics

- [x] 3.1 为 main workspace、worktree、partial source、windowed active list 增加 i18n copy，避免用户把窗口子集误读为完整总量；验证：中英文文案与 snapshot/test 同步。
- [x] 3.2 保留 archive/default-main-surface 既有规则，确保 active projection 为空时仍是 stable empty state，不触发抖动刷新；验证：空态与 archived-only workspace 用例。

## 4. P1 Verification And Rollout

- [x] 4.1 补 targeted `vitest` / `cargo test`，覆盖 scope parity、count parity、partial source explainability、Windows path normalization；验证：测试绿灯。
- [x] 4.2 运行 `npm run lint`、`npm run typecheck`、`npm run check:large-files`、相关 `cargo test`，记录结果与残余 warning；验证：无新增 error。
- [x] 4.3 手工验证 main workspace、worktree、archived-only、partial source 四类场景，确认 sidebar / `Workspace Home` / `Session Management` 不再出现不可解释的数量差异；验证：人工回归记录完成（见 `verification.md`）。
