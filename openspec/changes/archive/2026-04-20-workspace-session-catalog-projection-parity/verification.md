# workspace-session-catalog-projection-parity Verification

## Manual Regression Record

- Date: 2026-04-20
- Executor: Codex
- Method:
  - 启动本地 `tauri dev`
  - 启动当前代码编译产物 `cc_gui_daemon`（`127.0.0.1:4733`）并指向真实 `codemoss` data dir
  - 直接调用 daemon RPC 读取 `list_workspaces`、`list_workspace_sessions`、`get_workspace_session_projection_summary`
  - 对照 `~/.ccgui/client/threads.json` 中的 `sidebarSnapshot`，核对主界面缓存线程窗口与新 projection summary 的 owner scope / count explainability
- Note:
  - 当前 agent 无法获得 macOS 辅助访问与屏幕录制权限，所以未执行 GUI 点击录屏式手测。
  - 本次验证使用真实本机数据文件与真实运行中的 daemon / snapshot 数据，覆盖的是用户当前环境的实际数据集，而不是 mock fixture。

## Scenario 1: main workspace (`mossx`)

- Workspace: `mossx`
- Scope result:
  - `scopeKind=project`
  - `ownerWorkspaceIds=[mossx, codex/2026-03-28-ghdi, codex/2026-04-01-local]`
- Counts:
  - projection summary(active): `filteredTotal=33`
  - first page(active): `8` rows, `nextCursor=offset:8`
  - sidebar snapshot cached threads:
    - `mossx=18`
    - `codex/2026-03-28-ghdi=7`
    - `codex/2026-04-01-local=4`
    - aggregated cached visible window = `29`
- Partial source:
  - `opencode-history-unavailable`
- Verdict:
  - main workspace 已正确覆盖 main + worktrees 三个 owner workspace，scope 不再丢 worktree。
  - `33 vs 29` 的差异现在可以被解释为 “历史 catalog 总量 vs sidebar 当前缓存窗口”，不再是 scope 漏算。
  - 管理页需要显示 `filtered total` 与 `current page/window` 的分离提示，本次实现已覆盖该语义。

## Scenario 2: worktree (`codex/2026-04-01-local`)

- Workspace: `codex/2026-04-01-local`
- Scope result:
  - `scopeKind=worktree`
  - `ownerWorkspaceIds=[codex/2026-04-01-local]`
- Counts:
  - projection summary(active): `filteredTotal=4`
  - first page(active): `4` rows, no next cursor
  - sidebar snapshot cached threads: `4`
- Verdict:
  - worktree scope 已隔离为 self-only，没有串到 parent main workspace 或 sibling worktree。
  - worktree 页面 count 与缓存窗口一致。

## Scenario 3: archived-only / empty archived state

- Workspaces checked:
  - `mossx`
  - `codex/2026-04-01-local`
  - `workspace`
  - `JinSen`
- Result:
  - `archivedTotal=0`
  - archived page rows = `0`
  - no cursor
- Verdict:
  - 当前真实数据集中没有 archived session corpus，但 archived filter 的空态稳定成立。
  - 这验证了“active projection 为空或 archived-only 查询为空时，不出现抖动计数/错误提示”的退化语义。

## Scenario 4: partial source

- Workspaces with degradation found:
  - `mossx`
  - `codex/2026-03-28-ghdi`
- Partial source:
  - `opencode-history-unavailable`
- Verdict:
  - degradation 已同时出现在 projection summary 与 page response 中。
  - UI 现在可以把 “数据不完整” 明确解释给用户，而不是 silently undercount。

## Additional Real-Data Checks

- `workspace`
  - projection summary(active): `filteredTotal=345`
  - first page(active): `8`
  - sidebar snapshot cached threads: `9`
  - 说明主界面窗口与历史 catalog 总量已明确是两层语义，不再误导成“主界面就代表完整历史”。

- `JinSen`
  - projection summary(active): `filteredTotal=149`
  - first page(active): `8`
  - sidebar snapshot cached threads: `54`
  - 说明大项目历史会话总量可被完整检出，主界面保留的是窗口化线程 surface。

## Final Manual Regression Conclusion

- `main workspace`：通过。scope 已覆盖 main + child worktrees。
- `worktree`：通过。scope 保持 self-only。
- `archived-only / empty archived`：通过。当前真实数据无 archived corpus，但空态与计数语义稳定。
- `partial source`：通过。degradation 可解释。
- Remaining product truth:
  - sidebar / Workspace Home 仍然是“active runtime/cache surface”
  - Session Management 是“history catalog surface”
  - 本次修复解决的是两者的 **scope parity** 与 **count explainability**，不是把两个面板强行变成同一种产品语义。
