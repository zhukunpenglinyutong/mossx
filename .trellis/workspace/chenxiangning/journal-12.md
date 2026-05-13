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


## Session 409: 精简 status panel 对话面板视觉

**Date**: 2026-05-11
**Task**: 精简 status panel 对话面板视觉
**Branch**: `feature/v0.4.16`

### Summary

精简 dock 状态面板 tab 与用户对话时间线展示，去除冗余下划线和排序胶囊。

### Main Changes

## 本次提交
- Commit: d456f253f96b3847220af625891fd755b4b4b9ca
- 标题: style(status-panel): 精简对话面板标签视觉

## 主要改动
- 去掉 dock 状态面板 tab 选中下划线，改为 active icon 蓝色高亮。
- 为 dock tab bar 增加完整边框，并压缩圆角、padding 与底部留白，让顶部区域更紧凑。
- 移除用户对话时间线中的排序胶囊和对应 i18n 文案，只保留 #n 编号。
- 同步更新 StatusPanel 与 UserConversationTimelinePanel 测试断言。

## 验证
- npx vitest run src/features/status-panel/components/UserConversationTimelinePanel.test.tsx src/features/status-panel/components/StatusPanel.test.tsx
- npx vitest run src/styles/status-panel-theme.test.ts


### Git Commits

| Hash | Message |
|------|---------|
| `d456f253f96b3847220af625891fd755b4b4b9ca` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 410: 修复标注交互闪烁

**Date**: 2026-05-11
**Task**: 修复标注交互闪烁
**Branch**: `feature/v0.4.16`

### Summary

修复带标注用户气泡初始测量闪烁与 Markdown 预览 AI 标注按钮 hover 闪烁。

### Main Changes

## Work Summary
- 修复 `CollapsibleUserTextBlock` 初始高度测量时的 max-height transition 闪烁。
- 在 content 变化时重新进入测量保护，避免 optimistic/reconciled 文本复用时再次闪动。
- 收窄 Markdown 预览段落 AI 标注按钮 hover 稳定区，使用 `pointer-events: none` 避免隐形层截获点击。

## Files
- `src/features/messages/components/CollapsibleUserTextBlock.tsx`
- `src/features/messages/components/CollapsibleUserTextBlock.test.tsx`
- `src/styles/messages.part1.css`
- `src/styles/file-view-panel.css`

## Validation
- `npm exec vitest run src/features/messages/components/CollapsibleUserTextBlock.test.tsx`
- `npm exec vitest run src/features/files/components/FileViewPanel.test.tsx -- --testNamePattern="markdown annotation|markdown modes"`
- `npm exec vitest run src/features/composer/components/Composer.file-reference-token.test.tsx`

## Notes
- 本次 commit 只包含 UI 标注闪烁修复。
- 工作区中已有 git/Rust/tauri 相关未提交改动未纳入本次提交。


### Git Commits

| Hash | Message |
|------|---------|
| `b2f87f6d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 411: 修复非仓库工作区 git 状态轮询

**Date**: 2026-05-11
**Task**: 修复非仓库工作区 git 状态轮询
**Branch**: `feature/v0.4.16`

### Summary

backend get_git_status 在 non-git workspace 返回稳定空快照；frontend useGitStatus 在确认非仓库后停止自动轮询并保留手动刷新；同时修复 non-git UI 误显示为 clean 的问题，并完成 lint、typecheck、git hook/panel 测试、cargo test 与 doctor:strict 验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b331208c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 412: 修复失效输入请求卡片关闭

**Date**: 2026-05-11
**Task**: 修复失效输入请求卡片关闭
**Branch**: `feature/v0.4.16`

### Summary

为 requestUserInput 卡片增加纯前端关闭路径，避免错过回答时机后 stale request 继续提交失败并阻塞后续对话。

### Main Changes

- 新增 `handleUserInputDismiss`，只移除 pending user input request，不调用 `respondToUserInputRequest`，不标记 processing，不插入提交历史记录。
- 将 dismiss 回调从 `useThreads` 透传到 `useLayoutNodes`、`Messages`、`RequestUserInputMessage`，在提交按钮旁新增“关闭”按钮。
- 补充中英文 i18n、按钮样式和测试 mock 文案。
- 增加组件层、Messages 层、hook 层回归测试，覆盖关闭不提交 stale answer、queue 移除后卡片消失、runtime submit 不被调用。

验证：
- `npx vitest run src/features/app/components/RequestUserInputMessage.test.tsx src/features/messages/components/chatCanvasSmoke.test.tsx src/features/threads/hooks/useThreadUserInput.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run check:large-files`


### Git Commits

| Hash | Message |
|------|---------|
| `7a524810` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 413: 修复 macOS native 菜单死锁风险

**Date**: 2026-05-11
**Task**: 修复 macOS native 菜单死锁风险
**Branch**: `feature/v0.4.17`

### Summary

迁移高风险 Tauri native popup 到 renderer menu，收窄 Rust menu registry 锁作用域，新增 native menu 静态守卫和 OpenSpec 变更。

### Main Changes

## 完成内容

- 基于 macOS hang stackshot 定位 Tauri native menu / WebKit URL scheme / main runloop 互等风险。
- 创建并实现 OpenSpec change `fix-tauri-native-menu-deadlock`。
- 新增 `RendererContextMenu`，将 commit message selector、sidebar thread/worktree menu、file link menu 从 Tauri native popup 迁移到 renderer-owned menu。
- 修复 `src-tauri/src/menu.rs` 中 `MenuItemRegistry::set_text` 持锁调用 native mutator 的风险。
- 新增 `scripts/check-native-menu-usage.mjs` 和 `npm run check:native-menu-usage`，阻止 P0 路径回退到 native menu。
- 补充 focused tests：`RendererContextMenu`、`useFileLinkOpener`、sidebar/status-panel 相关回归。

## 验证

- `npm run typecheck` passed。
- `npx vitest run src/components/ui/RendererContextMenu.test.tsx src/features/messages/hooks/useFileLinkOpener.test.tsx src/features/app/hooks/useSidebarMenus.test.tsx src/features/status-panel/components/StatusPanel.test.tsx` passed，91 tests。
- `cargo test --manifest-path src-tauri/Cargo.toml menu --lib` passed，3 tests。
- `npm run check:native-menu-usage` passed。
- `npm run check:large-files:gate` passed。
- `openspec validate fix-tauri-native-menu-deadlock --type change --strict --no-interactive` passed。

## 剩余事项

- macOS 手测矩阵仍需人工确认：重复操作 commit selector、sidebar menu、file link menu，观察是否仍出现不可恢复 hang。
- P1 剩余 native popup allowlist 后续继续收敛。


### Git Commits

| Hash | Message |
|------|---------|
| `3dcc5163` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 414: 记录 Codex SessionStart hook 兜底恢复

**Date**: 2026-05-12
**Task**: 记录 Codex SessionStart hook 兜底恢复
**Branch**: `feature/v0.4.17`

### Summary

为 Codex thread/start 增加 SessionStart hook-safe fallback，覆盖 invalid response、hook timeout、Windows wrapper retry、active work guard 与前端 warning，并补齐 OpenSpec 验证矩阵。

### Main Changes

本次提交：631695f7 fix(codex): 兜底恢复 SessionStart hook 阻塞

主要改动：
- 新增 OpenSpec change fix-codex-sessionstart-hook-fallback，记录 proposal/design/spec/tasks/verification。
- 后端在 thread/start 缺少 thread id 或命中明确 SessionStart hook failure 时执行一次有界 hook-safe fallback。
- fallback runtime 使用 session-hooks-disabled launch mode，并通过 CODEX_NON_INTERACTIVE=1 跳过项目 SessionStart hooks。
- 保留 Windows wrapper compatibility retry，并在 hook-safe retry 中保持 SessionHooksDisabled mode。
- fallback 前检查 active work protection，避免替换正在工作的 Codex runtime。
- fallback 成功后返回 ccguiHookSafeFallback metadata，前端展示 runtime warning。
- 补充 Rust 自动化矩阵覆盖 normal hook、no hook、broken hook、slow hook、plain non-hook timeout。

验证：
- cargo test --manifest-path src-tauri/Cargo.toml sessionstart_hook_matrix -- --nocapture
- cargo test --manifest-path src-tauri/Cargo.toml hook_safe_fallback -- --nocapture
- npm exec vitest run src/features/threads/hooks/useThreadActions.test.tsx
- openspec validate --all --strict --no-interactive
- git diff --check

注意：
- 提交时只 stage 了本 change 的 17 个文件；仓库中其他未提交 WIP 保持未暂存，未纳入 631695f7。


### Git Commits

| Hash | Message |
|------|---------|
| `631695f7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 415: 归档完成 OpenSpec 提案

**Date**: 2026-05-12
**Task**: 归档完成 OpenSpec 提案
**Branch**: `feature/v0.4.17`

### Summary

归档已完成 OpenSpec changes，并同步主 specs。

### Main Changes

- 归档 7 个完成态 OpenSpec change，包括 composer readiness、conversation fact contract、runtime lifecycle、Claude fork/reasoning/subagent tree、Codex SessionStart fallback。
- 同步新增/修改主 specs：composer readiness、conversation fact contract、runtime lifecycle stability、Codex stale binding、Codex app server wrapper launch 等。
- 补充 client stability readiness 与 manual test matrix 文档。
- 验证：openspec validate --all --strict 253 passed；git diff --check 通过。


### Git Commits

| Hash | Message |
|------|---------|
| `e64182b7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 416: 稳定 Codex 会话生命周期恢复

**Date**: 2026-05-12
**Task**: 稳定 Codex 会话生命周期恢复
**Branch**: `feature/v0.4.17`

### Summary

提交 Codex runtime lifecycle、stale binding 与 create-session race 后端修复。

### Main Changes

- 增强 Codex create-session 在 stopping/manual-shutdown race 下的 bounded retry 与 recovery probe。
- 增加 runtime lifecycle state、transition 测试、quarantine/reconnect refresh 诊断与 snapshot 更新。
- 注册 `note_web_service_reconnected` 命令，支持 WebService reconnect 后刷新 runtime/thread 状态。
- 补充 Rust targeted tests 覆盖 lifecycle transition、recovery guard、stale runtime reuse 与 diagnostics。
- 验证：本批提交前执行 git diff --cached --check 通过；前置全量 openspec validate 与 git diff --check 已通过。


### Git Commits

| Hash | Message |
|------|---------|
| `6ac6aad6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 417: 收敛会话事实与恢复状态

**Date**: 2026-05-12
**Task**: 收敛会话事实与恢复状态
**Branch**: `feature/v0.4.17`

### Summary

提交 conversation fact contract、runtime reconnect 与前端恢复状态收敛。

### Main Changes

- 新增 conversation fact contract 及测试，统一 accepted turn、durable activity、tool/approval/image 等事实判断。
- 增强 conversation normalization、assembler、history loader 与 useThreads/useThreadMessaging 的 runtime recovery 语义。
- 增加 runtime reconnect card、global runtime notice dock、manual recovery 与 app-shell recovery tests。
- 接入 WebService reconnect runtime refresh 前端 service，并补充中英文文案与共享类型字段。
- 验证：本批提交前执行 git diff --cached --check 通过；前置全量 openspec validate 与 git diff --check 已通过。


### Git Commits

| Hash | Message |
|------|---------|
| `6240dae3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 418: 增强 Composer 发送就绪与队列提示

**Date**: 2026-05-12
**Task**: 增强 Composer 发送就绪与队列提示
**Branch**: `feature/v0.4.17`

### Summary

提交 Composer send readiness projection、readiness bar 与队列输入提示。

### Main Changes

- 新增 `composerSendReadiness` projection 与测试，统一目标模型、context summary、activity、primary action 与 disabled reason。
- 新增 `ComposerReadinessBar`，在 ChatInputBox/Header/Queue 中展示发送就绪、排队、请求跳转与 context 展开提示。
- 调整 status panel toggle 到 tool dock，补充 ButtonArea/Adapter/Composer 回归测试。
- 更新 ChatInputBox 样式与 home chat composer control band，保持桌面/移动布局稳定。
- 验证：本批提交前执行 git diff --cached --check 通过；前置全量 openspec validate 与 git diff --check 已通过。


### Git Commits

| Hash | Message |
|------|---------|
| `adbb99c3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 419: 补齐 App 交互锚点与菜单测试

**Date**: 2026-05-12
**Task**: 补齐 App 交互锚点与菜单测试
**Branch**: `feature/v0.4.17`

### Summary

提交 request-user-input 锚点、sidebar renderer menu 测试与 diff stat 样式收尾。

### Main Changes

- 为 request-user-input card 增加稳定 DOM anchor、request/workspace/thread data attributes 与可聚焦目标，便于跳转定位。
- 将 Sidebar 相关测试从 Tauri native menu mock 调整为 renderer-owned menu 断言，匹配当前菜单实现。
- 调整 diff stat add/del 为 tabular numeric inline-block，减少工具块数字列抖动。
- 验证：本批提交前执行 git diff --cached --check 通过；前置全量 openspec validate 与 git diff --check 已通过。


### Git Commits

| Hash | Message |
|------|---------|
| `141833fd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 420: 修复模型选择同步循环

**Date**: 2026-05-12
**Task**: 修复模型选择同步循环
**Branch**: `feature/v0.4.17`

### Summary

修复非 Codex engine 默认模型同步 effect 的自依赖更新，避免生产环境 React #185 maximum update depth。

### Main Changes

## 背景
用户报告生产环境出现 `Application Error: Minified React error #185`，该错误对应 React maximum update depth 类问题。

## 根因
`src/app-shell.tsx` 中非 Codex engine 默认模型同步 `useEffect` 依赖整个 `engineSelectedModelIdByType` map，effect 内又调用 `setEngineSelectedModelIdByType`。在生产渲染路径下，map 引用变化可能让 effect 自触发，形成更新循环。

## 修复
- 将 effect 依赖收窄为当前 active engine 的 scalar model id。
- 新增 `upsertEngineSelectedModelId` pure helper，同值或缺省 default 时返回原 state 引用。
- 补充 helper 回归测试，覆盖同值不更新、无 default 不更新、缺失 default 写入。

## 验证
- `git diff --check`
- `npm exec vitest run src/app-shell-parts/modelSelection.test.ts src/features/composer/components/Composer.status-panel-toggle.test.tsx -- --reporter=verbose`


### Git Commits

| Hash | Message |
|------|---------|
| `168d7405` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 421: 修复 Markdown 预览标注闪烁回归

**Date**: 2026-05-12
**Task**: 修复 Markdown 预览标注闪烁回归
**Branch**: `feature/v0.4.17`

### Summary

移除 Markdown preview 标注 affordance 的透明度过渡，回写归档 OpenSpec 提案，避免文档预览打开后因 hover/focus 首屏动画产生闪烁。

### Main Changes

- 修改 `src/styles/file-view-panel.css`，移除 `.fvp-markdown-annotation-button` 的 `opacity` transition，保留即时 hover/focus 显隐。
- 回写 `openspec/changes/archive/2026-05-09-add-file-line-annotation-composer-bridge/` 的 proposal/design/tasks，固化 Markdown preview annotation affordance 不得通过 opacity/transform transition 造成打开闪烁。
- 验证 `npm exec vitest run src/features/files/components/FileViewPanel.test.tsx` 通过，62 个测试全绿。
- `openspec validate add-file-line-annotation-composer-bridge --strict --no-interactive` 未能运行，因为该 change 已归档，CLI 不再按 active change id 识别。


### Git Commits

| Hash | Message |
|------|---------|
| `5ec4c858` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 422: 归档并提交 Claude 历史大载荷修复

**Date**: 2026-05-12
**Task**: 归档并提交 Claude 历史大载荷修复
**Branch**: `feature/v0.4.17`

### Summary

归档 OpenSpec change harden-claude-history-large-payloads，并提交 Claude 历史大 base64 图片延迟加载、单图 hydration、前端占位回显、large-file/heavy-test-noise 门禁修复。

### Main Changes

## 完成内容
- 归档 OpenSpec change `harden-claude-history-large-payloads` 到 `openspec/changes/archive/2026-05-12-harden-claude-history-large-payloads/`。
- 同步 4 个主 specs：Claude history transcript visibility、Claude sidebar state parity、conversation render surface stability、session history project attribution。
- 提交 `db5d8529 fix(claude-history): 延迟加载大图片历史载荷`。

## 验证
- `cargo test --manifest-path src-tauri/Cargo.toml claude_history`
- `pnpm vitest run src/features/threads/loaders/claudeHistoryLoader.test.ts src/features/messages/components/Messages.rich-content.test.tsx src/services/tauri.test.ts src/features/threads/hooks/useThreadActions.test.tsx`
- `npm run typecheck`
- `npm run check:large-files:gate`
- `npm run check:large-files:near-threshold`
- `npm run check:heavy-test-noise`
- `openspec validate --specs --strict --no-interactive`
- `git diff --cached --check`

## 注意
- 未纳入无关工作区变更：`add-claude-tui-resume-actions`、`fix-claude-context-usage-display` 相关未提交变更。


### Git Commits

| Hash | Message |
|------|---------|
| `db5d8529` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 423: 提交剩余 OpenSpec 文档变更

**Date**: 2026-05-12
**Task**: 提交剩余 OpenSpec 文档变更
**Branch**: `feature/v0.4.17`

### Summary

提交剩余 OpenSpec 工作区内容：归档 fix-claude-context-usage-display，同步 claude-context-usage-display 主 spec，并新增 add-claude-tui-resume-actions 提案。

### Main Changes

## 完成内容
- 提交 `2faacc5e docs(openspec): 归档上下文用量并新增 Claude TUI 恢复提案`。
- 归档 `fix-claude-context-usage-display` 到 `openspec/changes/archive/2026-05-12-fix-claude-context-usage-display/`。
- 新增主 spec `openspec/specs/claude-context-usage-display/spec.md`。
- 新增 OpenSpec change `add-claude-tui-resume-actions`，用于后续实现 Claude GUI 会话显式 TUI resume 入口。

## 验证
- `openspec validate add-claude-tui-resume-actions --type change --strict --no-interactive`
- `openspec validate --specs --strict --no-interactive`
- `git diff --cached --check`


### Git Commits

| Hash | Message |
|------|---------|
| `2faacc5e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 424: 修复队列融合状态 i18n key 泄露

**Date**: 2026-05-12
**Task**: 修复队列融合状态 i18n key 泄露
**Branch**: `feature/v0.4.17`

### Summary

修复 MessageQueue 队列状态使用错误 chat namespace 导致 i18n key 原样显示的问题，状态文案改走 composer namespace，并新增 locale merge contract 测试。

### Main Changes

## 改动
- 将 MessageQueue 的 queue status key 从 `chat.queueStatus*` 修正为 `composer.queueStatus*`。
- 保留队列动作按钮文案使用 `chat.fuseFromQueue` / `chat.deleteQueuedMessage`。
- 新增 `src/i18n/locales/chatLocaleMerge.test.ts`，验证状态文案和按钮文案分别在正确 namespace 下可用。

## 验证
- `npm exec eslint src/features/composer/components/ChatInputBox/MessageQueue.tsx src/features/composer/components/ChatInputBox/MessageQueue.test.tsx src/i18n/locales/chatLocaleMerge.test.ts` 通过。
- `npm exec vitest run src/i18n/locales/chatLocaleMerge.test.ts src/features/composer/components/ChatInputBox/MessageQueue.test.tsx` 通过，9 tests passed。
- `npm run typecheck` 被既有 dirty 文件 `src/app-shell-parts/useAppShellWorkspaceFlowsSection.test.tsx` 的 `TerminalStatus` 类型错误阻断，非本次提交范围。

## 备注
- 本次 commit 仅包含 i18n 队列状态修复相关 3 个文件。
- 工作区仍存在其它未提交业务改动，未纳入本次提交。


### Git Commits

| Hash | Message |
|------|---------|
| `842716ad` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 425: 优化队列融合状态中文文案

**Date**: 2026-05-12
**Task**: 优化队列融合状态中文文案
**Branch**: `feature/v0.4.17`

### Summary

将队列融合状态中文文案从偏工程术语的“可融合到当前轮/正在融合到当前轮”调整为更贴近用户语言的“可并入本轮回复/正在并入本轮回复”，并同步 locale contract 测试。

### Main Changes

## 改动
- 更新 `src/i18n/locales/zh.part1.ts` 中队列融合状态中文文案：
  - `可融合到当前轮` -> `可并入本轮回复`
  - `正在融合到当前轮` -> `正在并入本轮回复`
- 同步更新 `src/i18n/locales/chatLocaleMerge.test.ts` 的中文断言。

## 验证
- `npm exec vitest run src/i18n/locales/chatLocaleMerge.test.ts` 通过，1 test passed。

## 备注
- 本次 commit 仅包含文案优化相关 2 个文件。
- 工作区仍存在其它未提交改动，未纳入本次提交。


### Git Commits

| Hash | Message |
|------|---------|
| `c6f928cd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 426: 添加 Claude TUI resume 操作

**Date**: 2026-05-12
**Task**: 添加 Claude TUI resume 操作
**Branch**: `feature/v0.4.17`

### Summary

实现并归档 add-claude-tui-resume-actions：为 finalized Claude GUI 线程增加复制 resume 命令与应用内 Claude TUI 打开入口，完成 OpenSpec 同步归档与自动化/手工验证。

### Main Changes

- 新增 `claudeResumeCommand` helper，集中处理 `claude:<session_id>` 解析、POSIX/Windows resume command 构造，以及应用内 terminal 安全命令。
- 在 Claude finalized thread 右键菜单中加入 `Copy Claude resume command` 与 `Open in Claude TUI`，保留 `Copy ID` 裸 session id 行为。
- 通过 Sidebar -> LayoutNodes -> AppShell workspace flows 复用现有 terminal infrastructure，自动打开 workspace terminal 并写入 `claude --resume <session_id>`。
- 补齐 ThreadList/PinnedThreadList/WorkspaceSessionFolderTree/WorktreeSection 的 `workspacePath` 传递，确保菜单能生成 workspace-scoped command。
- 补齐中英文 i18n 文案、focused tests、helper tests、AppShell callback boundary tests。
- 回写 proposal，新增 implementation notes，归档 OpenSpec change 到 `openspec/changes/archive/2026-05-12-add-claude-tui-resume-actions/`，并创建主 spec `openspec/specs/claude-tui-resume-affordance/spec.md`。
- 验证：`openspec validate --specs --strict` 通过；归档前 change strict validate 通过；focused Vitest 通过；`npm run typecheck` 通过；`npm run lint` 退出码 0（未纳入本提交的 `useThreadMessaging.ts` 仍有一个既存/并行改动 warning）；`npm run test` 全量 457 test files 通过；用户完成 GUI-created Claude session 在应用内 TUI resume 的手工验证。
- 提交时刻刻意未纳入并行改动：`src/features/threads/hooks/useThreadMessaging.*` 与 `openspec/changes/fix-claude-native-session-continuation-race/`。


### Git Commits

| Hash | Message |
|------|---------|
| `4c6ad73b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 427: 修复 Claude pending 会话续聊竞态

**Date**: 2026-05-12
**Task**: 修复 Claude pending 会话续聊竞态
**Branch**: `feature/v0.4.17`

### Summary

阻断 Claude pending 会话在 native session confirmation 前继续发送，避免 provisional sessionId 被用于 resume；补充 OpenSpec 提案与 focused tests。

### Main Changes

## 主要改动

- 新增 OpenSpec change `fix-claude-native-session-continuation-race`，记录 proposal/design/tasks/spec deltas。
- 修改 `useThreadMessaging`：Claude pending thread 不再缓存 `engine_send_message` response `sessionId/session_id` 作为 native resume id。
- 对 `claude-pending-*` 且已有本地活动、active turn、processing 或 awaiting marker 的线程，在 native rebind 前阻断 follow-up，避免 invalid `--resume` 或静默新开会话。
- 保持 finalized `claude:<sessionId>` 续聊、Claude fork first-send `forkSessionId`、Gemini/OpenCode/Codex continuation 不变。
- 更新 `useThreadMessaging.test.tsx`，覆盖 response-derived id 禁用、snake_case 禁用、恢复后的 pending thread guard、finalized Claude 续聊与 fork first-send。

## 验证

- `openspec validate fix-claude-native-session-continuation-race --type change --strict --no-interactive`
- `pnpm vitest run src/features/threads/hooks/useThreadMessaging.test.tsx`
- `pnpm vitest run src/features/threads/hooks/useThreadTurnEvents.test.tsx src/features/app/hooks/useAppServerEvents.test.tsx src/features/app/hooks/useSidebarMenus.test.tsx src/features/app/utils/claudeResumeCommand.test.ts`
- `npm run typecheck`

## 注意

- 当前没有实际 GUI/Claude 环境复现条件，本轮完成代码级与 focused test 验证。
- 本次提交前工作区 clean，record 只对应 commit `6fd5f347`。


### Git Commits

| Hash | Message |
|------|---------|
| `6fd5f347` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 428: 调整工作区眼睛按钮位置

**Date**: 2026-05-12
**Task**: 调整工作区眼睛按钮位置
**Branch**: `feature/v0.4.17`

### Summary

将工作区隐藏退出会话的眼睛按钮移到右侧操作区第一位，并补充位置回归测试。

### Main Changes

## Summary
- 将 WorkspaceCard 的 exited sessions toggle 从左侧 leading icons 移到右侧 workspace actions 第一位。
- 调整 sidebar 样式，使眼睛按钮与右侧 action icon 尺寸、hover、active 视觉一致。
- 新增 WorkspaceCard 单测，锁定 eye toggle 位于 actions 区域且排在 refresh 前。

## Verification
- npm exec vitest run src/features/app/components/WorkspaceCard.test.tsx src/features/layout/components/PanelTabs.test.tsx
- npm run typecheck

## Notes
- CHANGELOG.md 存在会话前已有未提交改动，本次提交未包含。


### Git Commits

| Hash | Message |
|------|---------|
| `8634b51c4241f4298d2190c0311848ce2eedfbcd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 429: 修复代码块跨行选区锚点

**Date**: 2026-05-12
**Task**: 修复代码块跨行选区锚点
**Branch**: `feature/v0.4.17`

### Summary

将消息 Markdown 多行 code block 改为按行渲染，修复鼠标从第二行拖选时选区锚点容易回到第一行的问题。

### Main Changes

- 修改 `src/features/messages/components/Markdown.tsx`：新增 `renderHighlightedCodeLines`，多行 code block 逐行调用 `highlightLine` 并渲染 `.markdown-codeblock-line`。
- 修改 `src/styles/messages.part2.css`：将 code block 横向滚动保持在 `pre/code`，把正文 padding 下放到行级 wrapper。
- 修改 `src/features/messages/components/Markdown.codeblock-rendering.test.tsx`：新增多行 code block 行级 wrapper 回归测试。
- 验证：`npx vitest run src/features/messages/components/Markdown.codeblock-rendering.test.tsx` 通过，4 tests passed。
- 验证：`npm run typecheck` 通过。


### Git Commits

| Hash | Message |
|------|---------|
| `6d243be8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 430: 稳定邮件启用保存测试

**Date**: 2026-05-12
**Task**: 稳定邮件启用保存测试
**Branch**: `feature/v0.4.17`

### Summary

修复 EmailSenderSettings inline enable-and-save 测试在 CI 慢环境下点击 disabled 按钮导致 mock 未调用的竞态。

### Main Changes

- 修改 `src/features/settings/components/settings-view/sections/EmailSenderSettings.test.tsx`：在点击 `settings.emailEnableAndSave` 前等待按钮 `disabled === false`。
- 原因：组件 mount 后会先执行 `getEmailSenderSettings()` 并设置 `action=load`，慢环境下按钮可能尚未恢复可点击，立即 `fireEvent.click` 会被浏览器丢弃。
- 验证：`npx vitest run src/features/settings/components/settings-view/sections/EmailSenderSettings.test.tsx` 通过。
- 验证：`npx vitest run src/features/settings/components/settings-view/sections/RuntimePoolSection.test.tsx src/features/settings/components/settings-view/hooks/useWorkspaceSessionCatalog.test.tsx` 通过。
- 验证：`npm run typecheck` 通过。


### Git Commits

| Hash | Message |
|------|---------|
| `aad62c59` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 431: 修复本地 PNG 图片预览加载

**Date**: 2026-05-13
**Task**: 修复本地 PNG 图片预览加载
**Branch**: `feature/v0.4.17`

### Summary

修复文件编辑器图片预览优先使用 readLocalImageDataUrl 读取本地图片，保留 convertFileSrc fallback，并补充加载失败提示与 FileViewPanel 回归测试。验证通过 FileViewPanel.test.tsx 与 npm run typecheck。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1c37724c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 432: 修复 Linux AppImage Wayland 库冲突

**Date**: 2026-05-13
**Task**: 修复 Linux AppImage Wayland 库冲突
**Branch**: `feature/v0.4.17`

### Summary

新增 OpenSpec change 与 AppImage post-process 脚本，在 Linux AppImage 构建后剔除 bundled libwayland-*，release workflow 对修复后的 artifact 重新签名；验证 OpenSpec strict、脚本测试、diff check、typecheck 通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c82543d2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 433: 回写近期 OpenSpec 文档

**Date**: 2026-05-13
**Task**: 回写近期 OpenSpec 文档
**Branch**: `feature/v0.4.17`

### Summary

(Add summary)

### Main Changes

Task goal: 根据近 2 天代码变更回写 OpenSpec 提案与文档，并提交结果。

Main changes:
- 更新 CHANGELOG.md 的 v0.4.17 条目，补齐 Linux AppImage Wayland/Mesa libwayland 冲突修复说明。
- 更新 openspec/project.md 的 workspace 快照：active=10、archive=278、specs=249，并补齐当前 active changes 列表。
- 新增 openspec/changes/fix-linux-appimage-wayland-library-pruning/implementation-notes.md，记录 AppImage pruning 的实现证据、验证证据、剩余 Linux/Arch 手测项与 rollback。
- 新增并提交 openspec/changes/add-cli-one-click-installer/ proposal/design/spec/tasks，标记 spec/contract 阶段完成，保留 backend/frontend/跨平台实现任务未完成。

Validation:
- openspec validate --all --strict --no-interactive passed: 258 passed, 0 failed.
- git commit completed: 3057eb47 docs(openspec): 回写近期变更文档.

Follow-ups:
- Linux AppImage 仍需用最终 artifact 验证 squashfs-root/usr/lib 中无 libwayland-*，并在 Arch Linux / Wayland 环境确认无 wl_fixes_interface 启动错误。
- CLI one-click installer 仍需进入 backend installer core、remote parity、frontend UX 和跨平台验证实现阶段。


### Git Commits

| Hash | Message |
|------|---------|
| `3057eb47` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 434: 修复 realtime turn 完成清算竞态

**Date**: 2026-05-13
**Task**: 修复 realtime turn 完成清算竞态
**Branch**: `feature/v0.4.17`

### Summary

(Add summary)

### Main Changes

| Area | Notes |
|---|---|
| OpenSpec | 新建 `fix-realtime-turn-completion-settlement-race`，补 proposal/design/spec/tasks，定义 terminal settlement audit、alias-aware cleanup、newer turn guard。 |
| Frontend | 调整 `useThreadTurnEvents`，按 target thread identity 逐个判断安全清算；补 `resolvePendingThreadForTurn` alias fallback；新增 settled/rejected audit。 |
| Diagnostics | `useThreadEventHandlers` 在 final assistant output 已出现但 settlement 被拒绝时输出 `terminal-settlement-rejected` 诊断，便于区分未收到 completion 与 guard 拒绝。 |
| Tests | 补充 turn-bound alias、newer active turn guard、settlement rejection audit、final-output-visible settlement failure tests。 |

**Verification**:
- `npx vitest run src/features/threads/hooks/useThreadTurnEvents.test.tsx src/features/threads/hooks/useThreadEventHandlers.test.ts` passed, 88 tests.
- `npm run typecheck` passed.
- `npm run lint` passed with existing warning in `src/features/threads/hooks/useThreadMessaging.ts`.
- `openspec validate --all --strict --no-interactive` passed.


### Git Commits

| Hash | Message |
|------|---------|
| `b5d9f2b8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 435: 修复 realtime pending alias 解析短路兼容问题

**Date**: 2026-05-13
**Task**: 修复 realtime pending alias 解析短路兼容问题
**Branch**: `feature/v0.4.17`

### Summary

修复 session-level pending resolver 遮蔽 turn-bound resolver 的兼容边界，并补充回归测试。

### Main Changes

## 本次完成
- 单独提交 `9042308f fix(realtime): 修复 pending alias 解析短路兼容问题`。
- 修复 `resolvePendingAliasThread` 中 session-level pending candidate 不匹配当前 turn 时直接短路的问题。
- 将 pending alias 解析改为候选先校验 `activeTurnId === turnId`，不匹配则继续 fallback 到 `resolvePendingThreadForTurn`。
- 补充回归测试：session resolver 返回错误 pending、turn resolver 返回正确 pending 时，只清算正确 alias，不误清错误 pending。

## 验证
- `npx vitest run src/features/threads/hooks/useThreadTurnEvents.test.tsx src/features/threads/hooks/useThreadEventHandlers.test.ts` 通过，89 tests。
- `npm run typecheck` 通过。
- `git diff --check -- src/features/threads/hooks/useThreadTurnEvents.ts src/features/threads/hooks/useThreadTurnEvents.test.tsx` 通过。

## 范围控制
- 本次 commit 只包含 realtime turn events hook 与对应测试。
- 工作区仍存在 installer/settings 相关未提交改动，未纳入本次提交。


### Git Commits

| Hash | Message |
|------|---------|
| `9042308f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
