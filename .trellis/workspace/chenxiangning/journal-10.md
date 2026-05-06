# Journal - chenxiangning (Part 10)

> Continuation from `journal-9.md` (archived at ~2000 lines)
> Started: 2026-05-04

---



## Session 310: 补齐第一阶段人工场景回归测试

**Date**: 2026-05-04
**Task**: 补齐第一阶段人工场景回归测试
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

任务目标：
- 将此前人工测试提示词覆盖的第一阶段架构硬化高风险场景补齐为自动化回归测试。
- 本次只提交测试，不修改生产代码行为。

主要改动：
- 在 pending thread resolution 测试中覆盖“历史 active thread 不应抢占新 anchored pending session”。
- 在 selected agent session 测试中覆盖同名 thread id 在不同 workspace 下的 storage key 隔离。
- 在 clientStorage 测试中覆盖 reset 后重新 preload schema store，且不暴露 __schemaVersion、不触发无意义 write。
- 在 Messages live behavior 测试中覆盖 retired mossx jump event 不再触发滚动。
- 在 tauri service 测试中覆盖 web runtime fallback state 下 Codex engine_send_message 仍可发送。

涉及模块：
- src/features/threads/hooks/useThreads.pendingResolution.test.ts
- src/app-shell-parts/selectedAgentSession.test.ts
- src/services/clientStorage.test.ts
- src/features/messages/components/Messages.live-behavior.test.tsx
- src/services/tauri.test.ts

验证结果：
- npm exec vitest run src/features/threads/hooks/useThreads.pendingResolution.test.ts src/app-shell-parts/selectedAgentSession.test.ts src/services/clientStorage.test.ts src/features/messages/components/Messages.live-behavior.test.tsx src/services/tauri.test.ts：通过，5 files / 167 tests passed。
- npm run typecheck：通过。
- npm run check:runtime-contracts：通过。
- git diff --check -- src/app-shell-parts/selectedAgentSession.test.ts src/features/messages/components/Messages.live-behavior.test.tsx src/features/threads/hooks/useThreads.pendingResolution.test.ts src/services/clientStorage.test.ts src/services/tauri.test.ts：通过。

后续事项：
- 用户可继续执行本地人工验证；如需提交人工验证结果，可追加独立测试记录或 release note。


### Git Commits

| Hash | Message |
|------|---------|
| `72b36a97` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 311: 记录右侧面板拖拽提交优化

**Date**: 2026-05-04
**Task**: 记录右侧面板拖拽提交优化
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

任务目标：
- 按用户选择的方案，将右侧面板上下拖拽改为“拖动中只显示预览，松手后才提交尺寸”。
- 避免拖动过程中实时修改 plan panel 高度引发持续布局重排和卡顿。

主要改动：
- src/features/layout/hooks/useResizablePanels.ts：plan-panel mousemove 不再调用 scheduleResizeApply，也不再实时写入 --plan-panel-height；只更新 liveSizesRef 与 divider transform 预览。mouseup 时一次性提交 --plan-panel-height、React state 和 clientStorage。
- src/features/layout/hooks/useResizablePanels.test.ts：新增回归测试，断言拖动中不写入 --plan-panel-height，松手后提交最终高度并清理拖拽样式。
- src/styles/main.css：补齐 right-panel-divider 的竖向拖拽视觉，沿用左右拖拽的 glow line / capsule handle 风格。

涉及模块：
- layout hook
- desktop layout resize interaction
- global stylesheet resize handle

验证结果：
- npx vitest run src/features/layout/hooks/useResizablePanels.test.ts src/features/layout/components/DesktopLayout.test.tsx src/styles/layout-swapped-platform-guard.test.ts：通过，21 tests passed。
- npm run typecheck：通过。
- npm run check:large-files：通过，found=0。

后续事项：
- 需要用户继续进行桌面端人工测试，重点验证右侧面板上下拖拽松手提交是否符合预期，以及主界面拖动期间是否明显减少卡顿。


### Git Commits

| Hash | Message |
|------|---------|
| `87845311acf113c3fa2909224321fe8d2c476a0f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 312: 修复流式幕布长文输出卡顿

**Date**: 2026-05-05
**Task**: 修复流式幕布长文输出卡顿
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

任务目标:
- 修复 Codex 实时流式输出在长文中后段导致的幕布整体卡顿、按钮冻结、最终一次性刷出的 P0 问题。

主要改动:
- 将 Messages 父层的流式呈现面拆分为稳定 timeline snapshot 与实时 live override，避免整棵消息树在 token 级别持续重算。
- 新增 messages live window / streaming presentation contract，收敛 live assistant 与 live reasoning 的窗口化输出路径。
- 调整 LiveMarkdown、MessagesRows、MessagesTimeline、StatusPanel 与 stream diagnostics，降低长会话持续输出时的 render pressure，同时保留实时 UI 效果。
- 补齐前端 code-spec 与 OpenSpec 行为契约，明确 conversation render surface stability 的回归边界。
- 补充回归测试，覆盖 live window、streaming presentation、windows render mitigation、rows mitigation、diagnostics 与 live markdown。

涉及模块:
- src/features/messages/components
- src/features/messages/utils
- src/features/status-panel/components
- src/features/threads/utils
- .trellis/spec/frontend
- openspec/specs/conversation-render-surface-stability

验证结果:
- npm run lint ✅
- npm run typecheck ✅
- npm run check:large-files ✅
- npm run test ✅ (430 test files 全绿)

后续事项:
- 后续若继续调整实时输出链路，必须保持“稳定 timeline + 实时 live override”这一渲染 contract，不要重新把 token 级更新抬回 Messages 顶层。
- CHANGELOG.md 仍有独立未提交改动，本次 session 未纳入业务提交。


### Git Commits

| Hash | Message |
|------|---------|
| `e3873027` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 313: 打磨流式消息展示与用户对话时间线

**Date**: 2026-05-05
**Task**: 打磨流式消息展示与用户对话时间线
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

## 任务目标
- 打磨消息流式展示链路与右下角 dock 用户对话时间线，处理真实可见问题，不扩散到无关模块。

## 主要改动
- 抽出并复用 user conversation summary 逻辑，统一主幕布与 dock 时间线摘要来源。
- 抽出 Messages live window 纯函数，稳定 sticky header / assistant final boundary / visible process 计算。
- 修复 dock 用户对话时间线未传入 Codex cleanup mode，导致协作包装残留的问题。
- 修复时间线编号先于可见项过滤计算，导致 `#n` 与 `1/1` 标签错误的问题。
- 补齐对应 focused tests，覆盖 live behavior、timeline numbering、StatusPanel 集成与 presentation 逻辑。

## 涉及模块
- `src/features/messages/components/Messages.tsx`
- `src/features/messages/components/messagesLiveWindow.ts`
- `src/features/messages/components/messagesUserPresentation.ts`
- `src/features/status-panel/components/StatusPanel.tsx`
- `src/features/status-panel/utils/userConversationTimeline.ts`

## 验证结果
- 人工测试：用户已手测通过，反馈“没啥问题”。
- 自动化测试：`npx vitest run src/features/status-panel/utils/userConversationTimeline.test.ts src/features/status-panel/components/UserConversationTimelinePanel.test.tsx src/features/status-panel/components/StatusPanel.test.tsx src/features/messages/components/messagesUserPresentation.test.ts src/features/messages/components/messagesLiveWindow.test.ts src/features/messages/components/Messages.streaming-presentation.test.tsx src/features/messages/components/Messages.live-behavior.test.tsx`
- 质量门禁：`npm run lint`、`npm run typecheck`、`git diff --check` 通过。

## 后续事项
- 可继续观察 `openspec/specs/status-panel-latest-user-message-tab/spec.md` 与已归档 change 是否需要补一次主 spec 同步，避免 archived change 与主 specs 文案分叉。


### Git Commits

| Hash | Message |
|------|---------|
| `2e87c819` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 314: 收口用户对话时间线主规范

**Date**: 2026-05-05
**Task**: 收口用户对话时间线主规范
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

## 任务目标
- 收口 `status-panel-latest-user-message-tab` 主 specs，使其与已归档的 `status-panel-user-conversation-timeline` 行为一致。
- 盘点当前 active OpenSpec changes，归档所有满足门禁的 change；若不满足则给出阻塞。

## 主要改动
- 更新 `openspec/specs/status-panel-latest-user-message-tab/spec.md`：
  - 将 tab 语义从“最新用户对话 / 最后一条预览”收口为“用户对话 / 时间线”。
  - 补齐“多条用户消息按新到旧排序”“逐条四行展开/收起”“跳转主幕布消息锚点”等 requirement 与 scenarios。
  - 保留 dock scoped、手动查看、不自动切 tab、空态稳定、popover 不接入等边界。
- 盘点 active OpenSpec changes：
  - `add-codex-structured-launch-profile`：done=0, todo=7
  - `claude-code-mode-progressive-rollout`：done=23, todo=6
  - `fix-windows-codex-app-server-wrapper-launch`：done=15, todo=3
  - `project-memory-refactor`：done=0, todo=134
- 结论：上述 active changes 均存在未完成 tasks，本轮未执行 archive。

## 涉及模块
- `openspec/specs/status-panel-latest-user-message-tab/spec.md`
- `openspec/changes/archive/2026-05-04-status-panel-user-conversation-timeline/specs/status-panel-latest-user-message-tab/spec.md`（作为同步参考）

## 验证结果
- `openspec validate status-panel-latest-user-message-tab --type spec --strict` 通过。
- `git status --short` 在业务提交前后均保持预期；当前业务提交后工作树干净。
- `rg` 盘点确认主 specs 已不再停留在旧的“最新用户对话”主语义；旧文案残留仅存在历史 archive change 中。

## 后续事项
- 如果后续要继续清理 OpenSpec 存量，可按 change 逐个补齐 tasks，再执行 archive，而不是跳过任务门禁强行归档。


### Git Commits

| Hash | Message |
|------|---------|
| `9343c0b9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 315: 打磨 dock 对话标签导航样式

**Date**: 2026-05-05
**Task**: 打磨 dock 对话标签导航样式
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

## 任务目标
- 对底部 dock 状态面板顶部 tab 做纯 UI 打磨。
- 在不改行为前提下，收口为更轻量的导航样式，并为 `用户对话` 显示当前可见轮次数量。

## Review 结论
- 针对本轮未提交改动做了 focused review，未发现需要拦住提交的真实问题。
- `用户对话` count 最终接到 `userConversationTimeline.items.length`，避免把伪用户消息或错误字段计入。
- 样式改动限定在 dock tab 导航，不影响 popover 版本与时间线行为。

## 主要改动
- `src/styles/status-panel.css`
  - 将 dock 顶部 tab 从胶囊按钮视觉收口为更轻量的横向导航。
  - 多轮微调 tab 高度、间距、下划线与 icon 比例，最终将 icon 收敛到 `16px`。
- `src/features/status-panel/components/StatusPanel.tsx`
  - 在 `用户对话` tab 后追加当前可见用户轮次数字。
- `src/features/status-panel/components/StatusPanel.test.tsx`
  - 新增 dock tab count 测试，断言过滤伪用户消息后显示正确条数。

## 涉及模块
- `src/styles/status-panel.css`
- `src/features/status-panel/components/StatusPanel.tsx`
- `src/features/status-panel/components/StatusPanel.test.tsx`

## 验证结果
- `npm run lint`
- `npm run typecheck`
- `npx vitest run src/features/status-panel/components/StatusPanel.test.tsx src/features/status-panel/components/UserConversationTimelinePanel.test.tsx src/features/status-panel/utils/userConversationTimeline.test.ts`
- `npm run check:large-files`
- 全部通过。

## 后续事项
- 当前停留在未扩散范围；如还要继续打磨视觉，建议只在 `status-panel.css` 内按明确尺寸目标继续微调，避免来回震荡其它行为层。


### Git Commits

| Hash | Message |
|------|---------|
| `cc5ce9e9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 316: 记录消息推理与更新修复提交

**Date**: 2026-05-05
**Task**: 记录消息推理与更新修复提交
**Branch**: `feature/v-0.4.13-1`

### Summary

(Add summary)

### Main Changes

任务目标：将当前工作区按语义拆分为两条中文 Conventional Commits，并补齐 Trellis session record。

主要改动：
- 提交 24fad58f：修复 Codex 在仅返回 Encrypted reasoning 占位文案时仍渲染 thinking 卡片的问题，避免无意义推理块污染消息流。
- 提交 e55fc787：修复 updater 将同版本 payload 误判为可升级版本的问题，引入版本标准化比较与 app version 读取缓存，并保留版本读取失败时的真实更新可见性。

涉及模块：
- src/features/messages/components/MessagesRows.tsx
- src/features/messages/components/Messages.test.tsx
- src/features/update/hooks/useUpdater.ts
- src/features/update/hooks/useUpdater.test.ts

验证结果：
- npx vitest run src/features/messages/components/Messages.test.tsx
- npx vitest run src/features/update/hooks/useUpdater.test.ts
- 两组目标测试均通过。

后续事项：
- 如需发 PR，可在描述中分别强调消息流可读性修复与 updater 同版本误报修复，便于 reviewer 按 commit 逐条验收。


### Git Commits

| Hash | Message |
|------|---------|
| `e55fc787` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 317: 修复 OpenCode Windows 前台抢焦点探测

**Date**: 2026-05-06
**Task**: 修复 OpenCode Windows 前台抢焦点探测
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

任务目标：修复 Windows 环境下 OpenCode 被误识别为可后台探测 CLI，导致状态探测、显式 refresh 或会话相关命令把 OpenCode 桌面窗口频繁拉到前台的问题；边界限定为 Windows + OpenCode，不影响 macOS/Linux 和 Claude/Codex/Gemini。

主要改动：
- 在 src-tauri/src/backend/app_server_cli.rs 新增 resolve_safe_opencode_binary，并为 Windows 增加 launcher-like candidate 过滤，只允许背景安全的 OpenCode CLI candidate 通过。
- 将 src-tauri/src/engine/status.rs、src-tauri/src/engine/commands.rs、src-tauri/src/engine/commands_opencode.rs、src-tauri/src/engine/commands_opencode_helpers.rs、src-tauri/src/engine/opencode.rs 的 OpenCode status / refresh / command planning / send-message 路径统一接入该 guard。
- 补齐 daemon 旁路：src-tauri/src/bin/cc_gui_daemon.rs、src-tauri/src/bin/cc_gui_daemon/engine_bridge.rs、src-tauri/src/bin/cc_gui_daemon/daemon_state.rs 也统一走同一安全解析逻辑，避免绕过 Windows guard。
- 同步 OpenSpec：归档 fix-windows-opencode-foreground-launch，更新 openspec/specs/opencode-mode-ux/spec.md，并新增 openspec/specs/opencode-windows-cli-resolution/spec.md。

涉及模块：OpenCode CLI resolution、engine status/commands、cc_gui_daemon OpenCode command bridge、OpenSpec behavior specs。

验证结果：
- cargo fmt --manifest-path src-tauri/Cargo.toml --all
- cargo test --manifest-path src-tauri/Cargo.toml --no-run
- cargo test --manifest-path src-tauri/Cargo.toml app_server_cli::tests::windows_opencode -- --nocapture
- cargo test --manifest-path src-tauri/Cargo.toml commands::tests::opencode_session_id_rejects_path_like_segments --bin cc_gui_daemon -- --nocapture
- cargo test --manifest-path src-tauri/Cargo.toml
- openspec validate --all --strict --no-interactive
以上均通过。

后续事项：
- 需要在真实 Windows 安装 OpenCode desktop/launcher 的机器上做一次人工回归，重点验证显式 refresh、状态探测、session list/delete 不再拉起前台窗口。
- 当前工作区仍存在与本次提交无关的前端和 normalize-conversation-file-change-surfaces 改动，未纳入本次提交。


### Git Commits

| Hash | Message |
|------|---------|
| `4555ddc7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 318: 收敛 CLI 引擎启动探测与禁用开关

**Date**: 2026-05-06
**Task**: 收敛 CLI 引擎启动探测与禁用开关
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

任务目标:
- 落地 OpenSpec change `control-cli-engine-startup-gates`
- 在 CLI 验证区域为 Gemini CLI / OpenCode CLI 增加统一禁用开关
- 统一收敛 Win/mac 的 OpenCode 启动探测噪音，避免禁用后仍触发探测或前台拉起

主要改动:
- 前端设置页新增 Gemini CLI / OpenCode CLI tabs 与 hard disable 开关，并补齐中英文文案与测试
- useEngineController / EngineSelector / useOpenCodeSelection / app-shell 按 enabled flags 过滤引擎与预热路径，移除启动期 OpenCode commands fallback
- Rust AppSettings 新增 geminiEnabled / opencodeEnabled 持久化字段与兼容默认值
- backend engine detect、models、workspace CLI 入口、OpenCode command surface、daemon path 统一加 disabled short-circuit
- OpenCode status detect 拆成 lightweight detect 与按需 load models，降低启动期 CLI 进程风暴
- OpenSpec 提案、设计、delta specs、tasks 已同步回写

涉及模块:
- frontend settings / engine selection / opencode selection
- src-tauri engine manager / commands / daemon bridge / workspace commands / settings storage
- openspec/changes/control-cli-engine-startup-gates

验证结果:
- npx vitest run src/features/settings/hooks/useAppSettings.test.ts src/features/engine/hooks/useEngineController.test.tsx src/features/settings/components/SettingsView.test.tsx 通过
- npm run lint 通过
- npm run typecheck 通过
- npm run test 通过（batched 430 test files）
- npm run check:runtime-contracts 通过
- npm run doctor:strict 通过
- cargo test --manifest-path src-tauri/Cargo.toml 通过
- openspec validate --all --strict --no-interactive 通过

后续事项:
- 若后续 remote backend 再扩展 Gemini/OpenCode 专属 surface，继续复用当前 disabled diagnostic 与 detect gating 契约


### Git Commits

| Hash | Message |
|------|---------|
| `da2b59ab` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 319: 修复 CLI 引擎门禁与 OpenCode 探测

**Date**: 2026-05-06
**Task**: 修复 CLI 引擎门禁与 OpenCode 探测
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

## 任务目标
- 收敛 Gemini CLI / OpenCode CLI 的自动探测边界，避免被禁用引擎仍被探测。
- 修复 OpenCode 在 daemon/remote 路径下模型列表为空的回归。
- 在设置页 CLI 验证区域提供统一的禁用开关，并让禁用后的入口直接从 workspace 新建会话菜单隐藏。

## 主要改动
- backend:
  - `src-tauri/src/engine/commands.rs` 改为通过 `refresh_engine_status_with_gates(...)` 做 Claude/Codex 的 force refresh 与 cold-cache refresh，避免绕过 gate 误探测 Gemini/OpenCode。
  - `src-tauri/src/engine/manager.rs` 新增 gated refresh helper，并补 OpenCode disabled status 回归单测。
  - `src-tauri/src/bin/cc_gui_daemon/daemon_state.rs` 为 OpenCode 的 daemon/remote 模型读取补齐按需加载，失败再回退缓存状态。
- frontend:
  - `src/features/app/hooks/useSidebarMenus.ts`、`Sidebar.tsx`、`useAppShellLayoutNodesSection.tsx`、`useLayoutNodes.tsx` 透传 `enabledEngines`，禁用 Gemini/OpenCode 时直接隐藏新建会话入口。
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx` 将 Gemini CLI / OpenCode CLI 切换改为统一 `Switch` 交互，并在 `src/styles/settings.part2.basic-redesign.css` 收敛样式。
  - 补充 `useSidebarMenus.test.tsx` 与 `SettingsView.test.tsx` 回归覆盖。

## 影响模块
- engine runtime / daemon model loading
- settings CLI validation UI
- workspace sidebar session entry gating

## 验证结果
- `npx vitest run src/features/app/hooks/useSidebarMenus.test.tsx src/features/settings/components/SettingsView.test.tsx` 通过（66 tests）。
- `cargo test --manifest-path src-tauri/Cargo.toml gated_refresh_returns_disabled_status_for_disabled_optional_engine` 通过。
- 本次提交只暂存并提交了 11 个相关文件；其余工作区脏改与未跟本任务相关的 `openspec/changes/normalize-conversation-file-change-surfaces/` 保持未动。

## 后续事项
- 若后续继续拆分 engine startup / model loading，可在不改变当前 gate contract 的前提下进一步收口探测路径。


### Git Commits

| Hash | Message |
|------|---------|
| `12829631` | (see git log) |
| `1885e86a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 320: 默认禁用 OpenCode CLI

**Date**: 2026-05-06
**Task**: 默认禁用 OpenCode CLI
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

## 任务目标
- 将 OpenCode CLI 的默认设置从启用改为禁用。
- 保证该默认值在 frontend 与 backend 两侧一致。
- 保证已显式开启 OpenCode 的已有用户设置不被误覆盖。

## 主要改动
- `src/features/settings/hooks/useAppSettings.ts`
  - 将 `defaultSettings.opencodeEnabled` 改为 `false`。
  - 将 normalize 逻辑改为 `settings.opencodeEnabled === true`，避免字段缺失时被兜底成开启。
- `src/features/settings/hooks/useAppSettings.test.ts`
  - 调整默认值断言为默认关闭。
  - 补一条“显式开启仍保留开启”的回归测试。
- `src-tauri/src/types.rs`
  - 新增 `default_opencode_enabled()`，并让 `AppSettings` 的 serde/default 与 `Default` 实现统一走默认关闭。
  - 更新 Rust 默认值测试断言。

## 影响模块
- frontend app settings default/normalize contract
- Rust AppSettings default deserialize contract
- OpenCode CLI startup gate default behavior

## 验证结果
- `npx vitest run src/features/settings/hooks/useAppSettings.test.ts src/features/settings/components/SettingsView.test.tsx` 通过。
- `cargo test --manifest-path src-tauri/Cargo.toml app_settings_defaults_` 通过。
- 本次提交只包含 3 个文件；工作区其他未提交改动保持未动。

## 后续事项
- 如需继续验证，可在全新设置文件场景下启动客户端，确认 OpenCode CLI 页签初始为关闭态，且显式开启后重启仍可保留。


### Git Commits

| Hash | Message |
|------|---------|
| `14c86980` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 321: 归一化对话文件变更展示与预览交互

**Date**: 2026-05-06
**Task**: 归一化对话文件变更展示与预览交互
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

任务目标
- 归一化 AI 对话里的 file-change facts，让消息幕布、右侧 workspace session activity、底部 status panel 的文件数量、路径身份与 +/- 统计一致。
- 补齐右侧 activity panel 的文件交互：主点击打开并最大化，次按钮打开 diff 预览，并统一旧 diff modal 的关闭与分页交互。

主要改动
- 在 src/features/operation-facts/operationFacts.ts 抽共享 canonical file-change entries，统一多文件抽取、Windows 路径归一化、重复 patch header merge 与 event summary 聚合。
- 在 session-activity adapter / panel 接入完整文件列表，增加删除文件安全 fallback、diff 预览弹窗、主点击 maximize 编排。
- 在 status-panel 接入同一 file-change contract，统一 Edits 区文件数与增删统计口径。
- 在 GitDiffPanel、GitDiffViewer、GitHistoryPanelView、GitHistoryPanelDialogs、useLayoutNodes 与相关样式中统一 diff modal 的 close icon、header controls、modal pager 以及 activity 打开后最大化行为。
- 新增 openspec/changes/normalize-conversation-file-change-surfaces/，补齐 proposal、design、tasks 与 delta specs，明确门禁约束和兼容性写法。

涉及模块
- operation-facts
- session-activity
- status-panel
- git diff / git history preview surfaces
- layout maximize orchestration
- OpenSpec change: normalize-conversation-file-change-surfaces

验证结果
- openspec validate normalize-conversation-file-change-surfaces 通过。
- pnpm vitest run src/features/operation-facts/operationFacts.test.ts src/features/session-activity/adapters/buildWorkspaceSessionActivity.test.ts src/features/session-activity/components/WorkspaceSessionActivityPanel.test.tsx src/features/status-panel/components/StatusPanel.test.tsx 通过，136 tests passed。
- npm run lint 通过。
- npm run typecheck 通过。
- npm run test 通过，430 test files completed。
- npm run check:large-files 通过。
- node --test scripts/check-large-files.test.mjs 通过。
- node --test scripts/check-heavy-test-noise.test.mjs 通过。
- npm run check:heavy-test-noise 通过，433 test files completed，act/stdout/stderr 噪音门禁通过。
- git diff --check 通过。

后续事项
- 当前还有未提交的 backend 工作区改动：src-tauri/src/note_cards.rs、src-tauri/src/shared/workspace_snapshot.rs，本次未纳入提交。
- 本次 OpenSpec change 已落盘并验证，但尚未 archive；若后续确认主 specs 同步策略，再决定是否归档。


### Git Commits

| Hash | Message |
|------|---------|
| `548dd2c2535c850cdc00276efb1165b24f091cc0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 322: 收口 Rust 测试格式化残留改动

**Date**: 2026-05-06
**Task**: 收口 Rust 测试格式化残留改动
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

任务目标：分析并收口工作区剩余两个未提交的 src-tauri Rust 文件，确认是否属于有效改动并在无风险前提下提交。

主要改动：
- 审查 src-tauri/src/note_cards.rs，确认仅为测试中 materialize_attachments 调用的换行格式调整。
- 审查 src-tauri/src/shared/workspace_snapshot.rs，确认仅为测试断言 assert_eq! 的换行格式调整。
- 未修改 runtime 逻辑、command contract、跨层 payload 或平台兼容实现。

涉及模块：
- src-tauri/src/note_cards.rs
- src-tauri/src/shared/workspace_snapshot.rs

验证结果：
- git diff --check -- src-tauri/src/note_cards.rs src-tauri/src/shared/workspace_snapshot.rs 通过。
- cargo test --manifest-path src-tauri/Cargo.toml note_cards::tests::materialize_attachments 通过。
- cargo test --manifest-path src-tauri/Cargo.toml shared::workspace_snapshot 通过。

后续事项：
- 当前这批残留已收口完成；后续若继续清理 src-tauri 侧改动，优先区分格式化残留与真实行为变更，避免把无功能价值的噪音 diff 混入主功能提交。


### Git Commits

| Hash | Message |
|------|---------|
| `181a5c9b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 323: 收口文件变更列表图标与密度

**Date**: 2026-05-06
**Task**: 收口文件变更列表图标与密度
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

任务目标：review 并收口 ai 对话右侧文件变更列表的视觉微调，确认纯 icon diff 入口与更紧凑的文件列表不会带来交互或主题回归，然后完成提交。

Review 结论：
- 未发现阻塞提交的问题。
- diff 入口虽然改成无边框纯 icon，但仍保留 button 语义、aria-label、hover 与 focus-visible，可访问性没有被破坏。
- 样式仍基于主题变量与 color-mix，没有引入写死颜色，深色/浅色/自定义主题兼容性保持不变。

主要改动：
- 将 session activity 文件变更列表右侧 diff 入口改为纯 icon 视觉。
- 图标从 FileDiff/Eye 调整为更贴近 diff/compare 语义的 GitCompareArrows。
- 压缩文件列表项高度、间距、字号与统计占位，提升单屏密度。

涉及模块：
- src/features/session-activity/components/WorkspaceSessionActivityPanel.tsx
- src/styles/session-activity.css

验证结果：
- pnpm vitest run src/features/session-activity/components/WorkspaceSessionActivityPanel.test.tsx 通过（53 tests）。
- git diff --check -- src/features/session-activity/components/WorkspaceSessionActivityPanel.tsx src/styles/session-activity.css 通过。

后续事项：
- 如需继续打磨这一块，下一步建议基于实际截图再判断是否继续下调列表行高或缩小右侧 icon 热区，而不要再联动 diff modal 其它 surface。


### Git Commits

| Hash | Message |
|------|---------|
| `87a977eb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 324: 隐藏已禁用引擎的会话提供方入口

**Date**: 2026-05-06
**Task**: 隐藏已禁用引擎的会话提供方入口
**Branch**: `feature/vv-v0.4.14`

### Summary

(Add summary)

### Main Changes

任务目标：优化 CLI 启用/禁用后的前端展示，让禁用后的 Gemini / OpenCode 不再继续出现在聊天输入区的引擎提供方下拉中。

主要改动：
- 调整 ProviderSelect 渲染逻辑，只展示可用 provider 与当前已选 provider。
- 禁用 Gemini / OpenCode 后，从聊天输入区 provider dropdown 中移除对应候选项。
- 保留当前已选且刚被禁用的 provider 作为只读兜底，避免 UI 选中态突变。
- 回写 control-cli-engine-startup-gates 的 proposal/tasks/design，补齐 provider dropdown 的隐藏契约与 fallback 规则。
- 补充 ProviderSelect 回归测试，覆盖隐藏 disabled 候选与 disabled current fallback。

涉及模块：
- src/features/composer/components/ChatInputBox/selectors/ProviderSelect.tsx
- src/features/composer/components/ChatInputBox/selectors/ProviderSelect.test.tsx
- openspec/changes/control-cli-engine-startup-gates/proposal.md
- openspec/changes/control-cli-engine-startup-gates/tasks.md
- openspec/changes/control-cli-engine-startup-gates/design.md

验证结果：
- 通过：npx vitest run src/features/composer/components/ChatInputBox/selectors/ProviderSelect.test.tsx src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx src/features/engine/hooks/useEngineController.test.tsx
- 结果：3 files passed / 56 tests passed

后续事项：
- 如需正式归档该 OpenSpec change，建议补跑 openspec validate --all --strict --no-interactive 并核对 tasks 完整度。


### Git Commits

| Hash | Message |
|------|---------|
| `dc99a007392c9f9ce82fd33ad25ed8510049aa48` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
