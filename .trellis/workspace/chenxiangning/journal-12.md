# Journal - chenxiangning (Part 12)

> Continuation from `journal-11.md` (archived at ~2000 lines)
> Started: 2026-05-09

---



## Session 389: 修复跨平台 CI 前置契约

**Date**: 2026-05-09
**Task**: 修复跨平台 CI 前置契约
**Branch**: `feature/v0.4.15`

### Summary

(Add summary)

### Main Changes

修复 PR #521 中两类 CI 前置契约失败：

- Windows doctor 的 `check-branding` 使用 `fileURLToPath(new URL(...))` 解析仓库根路径，避免 URL pathname 在 Windows 上形成 `D:\D:\...` 双盘符路径。
- macOS Rust CI 的 `memory-kind-contract` 与 `test-tauri` 在 `cargo test` 前执行 `npm run build`，确保 Tauri build script 依赖的 `../dist/*` 资源存在。

验证：
- `npm run check:branding`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml classify_kind_matches_contract_samples`
- `git diff --check -- .github/workflows/ci.yml scripts/check-branding.mjs`

注意：本次提交只包含 `.github/workflows/ci.yml` 与 `scripts/check-branding.mjs`，工作区其他未提交业务改动未纳入提交。


### Git Commits

| Hash | Message |
|------|---------|
| `684395ca` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 390: 轻量准备 Tauri 测试资源

**Date**: 2026-05-09
**Task**: 轻量准备 Tauri 测试资源
**Branch**: `feature/v0.4.15`

### Summary

(Add summary)

### Main Changes

修复上一轮 CI 修复引入的 macOS runner Vite build OOM：

- 将 `memory-kind-contract` 与 `test-tauri` job 中的完整 `npm run build` 前置步骤替换为轻量 `dist` 占位资源准备。
- 占位步骤创建 `dist/index.html` 与 `dist/assets/ci-placeholder.txt`，满足 Tauri build script 对 `frontendDist` 与 bundle resources glob 的编译期契约。
- 避免 Rust unit tests 为了资源 glob 触发完整 Vite production build，从而规避 GitHub macOS runner 默认 Node heap 下的 out-of-memory。

验证：
- `git diff --check -- .github/workflows/ci.yml`
- `cargo test --manifest-path src-tauri/Cargo.toml classify_kind_matches_contract_samples`

注意：本次提交只包含 `.github/workflows/ci.yml` follow-up 修复，工作区其他未提交业务改动未纳入提交。


### Git Commits

| Hash | Message |
|------|---------|
| `b1f43c8a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 391: 隔离 OpenCode CLI 测试依赖

**Date**: 2026-05-09
**Task**: 隔离 OpenCode CLI 测试依赖
**Branch**: `feature/v0.4.15`

### Summary

(Add summary)

### Main Changes

修复 Rust OpenCode 测试在 CI 无 opencode CLI 时失败的问题。将 opencode command 构造测试改为创建临时 fake opencode/opencode.cmd 并通过 EngineConfig.bin_path 注入，避免依赖开发机 PATH。同步修正 status lightweight 测试的 fake CLI 文件名为 resolver 接受的 opencode，确保 matching_custom_bin 不会忽略测试二进制。验证通过 cargo test --manifest-path src-tauri/Cargo.toml engine::opencode::tests::build_command 和 cargo test --manifest-path src-tauri/Cargo.toml engine::status::tests::detect_opencode_status_lightweight_skips_models_probe。


### Git Commits

| Hash | Message |
|------|---------|
| `c2e24bba` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 392: 修复 branding Windows 路径匹配

**Date**: 2026-05-09
**Task**: 修复 branding Windows 路径匹配
**Branch**: `feature/v0.4.15`

### Summary

(Add summary)

### Main Changes

修复 check-branding 在 Windows CI 下把反斜杠路径误判为未白名单的问题。脚本现在将 relative(ROOT, file) 输出统一归一化为 POSIX 风格路径，再进入 shouldSkip 和 allowed-line 匹配，确保既有迁移兼容文件、测试文件和 legacy storage key 白名单在 Windows 上也生效。验证通过 npm run check:branding，并额外用 Node 断言验证 src\features\prompts\promptUsage.ts 会归一化为 src/features/prompts/promptUsage.ts。


### Git Commits

| Hash | Message |
|------|---------|
| `57f01b9e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 393: 客户端说明文档窗口收口

**Date**: 2026-05-09
**Task**: 客户端说明文档窗口收口
**Branch**: `feature/v0.4.15`

### Summary

实现并验证客户端说明文档独立窗口，默认隐藏入口，补齐 OpenSpec 与 CI/兼容门禁。

### Main Changes

- 新增 `client-documentation-window` OpenSpec change 与主 spec，覆盖独立窗口、主窗体入口、树形目录、详情说明、隐藏入口、模块 icon、详细使用步骤、UI visibility 控件文档、CI 门禁和 Win/Mac 兼容边界。
- 新增 `src/features/client-documentation/**`，内置 15 个一级模块与截图相关 20 个 UI visibility 控件说明；窗口使用 Tauri `WebviewWindow` open-or-focus，不依赖 shell `open` / Windows `start`。
- 增加并发点击边界守护：`openOrFocusClientDocumentationWindow()` 合并 in-flight 创建请求，避免连续点击产生重复窗口或错误 toast。
- 集成主窗体顶部工具按钮，并通过 `topTool.clientDocumentation` 默认隐藏；用户可在 Settings > Basic > UI visibility 中打开。
- 增加路由、样式、i18n、设置图标、布局与 visibility 相关测试。
- 验证通过：focused Vitest 36 tests、`npm run typecheck`、`npm run lint`、`npm run test` 444 files、`npm run check:runtime-contracts`、`npm run doctor:win`、`cargo test`、`npm run tauri -- build --debug --no-bundle`、`npm run check:large-files`、`openspec validate add-client-module-documentation-window --strict --no-interactive`、`openspec validate client-documentation-window --strict --no-interactive`、`openspec validate --all --strict --no-interactive`。
- 注意：`CHANGELOG.md` 与 `src/features/git-history/components/GitHistoryPanel.test.tsx` 是提交前已存在/未纳入本次 feature commit 的脏文件，保留未提交。


### Git Commits

| Hash | Message |
|------|---------|
| `1a6773ae` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 394: 提交剩余变更文件

**Date**: 2026-05-09
**Task**: 提交剩余变更文件
**Branch**: `feature/v0.4.15`

### Summary

提交剩余 CHANGELOG 与 Git history 测试稳定性变更，并完成目标验证。

### Main Changes

- 按用户要求提交剩余两个文件：`CHANGELOG.md` 和 `src/features/git-history/components/GitHistoryPanel.test.tsx`。
- `CHANGELOG.md` 补充 0.4.15 中英文变更说明，包括文件行标注上下文、OpenSpec 同步归档、Claude thinking visibility、文件树瞬态空态、Claude history/control-plane 与 synthetic transcript 修复说明。
- `GitHistoryPanel.test.tsx` 增加 `clickReadyCreatePrAction()` helper，等待 create PR 按钮解除 `aria-disabled` 后再点击，降低异步加载期间的测试竞态。
- 验证通过：`npm exec vitest run src/features/git-history/components/GitHistoryPanel.test.tsx`（40 tests）、`npm run typecheck`、`npm run lint`。
- 提交前后确认工作区从剩余 2 个脏文件变为 clean。


### Git Commits

| Hash | Message |
|------|---------|
| `fbec17f0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 395: 修复 Web service 重连后线程状态补偿

**Date**: 2026-05-09
**Task**: 修复 Web service 重连后线程状态补偿
**Branch**: `feature/v0.4.15`

### Summary

Web service 浏览器端 WebSocket 重连后，前端执行轻量状态补偿，避免断线期间错过完成事件导致 UI 长时间停留在进行中。

### Main Changes

- Web service shim 区分首次连接和重连，仅重连成功时派发浏览器本地事件 `mossx:web-service-reconnected`。
- 前端事件服务集中导出 reconnect event name 和订阅 helper，避免字符串漂移。
- `useThreads` 仅在 Web service runtime 注册 reconnect listener；重连后刷新 active workspace thread list，并在 active thread 仍 processing 时刷新该 thread snapshot。
- 新增 hook 回归测试覆盖 active workspace 刷新与 active processing thread 刷新。
- OpenSpec change `fix-web-service-reconnect-state-refresh` 已创建并通过 strict validation。

验证：
- `npx vitest run src/features/threads/hooks/useThreads.engine-source.test.tsx` 通过，12 tests。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `git diff --check` 通过。
- `openspec validate fix-web-service-reconnect-state-refresh --strict --no-interactive` 通过。


### Git Commits

| Hash | Message |
|------|---------|
| `e2e5ac3a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 396: 清理重连事件旧品牌命名

**Date**: 2026-05-09
**Task**: 清理重连事件旧品牌命名
**Branch**: `feature/v0.4.15`

### Summary

将 web-service reconnect DOM 事件命名空间从 mossx 切换为 ccgui，并随同提交已有 startup 异步断言稳定性调整。

### Main Changes

- Updated `src/services/events.ts` so `WEB_SERVICE_RECONNECTED_EVENT` now uses `ccgui:web-service-reconnected`.
- Updated `src-tauri/src/bin/cc_gui_daemon/web_service_runtime.rs` so the injected web-service shim dispatches the same `ccgui:web-service-reconnected` event.
- Included existing `src/app-shell.startup.test.tsx` workspace change that wraps `queueSaveSettings` assertion in `waitFor` for async startup stability.
- Verified `npm run check:branding` passes.
- Verified `npm run check:runtime-contracts` passes.


### Git Commits

| Hash | Message |
|------|---------|
| `18fcf4a7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 397: 固定雷达增量测试时钟

**Date**: 2026-05-09
**Task**: 固定雷达增量测试时钟
**Branch**: `feature/v0.4.15`

### Summary

修复 useSessionRadarFeed 增量刷新测试的真实时间依赖：冻结首个引用复用用例的系统时间，并在 afterEach 恢复 real timers，避免 CI 跨秒导致 durationMs 更新后对象引用断言偶发失败。验证：npm exec vitest run src/features/session-activity/hooks/useSessionRadarFeed.incremental.test.tsx。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f8fa5506` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 398: 归档已验证提案

**Date**: 2026-05-09
**Task**: 归档已验证提案
**Branch**: `feature/v0.4.16`

### Summary

批量归档 5 个已验证的 OpenSpec 提案，整理活跃变更列表并保留归档历史。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b62df054` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 399: 归档文件行标注提案

**Date**: 2026-05-09
**Task**: 归档文件行标注提案
**Branch**: `feature/v0.4.16`

### Summary

归档 add-file-line-annotation-composer-bridge OpenSpec change，并将最后两项手动验证任务标记完成后提交归档移动。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4bc81165` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 400: 接入会话归档菜单

**Date**: 2026-05-09
**Task**: 接入会话归档菜单
**Branch**: `feature/v0.4.16`

### Summary

复用现有 archiveWorkspaceSessions 能力，为会话右键菜单接入归档入口，并隐藏 shared 会话的 unsupported 归档入口。

### Main Changes

## 完成内容
- 在 Sidebar/useLayoutNodes/useSidebarMenus 链路接入 onArchiveThread。
- 复用 services/tauri 的 archiveWorkspaceSessions 归档单个会话。
- 普通会话右键菜单展示 Archive，shared 会话通过 canArchive=false 隐藏 Archive，避免触发 backend UNSUPPORTED_SHARED_SESSION。
- 新增 workspace.archiveConversationFailed 中英文文案，避免归档失败时误显示删除失败。
- 补充 useSidebarMenus、ThreadList、PinnedThreadList 测试覆盖归档菜单与 shared 会话隐藏归档。

## 验证
- npx vitest run src/features/app/hooks/useSidebarMenus.test.tsx src/features/app/components/ThreadList.test.tsx src/features/app/components/PinnedThreadList.test.tsx
- npx eslint src/features/app/hooks/useSidebarMenus.ts src/features/app/hooks/useSidebarMenus.test.tsx src/features/app/components/ThreadList.tsx src/features/app/components/ThreadList.test.tsx src/features/app/components/PinnedThreadList.tsx src/features/app/components/PinnedThreadList.test.tsx src/features/app/components/WorkspaceSessionFolderTree.tsx src/features/app/components/WorktreeSection.tsx src/app-shell-parts/useAppShellLayoutNodesSection.tsx src/i18n/locales/en.part2.ts src/i18n/locales/zh.part2.ts
- git diff --check

## 注意
- 提交时精确暂存 locale 文件中的 archiveConversationFailed 文案，未包含同文件已有的 reasoning effort 改动。
- commit 后工作区仍保留 unrelated reasoning effort / Claude engine / OpenSpec 未提交改动。


### Git Commits

| Hash | Message |
|------|---------|
| `c51a75a5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 401: 实现 Claude reasoning effort 支持

**Date**: 2026-05-09
**Task**: 实现 Claude reasoning effort 支持
**Branch**: `feature/v0.4.16`

### Summary

完成 Claude reasoning effort 的 OpenSpec 提案、前端 selector 链路、Tauri 参数透传、边界修复与门禁验证。

### Main Changes

## 完成内容
- 创建并完成 OpenSpec change `add-claude-reasoning-effort-support` 与 Trellis task `05-09-05-09-add-claude-reasoning-effort-support`。
- 前端为 Claude 暴露 reasoning selector，支持 `low` / `medium` / `high` / `xhigh` / `max`，空值显示 `Claude 默认`。
- Tauri Claude engine 读取 `params.effort`，仅 allowlist 合法值后追加 `--effort <value>`。
- Review 后修复非法 effort fallback、空 options 展示全部等级、Claude 默认文案不一致等边界问题。

## 验证
- `npx vitest run src/app-shell-parts/modelSelection.test.ts src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx src/features/composer/components/ChatInputBox/selectors/ReasoningSelect.test.tsx src/features/composer/components/ComposerInput.collaboration.test.tsx src/features/composer/components/ChatInputBox/ButtonArea.test.tsx src/services/tauri.test.ts --maxWorkers 1 --minWorkers 1`
- `cargo test build_command_`
- `npm run typecheck`
- `npm run lint`
- `openspec validate add-claude-reasoning-effort-support --strict --no-interactive`
- `openspec validate --all --strict --no-interactive`
- `npm run check:large-files:gate`
- `npm run check:large-files:near-threshold`
- `node --test scripts/check-large-files.test.mjs`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:heavy-test-noise`
- `git diff --check`

## 留意
- 大文件 hard gate 为 0；near-threshold 仍有既有 watch 告警，本次未做强拆。
- 工作区仍保留两个未跟踪旁路 OpenSpec change：`add-claude-fork-session-support`、`add-subagent-session-tree-navigation`，未纳入本次提交。


### Git Commits

| Hash | Message |
|------|---------|
| `6576d61d4643c3a65748c0a01ab60cd5df57b2df` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 402: Codex 计划模式入口联动

**Date**: 2026-05-10
**Task**: Codex 计划模式入口联动
**Branch**: `feature/v0.4.16`

### Summary

Codex 模式菜单只保留计划模式和全自动，并让计划模式菜单项与配置面板开关共享 collaboration mode 状态。

### Main Changes

- Codex provider 下 `ModeSelect` 只渲染 `plan` 与 `bypassPermissions`，隐藏建议模式与自动编辑入口。
- `ModeSelect` 接入 `selectedCollaborationModeId/onSelectCollaborationMode`，计划模式与配置面板开关共用同一状态。
- 修复 review 发现的 stale permission value 边界：Codex plan switch 关闭时，即使 legacy `permissionMode` 是 `default`，菜单仍显示全自动。
- 暂存提交时只纳入本次 UI 联动 hunk，保留工作树里其它未提交改动。
- 验证：`npx vitest run src/features/composer/components/ChatInputBox/selectors/ModeSelect.test.tsx src/features/composer/components/ChatInputBox/selectors/ConfigSelect.test.tsx` 通过；`npm run lint` 通过；`npm run typecheck` 因既有未提交改动 `src/features/threads/hooks/useThreadActionsSessionRuntime.ts(111,43)` 失败，非本次提交范围。


### Git Commits

| Hash | Message |
|------|---------|
| `ee4f4b7e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 403: 接入 Claude 原生 fork session

**Date**: 2026-05-10
**Task**: 接入 Claude 原生 fork session
**Branch**: `feature/v0.4.16`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
|------|---------|
| Claude fork | Added native Claude CLI fork support with `--resume <parent-session-id> --fork-session`, including frontend-to-daemon-to-engine parameter wiring. |
| Composer entry | Added Codex/Claude Fork quick action in composer config menus and wired it to the existing fork command path. |
| Session continuity | Treated `claude-fork:*` bootstrap threads as pending Claude sessions, copied parent history for initial render, migrated title mappings after the real Claude session id arrives, and persisted `fork-` thread titles. |
| Safety | Rejected invalid `forkSessionId` values before command spawn and prevented silent fallback to normal resume/continue behavior. |
| Verification | Ran focused TypeScript/Rust tests, typecheck, lint, runtime contract checks, OpenSpec validation, large-file governance, and heavy-test-noise sentry. |


### Git Commits

| Hash | Message |
|------|---------|
| `a34f3458` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 404: 记录 Claude 上下文用量与子代理历史提交

**Date**: 2026-05-11
**Task**: 记录 Claude 上下文用量与子代理历史提交
**Branch**: `feature/v0.4.16`

### Summary

(Add summary)

### Main Changes

- 提交 `feat(engine): 支持 Claude 上下文用量与子代理历史`。
- 后端新增 Claude context usage 事件字段、completion 后 `/context` 探测与 legacy CLI fallback。
- Claude history 扫描子代理 transcript/metadata，保持 parent session 关系并覆盖 load/fork/delete/catalog 链路。
- 增加跨平台 Claude home resolver，兼容 Windows/macOS 路径与配置来源。
- 拆分 context usage 与子代理历史相关 Rust 测试，配合大文件治理。

验证记录：此前已通过 `cargo test --manifest-path src-tauri/Cargo.toml --lib`、`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`npm run check:large-files:gate`、`npm run check:heavy-test-noise`、`git diff --check`。


### Git Commits

| Hash | Message |
|------|---------|
| `7597a551` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 405: 记录 Claude 上下文用量和子代理树 UI 提交

**Date**: 2026-05-11
**Task**: 记录 Claude 上下文用量和子代理树 UI 提交
**Branch**: `feature/v0.4.16`

### Summary

(Add summary)

### Main Changes

- 提交 `feat(ui): 展示 Claude 上下文用量和子代理树`。
- Composer/ChatInputBox 增加 Claude context usage 展示，覆盖 live、estimated、pending、stale 等状态。
- Sidebar/ThreadList 将 Claude/Codex 子代理会话展示为明确父子层级，父 session 保持原位置，子 session 小缩进，折叠 icon 放到右侧控制区。
- 补齐 folder 继承、父子移动、session activity 子代理 timeline/tab 与 Codex child-agent completion 防早停/防卡 loading 保护。
- 增加 frontend regression tests 覆盖子代理树、token usage、workspace folder、session activity 与 Codex 子代理完成边界。

验证记录：此前已通过 `npm run typecheck`、`npm run lint`、`npm run check:large-files:gate`、`npm run check:heavy-test-noise`、`openspec validate add-subagent-session-tree-navigation --strict`、`git diff --check`。


### Git Commits

| Hash | Message |
|------|---------|
| `919b2615` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 406: 记录 Claude context 与子代理树方案文档提交

**Date**: 2026-05-11
**Task**: 记录 Claude context 与子代理树方案文档提交
**Branch**: `feature/v0.4.16`

### Summary

(Add summary)

### Main Changes

- 提交 `docs(spec): 记录 Claude context 和子代理树方案`。
- 新增 `fix-claude-context-usage-display` OpenSpec proposal/design/tasks/delta spec，描述 Claude context usage 显示、fallback、边界状态与验收要求。
- 新增 `add-subagent-session-tree-navigation` OpenSpec proposal/design/tasks/delta spec，描述 Sidebar 子代理父子树、折叠行为、pending/真实 child row 与父子顺序约束。
- 新增 Trellis backend/frontend executable contract，并更新 spec index，方便后续 review 直接定位规则。

验证记录：此前已通过 `openspec validate add-subagent-session-tree-navigation --strict`、`npm run check:large-files:gate`、`npm run check:heavy-test-noise`、`git diff --check`。


### Git Commits

| Hash | Message |
|------|---------|
| `51954a1b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 407: 修复 cc_gui_daemon 打包：补齐 claude_history_subagents 模块

**Date**: 2026-05-11
**Task**: 修复 cc_gui_daemon 打包：补齐 claude_history_subagents 模块
**Branch**: `feature/v0.4.16`

### Summary

daemon 的 engine_bridge 漏挂 claude_history_subagents 导致 CI/打包 Rust unresolved import；补齐模块声明并通过 cargo check/test 验证

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7fd55178` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 408: 记录客户端启动编排归档

**Date**: 2026-05-11
**Task**: 记录客户端启动编排归档
**Branch**: `feature/v0.4.16`

### Summary

归档客户端启动编排 OpenSpec 变更并提交 startup orchestrator 实现与边界修复

### Main Changes

## 工作摘要

- 归档 OpenSpec 变更 `refactor-client-startup-orchestrator` 到 `openspec/changes/archive/2026-05-10-refactor-client-startup-orchestrator/`。
- 同步新增主规范 `openspec/specs/client-startup-orchestration/spec.md`。
- 提交客户端启动编排实现：Startup Orchestrator、startup trace、任务 owner guard、启动/前台恢复分阶段调度、runtime notice 镜像、idle/on-demand hydration、相关 i18n 和回归测试。
- Review 并修复边界问题：hard-abort cancellation fallback、startup trace snapshot identity、session radar prewarm in-flight guard、focus refresh unmount cleanup、skills hook 格式漂移。

## 验证

- `npm run typecheck`
- `npm run lint`
- `npx vitest run src/features/startup-orchestration/utils/startupTrace.test.ts src/features/startup-orchestration/utils/startupOrchestrator.test.ts src/app-shell-parts/useWorkspaceThreadListHydration.test.tsx src/features/workspaces/hooks/useWorkspaceRefreshOnFocus.test.tsx src/features/skills/hooks/useSkills.test.tsx`
- `npm run check:runtime-contracts`
- `openspec validate refactor-client-startup-orchestrator --strict`
- `openspec archive refactor-client-startup-orchestrator --yes`
- `openspec validate client-startup-orchestration --strict`
- `openspec validate --specs --strict`
- `node --test scripts/check-large-files.test.mjs`
- `npm run check:large-files:near-threshold`（仅 watch warnings，无 fail debt）
- `npm run check:large-files:gate`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:heavy-test-noise`（453 test files，act/stdout/stderr payload noise 为 0）
- `git diff --check`


### Git Commits

| Hash | Message |
|------|---------|
| `39c6fac0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
