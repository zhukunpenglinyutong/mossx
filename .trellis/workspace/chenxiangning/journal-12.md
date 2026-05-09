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
