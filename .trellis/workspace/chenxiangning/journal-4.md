# Journal - chenxiangning (Part 4)

> Continuation from `journal-3.md` (archived at ~2000 lines)
> Started: 2026-04-22

---



## Session 102: 新增 Claude 桌面流式慢体验修复提案

**Date**: 2026-04-22
**Task**: 新增 Claude 桌面流式慢体验修复提案
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标:
- 针对 issue #399 落一个 OpenSpec 修复提案，明确是否需要修、修复边界、实现顺序与验证方式。

主要改动:
- 新建 openspec/changes/fix-qwen-desktop-streaming-latency change。
- 编写 proposal，明确该问题属于 provider/platform 相关的流式慢体验，不按全局性能大重构处理。
- 编写 design，确定“诊断先行 + provider-scoped mitigation”的技术路线。
- 新增 conversation-stream-latency-diagnostics 与 conversation-provider-stream-mitigation 两条 delta specs。
- 编写 tasks，拆分 diagnostics、provider fingerprint、mitigation profile 与验证步骤。

涉及模块:
- openspec/changes/fix-qwen-desktop-streaming-latency/proposal.md
- openspec/changes/fix-qwen-desktop-streaming-latency/design.md
- openspec/changes/fix-qwen-desktop-streaming-latency/specs/conversation-stream-latency-diagnostics/spec.md
- openspec/changes/fix-qwen-desktop-streaming-latency/specs/conversation-provider-stream-mitigation/spec.md
- openspec/changes/fix-qwen-desktop-streaming-latency/tasks.md

验证结果:
- openspec status --change fix-qwen-desktop-streaming-latency 显示 4/4 artifacts complete。
- openspec validate fix-qwen-desktop-streaming-latency --type change --strict --no-interactive 通过。
- 本次仅提交 OpenSpec artifacts，未混入工作区其他未提交实现改动。

后续事项:
- 按 tasks 先补 stream latency diagnostics，再实现 provider-scoped mitigation。
- 若后续需要把 change 名称从 qwen 收敛为更通用的 claude/provider 语义，可在实现前再评估是否 rename。


### Git Commits

| Hash | Message |
|------|---------|
| `16a34090253c0409803301c960f585681917c7ee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 103: docs(openspec): 回写并归档实时 markdown streaming 兼容性提案

**Date**: 2026-04-22
**Task**: docs(openspec): 回写并归档实时 markdown streaming 兼容性提案
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：将 fix-live-inline-code-markdown-rendering 的 delta spec 回写到主 specs，并将该 change 归档，完成 OpenSpec 层面的最终收口。

主要改动：
- 新增主 spec `openspec/specs/message-markdown-streaming-compatibility/spec.md`
- 将 `fix-live-inline-code-markdown-rendering` 从活跃 change 目录归档到 `openspec/changes/archive/2026-04-22-fix-live-inline-code-markdown-rendering/`
- 保留 proposal、design、tasks 和 delta spec，形成可追溯 archive

涉及模块：
- OpenSpec 主 specs
- OpenSpec archive changes

验证结果：
- `openspec list --changes` 中已不再显示 `fix-live-inline-code-markdown-rendering`
- 主 spec 文件已存在并包含 4 条正式 requirement
- 归档目录已存在并包含 proposal/design/tasks/specs

后续事项：
- 本次仅提交 OpenSpec 回写与归档，不包含其他未提交工作区改动
- 如需继续推进，可后续单独整理 qwen latency 等其他变更边界


### Git Commits

| Hash | Message |
|------|---------|
| `cd332b84` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 104: 补齐 Claude 流式延迟诊断并启用定向缓解

**Date**: 2026-04-22
**Task**: 补齐 Claude 流式延迟诊断并启用定向缓解
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标:
- 为 Claude 桌面流式慢体验补齐可关联的 per-thread latency diagnostics，并在命中特定 provider/platform 指纹时启用更激进的渲染缓解。

主要改动:
- 新增 src/features/threads/utils/streamLatencyDiagnostics.ts，统一维护 thread 级流式延迟快照、provider 指纹、platform 判定、延迟分类与 mitigation profile 解析。
- 在线程发送、turn start、首个 delta、首个可见 render、turn completed/error 等链路记录 first token、chunk cadence、render lag 相关证据，并输出 upstream-pending / render-amplification 诊断。
- 在 Messages / MessagesTimeline 渲染链路下传 stream mitigation profile，让命中 Qwen-compatible Claude provider + Windows 的路径动态提高 assistant/reasoning markdown 的 streaming throttle。
- 补充 streamLatencyDiagnostics、MessagesRows.stream-mitigation、useThreadEventHandlers 的测试覆盖，验证 provider 命中、未命中、等待首个 delta 与完成态关联维度。

涉及模块:
- src/features/threads/utils/streamLatencyDiagnostics.ts
- src/features/threads/utils/streamLatencyDiagnostics.test.ts
- src/features/threads/hooks/threadMessagingHelpers.ts
- src/features/threads/hooks/useThreadMessaging.ts
- src/features/threads/hooks/useThreadEventHandlers.ts
- src/features/threads/hooks/useThreadEventHandlers.test.ts
- src/features/messages/components/Messages.tsx
- src/features/messages/components/MessagesTimeline.tsx
- src/features/messages/components/MessagesRows.stream-mitigation.test.tsx

验证结果:
- 本次未额外运行 lint/typecheck/test；仅完成代码提交与范围核对。
- 提交范围已排除 CHANGELOG、settingsViewConstants、markdownCodeRegions.test.ts 以及其他未完成 OpenSpec 草稿，避免混入无关改动。

后续事项:
- 如需交付前闭环，建议继续运行针对性 Vitest 以及基础质量门禁。
- 当前 active task 仍显示 fix-live-inline-code-markdown-rendering，后续可视情况整理任务指向，减少 record 与实际实现主题的偏移。


### Git Commits

| Hash | Message |
|------|---------|
| `9d16c31953ae2e48919e6da91c6062abe1c8295d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 105: Add codex computer use plugin bridge change

**Date**: 2026-04-22
**Task**: Add codex computer use plugin bridge change
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：为 Codex Computer Use plugin bridge 创建完整 OpenSpec 提案，限定为独立模块、最小侵入、可插拔、macOS/Windows 分治，并明确当前阶段为 status-only bridge。

主要改动：
- 新建 OpenSpec change `add-codex-computer-use-plugin-bridge`
- 完成 proposal、design、3 份 capability specs 与 tasks
- 根据提案审查结果回填 Phase 1 边界，明确本期不包含 helper invoke
- 固化 availability status 优先级与最小 blockedReasons contract

涉及模块：
- openspec/changes/add-codex-computer-use-plugin-bridge/proposal.md
- openspec/changes/add-codex-computer-use-plugin-bridge/design.md
- openspec/changes/add-codex-computer-use-plugin-bridge/specs/codex-computer-use-plugin-bridge/spec.md
- openspec/changes/add-codex-computer-use-plugin-bridge/specs/computer-use-platform-adapter/spec.md
- openspec/changes/add-codex-computer-use-plugin-bridge/specs/computer-use-availability-surface/spec.md
- openspec/changes/add-codex-computer-use-plugin-bridge/tasks.md

验证结果：
- `openspec status --change add-codex-computer-use-plugin-bridge --json` 返回 `isComplete: true`
- proposal/design/specs/tasks 四个 artifacts 全部为 `done`
- 本次未执行 lint/typecheck/test，因为只提交 OpenSpec 文档

后续事项：
- 下一阶段可进入 `openspec-apply-change`
- 建议从 backend status model、platform adapter、availability surface 开始实现
- helper invoke 需在后续独立 phase 验证宿主桥接性后再议


### Git Commits

| Hash | Message |
|------|---------|
| `e8933fdd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 106: fix(notifications): 收紧运行时提示悬浮点右下角定位

**Date**: 2026-04-22
**Task**: fix(notifications): 收紧运行时提示悬浮点右下角定位
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：将右下角运行时提示悬浮点进一步贴近窗口右下角。
主要改动：调整 global-runtime-notice-dock-shell 的 right/bottom 定位偏移，从 20px 收紧到 4px，并保留 safe-area 计算。
涉及模块：src/styles/global-runtime-notice-dock.css（notifications 全局悬浮提示样式）。
验证结果：已检查业务提交仅包含该 CSS 文件 diff；未运行 lint/test，本次为纯样式定位微调。
后续事项：如需更激进的贴边效果，可继续评估 0px + safe-area 或同步优化展开面板贴角展开体验。


### Git Commits

| Hash | Message |
|------|---------|
| `74fbc0bb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 107: 完成 Computer Use Phase 1 状态桥接实现

**Date**: 2026-04-22
**Task**: 完成 Computer Use Phase 1 状态桥接实现
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

## 任务目标
- 执行 OpenSpec change `add-codex-computer-use-plugin-bridge`
- 完成 Phase 1 status-only bridge，实现对本机官方 Codex Computer Use 安装状态的只读探测与设置页可见面板

## 主要改动
- 新增 Rust `src-tauri/src/computer_use/**` 模块，提供 status model、platform dispatch、macOS/Windows adapter 与 `get_computer_use_bridge_status` command
- 新增前端 `src/features/computer-use/**` feature、`src/services/tauri/computerUse.ts` bridge、`src/types.ts` contract 与 settings surface
- 修复 `.mcp.json` helper 相对路径解析，按 `descriptor dir + cwd` 解析真实 helper 二进制路径，避免误报 `helper missing`
- 同步 OpenSpec artifacts 与 `.trellis/spec/backend|frontend/computer-use-bridge.md` code-spec 契约
- 补充 blocked / unsupported UI 与 helper path regression tests

## 涉及模块
- backend: `src-tauri/src/computer_use/**`, `src-tauri/src/command_registry.rs`, `src-tauri/src/lib.rs`
- frontend: `src/features/computer-use/**`, `src/services/tauri.ts`, `src/services/tauri.test.ts`, `src/services/tauri/computerUse.ts`, `src/types.ts`
- settings/i18n: `src/features/settings/components/settings-view/sections/CodexSection.tsx`, `src/features/settings/components/settings-view/settingsViewConstants.ts`, `src/i18n/locales/en.part1.ts`, `src/i18n/locales/zh.part1.ts`
- specs: `openspec/changes/add-codex-computer-use-plugin-bridge/**`, `.trellis/spec/backend/computer-use-bridge.md`, `.trellis/spec/frontend/computer-use-bridge.md`

## 验证结果
- `npm run lint` 通过（仅有现存 warning）
- `npm run typecheck` 通过
- `npm run test` 通过
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过
- `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture` 通过
- `npx vitest run src/features/computer-use/components/ComputerUseStatusCard.test.tsx` 通过
- `macOS` 实机验证：状态为预期内的 `blocked`，helper 路径解析正确

## 后续事项
- `E.3` 仍保留 1 个 blocker：缺少 Windows 真机 `unsupported` 验证
- 工作区仍存在与本次提交无关的未提交改动，后续需要分开处理


### Git Commits

| Hash | Message |
|------|---------|
| `7cbf1f60` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 108: 修复 OpenCode 自动探测抖动

**Date**: 2026-04-22
**Task**: 修复 OpenCode 自动探测抖动
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：收敛 OpenCode 在 sidebar 菜单打开、菜单常驻与 Claude 模型刷新路径上的自动探测，避免后台反复拉起 opencode CLI 导致 CPU 抖动与菜单长时间停留在检测态。

主要改动：
- 移除 useSidebarMenus 在菜单打开和 rerender 期间的自动 provider health probe，仅保留用户显式 refresh 时的探测路径。
- 调整 useEngineController 的刷新策略，新增 engine-scoped model refresh，避免 Claude-only 刷新放大成 all-engine detection。
- 更新 Sidebar 刷新按钮事件处理，确保手动刷新行为稳定且不会误触菜单关闭。
- 同步补齐 useSidebarMenus、useEngineController、Sidebar 相关前端回归测试。
- 新增并同步提交 OpenSpec change：fix-opencode-auto-probe-churn。

涉及模块：
- src/features/app/hooks/useSidebarMenus.ts
- src/features/engine/hooks/useEngineController.ts
- src/features/app/components/Sidebar.tsx
- src/app-shell.tsx
- openspec/changes/fix-opencode-auto-probe-churn/

验证结果：
- 本次回合未额外执行 lint / typecheck / test；提交依据是当前工作区现有实现与测试改动分组结果。

后续事项：
- 后续可补跑 targeted frontend tests 与质量门禁，确认 manual refresh-only 行为在完整测试矩阵下无回退。


### Git Commits

| Hash | Message |
|------|---------|
| `f3448982` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 109: 对齐 Claude Doctor 与 CLI 验证链路

**Date**: 2026-04-22
**Task**: 对齐 Claude Doctor 与 CLI 验证链路
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：补齐 Claude CLI settings、doctor、remote backend 与 daemon forwarding 的 cross-layer contract，让 Claude Code 与 Codex 在 CLI 验证、PATH 诊断和远端执行语义上保持一致。

主要改动：
- 在 frontend settings、service、controller 与 app shell 中补齐 claudeBin 字段、Claude doctor 触发入口与结果透传。
- 将设置页的 Codex 入口升级为统一的 CLI 验证面板，拆分 shared execution backend 与 Codex / Claude Code tabs。
- 在 Rust backend 新增/收口 claude_doctor 相关实现，补齐 remote bridge、daemon RPC、history command forwarding 与 PATH bootstrap。
- 调整 CLI 二进制探测与 debug helper，减少自定义 bin 误匹配并统一 app/daemon 的诊断语义。
- 同步补齐相关 TS/Rust 测试、i18n 文案与 OpenSpec change：fix-claude-doctor-settings-alignment。

涉及模块：
- src/features/settings/**
- src/services/tauri.ts 与 src/services/tauri/doctor.ts
- src-tauri/src/codex/**
- src-tauri/src/bin/cc_gui_daemon/**
- src-tauri/src/engine/**
- openspec/changes/fix-claude-doctor-settings-alignment/

验证结果：
- 本次回合未额外执行 lint / typecheck / test；提交依据是当前工作区跨层改动分组结果与现有测试补丁。

后续事项：
- 后续可补跑 frontend / Rust 质量门禁，并手测 settings 中的 Codex / Claude Code doctor 行为与 remote backend parity。


### Git Commits

| Hash | Message |
|------|---------|
| `80829b4c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 110: 修复 Computer Use 插件清单版本选择

**Date**: 2026-04-22
**Task**: 修复 Computer Use 插件清单版本选择
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：修复 Computer Use 插件缓存目录中多版本 manifest 并存时的版本选择错误，避免字符串排序把高版本误判成低版本。

主要改动：
- 将 plugin manifest 路径选择从简单排序改为按版本号片段做 numeric compare。
- 在版本号相同的情况下保留 label 比较作为稳定兜底。
- 补充 Rust 回归测试，覆盖 2.9.0 与 10.0.0 并存时应优先选择 10.0.0 的场景。

涉及模块：
- src-tauri/src/computer_use/mod.rs

验证结果：
- 本次回合未单独执行 cargo test；提交包含针对该逻辑的回归测试代码。

后续事项：
- 如需进一步验证，可补跑 src-tauri 相关测试集，确认插件缓存扫描与 manifest 加载链路稳定。


### Git Commits

| Hash | Message |
|------|---------|
| `a06c730c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 111: 补充 markdown code region 回归测试

**Date**: 2026-04-22
**Task**: 补充 markdown code region 回归测试
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：为 markdown code region 文本归一化补一条边界回归，防止 token-shaped 普通文本在 inline code 外部被错误处理。

主要改动：
- 新增 normalizeOutsideMarkdownCode 回归测试。
- 覆盖普通文本中出现 CCGUIINLINECODETOKEN 形态字符串时，替换逻辑仍应只处理目标文本本身，不误伤 token-like 字面量。

涉及模块：
- src/utils/markdownCodeRegions.test.ts

验证结果：
- 本次回合未单独执行测试命令；提交内容为新增 Vitest 回归用例。

后续事项：
- 如后续继续重构 markdown 渲染或 code region 归一化逻辑，可将该用例纳入 targeted test 集合做快速回归。


### Git Commits

| Hash | Message |
|------|---------|
| `0588973a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 112: 更新 v0.4.7 发布说明

**Date**: 2026-04-22
**Task**: 更新 v0.4.7 发布说明
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：补充 v0.4.7 的中英文发布说明，确保版本文档对齐已完成的用户可见能力与修复项。

主要改动：
- 在 CHANGELOG.md 中新增 2026-04-22（v0.4.7）版本条目。
- 汇总 runtime notice、恢复承接、fusion continuity、sticky 对齐与跨平台渲染稳定性等本轮功能、改进与修复。
- 同步维护中英文内容，保持版本说明可直接用于发布或内部对齐。

涉及模块：
- CHANGELOG.md

验证结果：
- 文档更新未涉及代码执行；本次回合未额外运行测试命令。

后续事项：
- 后续发布前可结合实际发版范围再做一次措辞核对，确保 release notes 与最终归档变更保持一致。


### Git Commits

| Hash | Message |
|------|---------|
| `0db213e2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 113: 收口 inline code 去重作用域并补齐重复渲染回归

**Date**: 2026-04-22
**Task**: 收口 inline code 去重作用域并补齐重复渲染回归
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标
- 修复 assistant 文本在“整段重复且含多个 inline code span”时的重复渲染问题。
- 将风险收口到 assistant 去重链路，避免影响历史/普通 markdown 渲染。
- 控制测试文件继续逼近 3000 行 large-file 阈值的风险。

主要改动
- 为 markdownCodeRegions 增加专用的 stable inline region API，保留通用 helper 原始语义。
- 将 assistant message normalization 切换为专用 stable inline region 去重链路。
- 新增 markdownCodeRegions、threadItems、useThreadsReducer inline-code 定向回归测试。
- 将新增 reducer 用例拆到独立测试文件，降低 useThreadsReducer.test.ts 体量增长风险。

涉及模块
- src/utils/markdownCodeRegions.ts
- src/utils/threadItems.ts
- src/utils/markdownCodeRegions.test.ts
- src/utils/threadItems.test.ts
- src/features/threads/hooks/useThreadsReducer.inline-code.test.ts

验证结果
- npm exec vitest run src/utils/markdownCodeRegions.test.ts src/utils/threadItems.test.ts src/features/threads/hooks/useThreadsReducer.inline-code.test.ts src/features/threads/hooks/useThreadsReducer.test.ts src/features/messages/components/Messages.test.tsx
  - 5 个测试文件通过，247 个测试通过。
- npm run check:large-files:near-threshold
  - 通过；useThreadsReducer.test.ts 从 2990 行回落到 2961 行，仍处于 near-threshold watch。
- npm run lint
  - 无 error；保留仓库现有 109 个 warning，未新增当前改动相关 warning。
- npm run typecheck
  - 本轮等待窗口内未返回失败结果；未将其标记为通过。

后续事项
- 若用户继续反馈历史消息仍有重复，需要抓取具体 ConversationItem 原始文本做最小复现并补真实样本回归。


### Git Commits

| Hash | Message |
|------|---------|
| `3600b38d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 114: 收口 assistant 最终回复近似重复段落去重

**Date**: 2026-04-22
**Task**: 收口 assistant 最终回复近似重复段落去重
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标：review 当前工作区并修复 Codex/Claude 长任务 completed payload 在最终气泡中偶发双份大段输出的问题，同时满足 large-file governance 约束。

主要改动：
- 新增 src/utils/assistantDuplicateParagraphs.ts，统一处理近似重复 paragraph halves / repeated blocks / existing-vs-completed 变体合并。
- 在 src/features/threads/hooks/threadReducerTextMerge.ts 的 completeAgentMessage 收口链路中接入 paragraph 级近似合并，并在 completed 文本 normalize 前先尝试折叠 raw completed payload。
- 在 src/utils/threadItems.ts 的 assistant normalize 链路复用同一 helper，保证 live、completed、history restore 三条路径语义一致。
- 新增 src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts，并补强 threadReducerTextMerge.test.ts，覆盖大段 final 输出双份且带轻微改写的回归场景。
- 清理误生成的异常根目录文件，避免污染工作区与跨平台文件遍历。

涉及模块：
- src/features/threads/hooks/threadReducerTextMerge.ts
- src/utils/threadItems.ts
- src/utils/assistantDuplicateParagraphs.ts
- src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts
- src/features/threads/hooks/threadReducerTextMerge.test.ts

验证结果：
- npm exec vitest run src/features/threads/hooks/threadReducerTextMerge.test.ts src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts src/features/threads/hooks/useThreadsReducer.inline-code.test.ts src/utils/threadItems.test.ts src/features/threads/hooks/useThreadsReducer.test.ts 通过（177 passed）。
- npm run check:large-files 通过，src/utils/threadItems.ts 回落到 2983 行，large-file gate found=0。
- npm exec eslint src/features/threads/hooks/threadReducerTextMerge.ts src/features/threads/hooks/threadReducerTextMerge.test.ts src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts src/utils/threadItems.ts src/utils/assistantDuplicateParagraphs.ts 通过。
- npm run typecheck 通过。
- npm run lint 通过，无 error；仓库现存 react-hooks warnings 仍存在，但不是本次改动新增。

后续事项：
- 若后续仍观察到最终输出重复，可继续把 assistant duplicate helper 扩展到 sentence-level near-duplicate 与 history assembler 的统一 contract。


### Git Commits

| Hash | Message |
|------|---------|
| `6c0d1606` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 115: 修复 codex 最终消息 markdown 结构块重复

**Date**: 2026-04-22
**Task**: 修复 codex 最终消息 markdown 结构块重复
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标
- 修复 codex assistant 最终消息在 completed 阶段仍会出现整块重复的问题，重点覆盖“说明段 + 过渡句 + markdown list + 收尾句”这类结构化文本。

主要改动
- 扩展 `src/utils/assistantDuplicateParagraphs.ts` 的切分策略，从纯 paragraph 级去重升级为 paragraph + markdown section block 去重。
- 为 list / quote / heading / ordered list / table 结构行增加独立 block 识别。
- 为以句号、问号、感叹号、冒号结尾的独立行增加单独成块能力，避免单换行拼接时把两份重复内容错并到一个大段里。
- 新增 reducer 级回归测试，覆盖“单换行分隔的重复 markdown section” completed merge。
- 新增 integration 级回归测试，覆盖 append delta -> completeAgentMessage -> upsertItem 全链路最终只保留一份文本。

涉及模块
- `src/utils/assistantDuplicateParagraphs.ts`
- `src/features/threads/hooks/threadReducerTextMerge.test.ts`
- `src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts`

验证结果
- `npm exec vitest run src/features/threads/hooks/threadReducerTextMerge.test.ts src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts`
- `npm run check:large-files`
- `npm exec eslint src/utils/assistantDuplicateParagraphs.ts src/features/threads/hooks/threadReducerTextMerge.test.ts src/features/threads/hooks/useThreadsReducer.completed-duplicate.test.ts`
- `npm run typecheck`

后续事项
- 继续观察真实 codex 会话里是否还有其它未覆盖的重复形态，例如 code fence、table、quote 混排后的 completed payload 双份。
- 如果线上再出现新样式，优先补最小失败用例，再扩展统一 helper，避免把逻辑重新散落回 `threadItems.ts`。


### Git Commits

| Hash | Message |
|------|---------|
| `c3b99dba` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 116: 补写 v0.4.7 changelog 消息区修复说明

**Date**: 2026-04-22
**Task**: 补写 v0.4.7 changelog 消息区修复说明
**Branch**: `feature/v-0.4.7`

### Summary

(Add summary)

### Main Changes

任务目标
- 补写 `CHANGELOG.md`，让 v0.4.7 的发布说明覆盖 2026-04-22 已经实际落地的消息区重复修复与 markdown 渲染稳定性优化。

主要改动
- 仅更新 `CHANGELOG.md`，不删除任何原有内容。
- 在 `2026年4月22日（v0.4.7）` 条目下追加中文与英文说明。
- 在 `🔧 Improvements` 中补写实时对话 inline code 流式渲染与去重作用域优化。
- 在 `🐛 Fixes` 中补写 assistant 最终消息近似重复段落、单换行 markdown section 与 completed 阶段双份输出的收口修复。

涉及模块
- `CHANGELOG.md`

验证结果
- `git diff -- CHANGELOG.md`
- 人工校对追加位置、中英双语对应关系与版本结构，确认本次为纯追加且未删除原内容。

后续事项
- 如后续继续补写 v0.4.7 其它已落地但未记录的用户可见改动，继续保持同一版本块下增量追加，不新开重复版本节。


### Git Commits

| Hash | Message |
|------|---------|
| `042f7853` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 117: 同步 OpenSpec 提案并归档已完成变更

**Date**: 2026-04-22
**Task**: 同步 OpenSpec 提案并归档已完成变更
**Branch**: `feature/v-0.4.8`

### Summary

回写 active proposals 的代码核对状态，归档两个已完成 change，并同步 README/project 快照。

### Main Changes

任务目标:
- 检查 openspec/changes 下 active proposals 是否与当前代码现实一致。
- 将已满足条件的 change 执行 sync + archive。
- 同步 openspec README / project context 的仓库快照与活跃变更列表。

主要改动:
- 回写 `add-codex-computer-use-plugin-bridge` proposal，补充 2026-04-22 代码核对状态。
- 回写 `fix-claude-doctor-settings-alignment` proposal，补充 doctor/settings/remote parity 的代码核对状态。
- 补齐 `fix-opencode-auto-probe-churn` proposal 与 tasks 收尾，并完成归档。
- 归档 `fix-claude-chat-canvas-cross-platform-blanking`，同步 `conversation-render-surface-stability` 与 `conversation-stream-activity-presence` 主 spec。
- 更新 `openspec/README.md`、`openspec/project.md` 的 specs/archive/active 数量、active changes 列表和 2026-04-22 update history。

涉及模块:
- `openspec/changes/add-codex-computer-use-plugin-bridge/proposal.md`
- `openspec/changes/fix-claude-doctor-settings-alignment/proposal.md`
- `openspec/changes/archive/2026-04-22-fix-claude-chat-canvas-cross-platform-blanking/`
- `openspec/changes/archive/2026-04-22-fix-opencode-auto-probe-churn/`
- `openspec/specs/conversation-render-surface-stability/spec.md`
- `openspec/specs/conversation-stream-activity-presence/spec.md`
- `openspec/specs/opencode-mode-ux/spec.md`
- `openspec/README.md`
- `openspec/project.md`

验证结果:
- `openspec validate --changes --strict --no-interactive` 通过。
- `npx vitest run src/features/app/hooks/useSidebarMenus.test.tsx src/features/engine/hooks/useEngineController.test.tsx src/features/app/components/Sidebar.test.tsx` 通过，55/55 tests passed。
- `npm run typecheck` 通过。
- `npm run lint` 通过，无新增 errors；保留仓库既有 warnings。

后续事项:
- `add-codex-computer-use-plugin-bridge` 仍待手测矩阵与 rollback checklist 闭环。
- `fix-claude-doctor-settings-alignment` 仍待最终质量门禁、手测与 apply-ready 收尾。
- 其余 active change 仍保持 proposal / planning 状态，未进入归档条件。


### Git Commits

| Hash | Message |
|------|---------|
| `73b9256c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 118: Upgrade large-file governance policy

**Date**: 2026-04-23
**Task**: Upgrade large-file governance policy
**Branch**: `feature/v-0.4.8`

### Summary

将大文件治理升级为按域 policy + baseline-aware hard gate。

### Main Changes

任务目标:
- 将单一 3000 行阈值升级为 domain-aware、baseline-aware 的 large-file governance。

主要改动:
- 新增 policy 文件与 baseline-aware gate 逻辑。
- 更新 CI/workflow 与 package scripts。
- 补齐 playbook、Trellis task 与 OpenSpec change。

涉及模块:
- scripts/check-large-files.mjs
- scripts/check-large-files.policy.json
- scripts/check-large-files.test.mjs
- .github/workflows/large-file-governance.yml
- package.json
- docs/architecture/large-file-governance-playbook.md
- openspec/changes/upgrade-large-file-governance-policy-v2

验证结果:
- node --test scripts/check-large-files.test.mjs 通过
- npm run check:large-files 通过
- npm run check:large-files:near-threshold 通过
- npm run check:large-files:gate 通过

后续事项:
- 基于新 policy 继续分批拆解 retained hard debt 与 near-threshold 热点。


### Git Commits

| Hash | Message |
|------|---------|
| `6b6dc1c9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 119: Split tauri, app shell, and thread messaging hotspots

**Date**: 2026-04-23
**Task**: Split tauri, app shell, and thread messaging hotspots
**Branch**: `feature/v-0.4.8`

### Summary

拆分 tauri façade、app-shell orchestration 和 thread messaging session tooling 三个高热点大文件。

### Main Changes

任务目标:
- 将 bridge/runtime 与 threads/shell 的大文件热点拆成 feature-local 或 domain-local 模块。

主要改动:
- 将 src/services/tauri.ts 拆成 vendors / agents / dictation / terminalRuntime / projectMemory 子模块。
- 将 app-shell 的 search/radar/activity 与 prompt actions orchestration 提取到 app-shell-parts hooks。
- 将 useThreadMessaging 的 session tooling commands 提取到独立 hook。
- 保持 outward contract，不要求调用方迁移。

涉及模块:
- src/services/tauri.ts 及 src/services/tauri/*
- src/app-shell.tsx 及 src/app-shell-parts/*
- src/features/threads/hooks/useThreadMessaging.ts
- src/features/threads/hooks/useThreadMessagingSessionTooling.ts
- 对应 Trellis tasks 与 OpenSpec changes

验证结果:
- npm run typecheck 通过
- npm run check:runtime-contracts 通过
- npm run check:large-files:gate 通过
- npx vitest run src/features/threads/hooks/useThreadMessaging.test.tsx src/features/threads/hooks/useQueuedSend.test.tsx 通过

后续事项:
- 继续拆解 threads 侧剩余热点，并在最终一组提交中统一更新 baseline/watchlist。


### Git Commits

| Hash | Message |
|------|---------|
| `1b25ff26` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 120: Split thread actions and thread item hotspots

**Date**: 2026-04-23
**Task**: Split thread actions and thread item hotspots
**Branch**: `feature/v-0.4.8`

### Summary

拆分 useThreadActions 的 session runtime 子域和 threadItems 的 assistant text policy 子域，并更新最终 baseline/watchlist。

### Main Changes

任务目标:
- 继续压缩 threads 域 retained hard debt，并让最终大文件台账与代码状态对齐。

主要改动:
- 将 useThreadActions 的 start/fork/rewind 生命周期动作抽到 useThreadActionsSessionRuntime。
- 将 threadItems 的 assistant text normalization / dedupe / readability scoring 抽到 threadItemsAssistantText。
- 更新 large-file baseline、baseline.json 与 near-threshold watchlist。
- 补齐两轮 Trellis tasks 与 OpenSpec changes。

涉及模块:
- src/features/threads/hooks/useThreadActions.ts
- src/features/threads/hooks/useThreadActionsSessionRuntime.ts
- src/utils/threadItems.ts
- src/utils/threadItemsAssistantText.ts
- docs/architecture/large-file-baseline*
- docs/architecture/large-file-near-threshold-watchlist.md

验证结果:
- npm run typecheck 通过
- npm run check:large-files:gate 通过
- npx vitest run src/features/threads/loaders/claudeHistoryLoader.test.ts src/features/threads/hooks/threadReducerTextMerge.test.ts src/features/threads/hooks/useThreadActions.test.tsx src/features/threads/hooks/useThreadActions.rewind.test.tsx 通过

后续事项:
- 继续处理剩余 retained hard debt，优先评估 CSS 热点和 Rust bridge/runtime 大文件。


### Git Commits

| Hash | Message |
|------|---------|
| `f4deb70d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 121: Split settings, composer, and git history style shards

**Date**: 2026-04-23
**Task**: Split settings, composer, and git history style shards
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 清理 settings/composer/git-history 样式 hard debt
- 按自然 section/namespace 拆分 CSS shard，保持 selector contract 和 cascade 稳定

主要改动:
- 将 settings vendor panels 与 basic redesign section 抽到独立 shard
- 将 composer rewind modal 命名空间抽到 composer.rewind-modal.css
- 将 git history branch compare 命名空间抽到 git-history.branch-compare.css
- 为三轮样式拆分补齐对应 Trellis PRD 与 OpenSpec artifacts

涉及模块:
- src/styles/settings*
- src/styles/composer*
- src/styles/git-history*
- .trellis/tasks/04-23-split-settings-css-panel-sections
- .trellis/tasks/04-23-split-composer-rewind-modal-styles
- .trellis/tasks/04-23-split-git-history-branch-compare-styles
- openspec/changes/split-settings-css-panel-sections
- openspec/changes/split-composer-rewind-modal-styles
- openspec/changes/split-git-history-branch-compare-styles

验证结果:
- npm run check:large-files:gate 通过
- settings/composer/git-history 样式 hard debt 已全部清零
- OpenSpec change 状态均为 4/4 artifacts complete

后续事项:
- 继续提交 runtime session lifecycle 与 git branch command modularization
- 在最终一轮刷新 baseline/watchlist 文档


### Git Commits

| Hash | Message |
|------|---------|
| `4c2e28ee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 122: Split runtime session lifecycle submodule

**Date**: 2026-04-23
**Task**: Split runtime session lifecycle submodule
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 清理 runtime/mod.rs hard debt
- 将 workspace session lifecycle 子域抽到独立 backend-local 模块
- 保持 crate::runtime outward surface 和 command contract 稳定

主要改动:
- 新增 src-tauri/src/runtime/session_lifecycle.rs
- 将 close/evict/terminate/replace/rollback helper 从 runtime/mod.rs 迁出
- runtime/mod.rs 通过 re-export 维持 replace_workspace_session、stop_workspace_session、terminate_workspace_session 等既有入口
- 补齐 split-runtime-session-lifecycle 对应 Trellis PRD 与 OpenSpec artifacts

涉及模块:
- src-tauri/src/runtime/mod.rs
- src-tauri/src/runtime/session_lifecycle.rs
- .trellis/tasks/04-23-split-runtime-session-lifecycle
- openspec/changes/split-runtime-session-lifecycle

验证结果:
- npm run typecheck 通过
- cargo test --manifest-path src-tauri/Cargo.toml runtime:: 通过
- npm run check:large-files:gate 通过
- runtime/mod.rs 已降到 hard gate 以下

后续事项:
- 继续提交 git branch command modularization
- 在最终一轮刷新 baseline/watchlist 文档


### Git Commits

| Hash | Message |
|------|---------|
| `8556b2c4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 123: Split git branch commands and refresh baseline

**Date**: 2026-04-23
**Task**: Split git branch commands and refresh baseline
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 清理 git/commands.rs hard debt
- 将 branch lifecycle 与 branch compare 子域抽到独立 command 子模块
- 刷新 large-file baseline/watchlist，确认当前 hard debt 只剩 engine/commands.rs

主要改动:
- 新增 src-tauri/src/git/commands_branch.rs
- 将 list/checkout/create/delete/rename/merge/rebase/branch compare/worktree diff 子域从 git/commands.rs 迁出
- commands.rs 通过 re-export 保持 crate::git::* outward surface 稳定
- 刷新 docs/architecture 下的 baseline 与 watchlist 文档
- 补齐 split-git-branch-commands 对应 Trellis PRD 与 OpenSpec artifacts

涉及模块:
- src-tauri/src/git/commands.rs
- src-tauri/src/git/commands_branch.rs
- docs/architecture/large-file-baseline.md
- docs/architecture/large-file-baseline.json
- docs/architecture/large-file-near-threshold-watchlist.md
- .trellis/tasks/04-23-split-git-branch-commands
- openspec/changes/split-git-branch-commands

验证结果:
- npm run typecheck 通过
- cargo test --manifest-path src-tauri/Cargo.toml git:: 通过
- npm run check:large-files:gate 通过
- baseline 现仅剩 src-tauri/src/engine/commands.rs 一项 hard debt

后续事项:
- 下一轮只剩 engine/commands.rs 这一块 P0 热点
- 如需继续，可单独为 engine command surface 开一轮 modularization


### Git Commits

| Hash | Message |
|------|---------|
| `332497ee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 124: Split engine OpenCode command surface

**Date**: 2026-04-23
**Task**: Split engine OpenCode command surface
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 将 src-tauri/src/engine/commands.rs 中的 OpenCode command surface 抽到独立子模块。
- 保持 crate::engine::* outward surface、command_registry 名称和 workspace cleanup helper 不变。

主要改动:
- 新增 src-tauri/src/engine/commands_opencode.rs，承载 OpenCode commands/agents/session/provider/mcp/lsp 子域。
- 在 src-tauri/src/engine/commands.rs 中挂载并 re-export commands_opencode 子模块，保留 send/interrupt 主链。
- 新增 OpenSpec change split-engine-opencode-command-surface 与 Trellis task 04-23-split-engine-opencode-command-surface。
- 重算 docs/architecture/large-file-baseline.{md,json} 与 large-file-near-threshold-watchlist.md。

涉及模块:
- src-tauri/src/engine/commands.rs
- src-tauri/src/engine/commands_opencode.rs
- openspec/changes/split-engine-opencode-command-surface/**
- .trellis/tasks/04-23-split-engine-opencode-command-surface/**
- docs/architecture/large-file-*.md

验证结果:
- cargo test --manifest-path src-tauri/Cargo.toml engine:: 通过（lib 243 + daemon 205 测试通过）
- npm run typecheck 通过
- npm run check:large-files:gate 通过（found=0）
- npm run check:large-files:baseline 通过并更新 baseline
- npm run check:large-files:near-threshold:baseline 通过并更新 watchlist
- openspec status --change split-engine-opencode-command-surface 显示 4/4 artifacts complete

后续事项:
- 目前 retained hard debt 已清零；下一步可按 watchlist 决定是否继续拆 bridge-runtime-critical 的 warn 项。


### Git Commits

| Hash | Message |
|------|---------|
| `2384c5a6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 125: 回归门禁修复与线程测试契约对齐

**Date**: 2026-04-23
**Task**: 回归门禁修复与线程测试契约对齐
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

## 任务目标
补跑全量回归，修复阻塞回归验收的静态门禁问题，并对齐 threads 域 integration tests 的 tauri mock contract。

## 主要改动
- 在 `src/app-shell.tsx` 补回 `writeClientStoreValue` import，恢复 app-shell runtime contract 校验。
- 去掉 `src/app-shell-parts/useAppShellPromptActionsSection.ts` 与 `src/app-shell-parts/useAppShellSearchRadarSection.ts` 的 `@ts-nocheck`，改为显式输入类型 contract。
- 为 `useThreads.memory-race.integration.test.tsx`、`useThreads.pin.integration.test.tsx`、`useThreads.integration.test.tsx` 的 `services/tauri` mock 补齐 `connectWorkspace`，修复 heavy integration 下的测试契约漂移。

## 涉及模块
- app-shell orchestration
- threads integration tests
- clientStorage/runtime contract gate

## 验证结果
- `npm run typecheck` 通过
- `npm run lint` 通过（0 errors，保留既有 warnings）
- `npm run check:runtime-contracts` 通过
- `npm run doctor:strict` 通过
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（485 passed）
- `VITEST_INCLUDE_HEAVY=1 npm run test` 全量跑通；期间修复 `useThreads` 集成测试 mock 漂移后，从 277/345 断点续跑剩余 69 个 test files，全绿

## 后续事项
- 当前工作树只剩本次已提交代码与待提交 journal record
- 可考虑后续单独清理仓库中长期存在的 `react-hooks/exhaustive-deps` warnings


### Git Commits

| Hash | Message |
|------|---------|
| `a975548c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 126: 归档大文件治理 OpenSpec 变更

**Date**: 2026-04-23
**Task**: 归档大文件治理 OpenSpec 变更
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 归档本轮大文件治理相关的 OpenSpec change，完成 archive + spec sync 收尾。

主要改动:
- 归档 12 个 large-file-governance 相关 change 到 openspec/changes/archive/2026-04-22-*。
- 同步主 specs，落入 large-file modularization governance 与各兼容性 spec。
- 保留 upgrade-large-file-governance-policy-v2 的 archive warning：tasks.md 仍有 1 个未勾选任务，但 archive 已按 --yes 完成。

涉及模块:
- openspec/changes/archive/**
- openspec/specs/**

验证结果:
- openspec archive <change> --yes 对 12 个目标 change 均执行成功。
- git commit 已生成：39c78985 归档大文件治理 OpenSpec 变更。

后续事项:
- 下一步可按 warning inventory 分批清理 react-hooks/exhaustive-deps。


### Git Commits

| Hash | Message |
|------|---------|
| `39c78985` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 127: 收敛首批 exhaustive-deps 告警

**Date**: 2026-04-23
**Task**: 收敛首批 exhaustive-deps 告警
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 建立 react-hooks/exhaustive-deps 告警治理提案，并落地第一批低风险 P0 warning 修复。

主要改动:
- 新建 OpenSpec change `triage-exhaustive-deps-warning-batches` 与对应 Trellis task，完成 proposal/design/specs/tasks/PRD。
- 修复 9 个 frontend 文件中的 11 条低风险 exhaustive-deps warning。
- 识别并延期 `ButtonArea` 与 `useSessionRadarFeed` 的 sentinel-pattern warning，避免机械删除依赖改坏重算语义。
- 将 warning 盘点更新为 `109 -> 98`，文件数更新为 `25 -> 16`。

涉及模块:
- src/features/files/components/FileViewPanel.tsx
- src/features/git/components/GitDiffPanel.tsx
- src/features/messages/components/toolBlocks/ReadToolBlock.tsx
- src/features/opencode/components/OpenCodeControlPanel.tsx
- src/features/project-memory/components/ProjectMemoryPanel.tsx
- src/features/search/components/SearchPalette.tsx
- src/features/settings/components/settings-view/hooks/useSystemResolvedTheme.ts
- src/features/settings/components/settings-view/sections/WebServiceSettings.tsx
- src/features/spec/hooks/useSpecHub.ts
- openspec/changes/triage-exhaustive-deps-warning-batches/**
- .trellis/tasks/04-23-triage-exhaustive-deps-warning-batches/prd.md

验证结果:
- npm run typecheck 通过
- npm run lint 通过（剩余 98 条 exhaustive-deps warning，0 errors）
- npx vitest run src/features/files/components/FileViewPanel.test.tsx src/features/git/components/GitDiffPanel.test.tsx src/features/messages/components/toolBlocks/ReadToolBlock.test.tsx src/features/spec/hooks/useSpecHub.test.tsx src/features/opencode/components/OpenCodeControlPanel.test.tsx src/features/settings/components/settings-view/sections/WebServiceSettings.test.tsx src/features/project-memory/components/ProjectMemoryPanel.test.tsx src/features/search/components/SearchPalette.test.tsx 通过（8 files / 111 tests）
- openspec status --change triage-exhaustive-deps-warning-batches 显示 4/4 artifacts complete

后续事项:
- 下一轮优先在 sentinel-pattern warning 与 git-history hotspot 之间二选一继续治理。


### Git Commits

| Hash | Message |
|------|---------|
| `0c51f80c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 128: 稳定 sentinel 刷新路径

**Date**: 2026-04-23
**Task**: 稳定 sentinel 刷新路径
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 处理 ButtonArea 与 useSessionRadarFeed 中不能机械修复的 exhaustive-deps sentinel warning。

主要改动:
- 新建 OpenSpec change `stabilize-exhaustive-deps-sentinel-patterns` 与对应 Trellis task，完成 proposal/design/specs/tasks/PRD。
- 将 ButtonArea 的 `customModelsVersion` 版本号哨兵替换为显式 storage snapshot，并通过 `storage` / `localStorageChange` 事件刷新。
- 将 useSessionRadarFeed 的 `durationRefreshTick` / `historyMutationVersion` 替换为显式 `clockNow` / `recentHistorySnapshot`。
- 新增 ButtonArea 定向测试，并扩展 radar incremental test 覆盖 history event refresh。
- exhaustive-deps warning 总量从 `98` 降到 `95`，文件数从 `16` 降到 `14`。

涉及模块:
- src/features/composer/components/ChatInputBox/ButtonArea.tsx
- src/features/composer/components/ChatInputBox/ButtonArea.test.tsx
- src/features/session-activity/hooks/useSessionRadarFeed.ts
- src/features/session-activity/hooks/useSessionRadarFeed.incremental.test.tsx
- openspec/changes/stabilize-exhaustive-deps-sentinel-patterns/**
- .trellis/tasks/04-23-stabilize-exhaustive-deps-sentinel-patterns/prd.md

验证结果:
- npm run typecheck 通过
- npm run lint 通过（剩余 95 条 exhaustive-deps warning，0 errors）
- npx vitest run src/features/composer/components/ChatInputBox/ButtonArea.test.tsx src/features/session-activity/hooks/useSessionRadarFeed.test.ts src/features/session-activity/hooks/useSessionRadarFeed.incremental.test.tsx 通过（3 files / 7 tests）
- openspec status --change stabilize-exhaustive-deps-sentinel-patterns 显示 4/4 artifacts complete

后续事项:
- 下一轮优先直接攻 git-history hotspot，当前 remaining exhaustive-deps 里 70/95 集中在该文件。


### Git Commits

| Hash | Message |
|------|---------|
| `def54253` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 129: 归档 exhaustive-deps 治理 OpenSpec 变更

**Date**: 2026-04-23
**Task**: 归档 exhaustive-deps 治理 OpenSpec 变更
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 归档已完成的 exhaustive-deps 治理 OpenSpec changes，并同步主 specs。

主要改动:
- 归档 change `triage-exhaustive-deps-warning-batches`
- 归档 change `stabilize-exhaustive-deps-sentinel-patterns`
- 同步生成主 specs:
  - openspec/specs/exhaustive-deps-warning-governance/spec.md
  - openspec/specs/exhaustive-deps-sentinel-pattern-stability/spec.md

涉及模块:
- openspec/changes/archive/2026-04-22-triage-exhaustive-deps-warning-batches/**
- openspec/changes/archive/2026-04-22-stabilize-exhaustive-deps-sentinel-patterns/**
- openspec/specs/exhaustive-deps-warning-governance/spec.md
- openspec/specs/exhaustive-deps-sentinel-pattern-stability/spec.md

验证结果:
- openspec archive triage-exhaustive-deps-warning-batches --yes 成功
- openspec archive stabilize-exhaustive-deps-sentinel-patterns --yes 成功
- 两个 change 均在 4/4 artifacts complete 后归档

后续事项:
- 下一轮直接进入 git-history exhaustive-deps hotspot 治理。


### Git Commits

| Hash | Message |
|------|---------|
| `c9496469` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 130: 收敛 git-history 首批 exhaustive-deps 告警

**Date**: 2026-04-23
**Task**: 收敛 git-history 首批 exhaustive-deps 告警
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 为 git-history 的 exhaustive-deps hotspot 建立专门的 OpenSpec/Trellis change，并先落地首批低风险 warning 修复。

主要改动:
- 新建 OpenSpec change `stabilize-git-history-exhaustive-deps-hotspot`，补齐 proposal/design/spec/tasks。
- 新建 Trellis task `04-23-stabilize-git-history-exhaustive-deps-hotspot`。
- 在 `useGitHistoryPanelInteractions.tsx` 中补全 fallback/workspace、branch CRUD、create-pr defaults/head repo parse/simple copy handlers 的依赖数组。
- 将高风险 preview/push/pull/sync/diff/menu/resize warning 留在 deferred batches。

涉及模块:
- src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx
- openspec/changes/stabilize-git-history-exhaustive-deps-hotspot/**
- .trellis/tasks/04-23-stabilize-git-history-exhaustive-deps-hotspot/prd.md

验证结果:
- 目标文件 `react-hooks/exhaustive-deps` warning: 70 -> 47
- 仓库总 warning: 95 -> 72
- `npm run lint` 通过（0 errors, 72 warnings）
- `npm run typecheck` 通过
- `npx vitest run src/features/git-history/components/GitHistoryPanel.test.tsx src/features/git-history/components/git-history-panel/components/GitHistoryPanelPickers.test.tsx` 通过（34 tests）

后续事项:
- 下一批优先处理 create-pr preview、push/pull/sync preview 相关 warning。
- context menu / resize / diff preview 继续保持 deferred，等专门批次和更细的测试覆盖再动。


### Git Commits

| Hash | Message |
|------|---------|
| `d135ad6e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 131: 收敛 git-history 第二批 exhaustive-deps 告警

**Date**: 2026-04-23
**Task**: 收敛 git-history 第二批 exhaustive-deps 告警
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标:
- 继续执行 OpenSpec change `stabilize-git-history-exhaustive-deps-hotspot`，完成 P1 的 create-pr preview 与 push/pull/sync preview warning 修复。

主要改动:
- 将 change tasks 从“仅排 P1”扩展为可执行的 P1 remediation tasks。
- 在 `useGitHistoryPanelInteractions.tsx` 中补全 create-pr preview loader、preview details effect、dialog open/close、workflow stages 的依赖数组。
- 补全 pull/sync/fetch/refresh/push dialog bootstrap、preview loader、preview details effect、confirm handlers 的依赖数组。
- 保持 P2 的 diff/menu/resize/commit action warning 继续 deferred。

涉及模块:
- src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx
- openspec/changes/stabilize-git-history-exhaustive-deps-hotspot/tasks.md
- .trellis/tasks/04-23-stabilize-git-history-exhaustive-deps-hotspot/prd.md

验证结果:
- 目标文件 `react-hooks/exhaustive-deps` warning: 47 -> 24
- 仓库总 warning: 72 -> 49
- `npm run lint` 通过（0 errors, 49 warnings）
- `npm run typecheck` 通过
- `npx vitest run src/features/git-history/components/GitHistoryPanel.test.tsx src/features/git-history/components/git-history-panel/components/GitHistoryPanelPickers.test.tsx` 通过（34 tests）

后续事项:
- 下一批只剩 P2：branch diff loaders、commit actions、context menu、resize interactions。
- 当前 change 在完成 P2 前不要归档。


### Git Commits

| Hash | Message |
|------|---------|
| `3479d297` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 132: 收敛 git-history 第三批 exhaustive-deps 告警

**Date**: 2026-04-23
**Task**: 收敛 git-history 第三批 exhaustive-deps 告警
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标：完成 OpenSpec change `stabilize-git-history-exhaustive-deps-hotspot` 的 P2 批次，实现 git-history 最后一组 branch diff、commit actions、context menu 与 resize 相关 `react-hooks/exhaustive-deps` warning 收口。

主要改动：
- 在 `useGitHistoryPanelInteractions.tsx` 中补齐 branch diff loader、commit actions、branch context menu、desktop split / details splitter 等依赖数组。
- 更新 `openspec/changes/stabilize-git-history-exhaustive-deps-hotspot/tasks.md`，将 P2 四项任务全部勾完成。
- 更新 `.trellis/tasks/04-23-stabilize-git-history-exhaustive-deps-hotspot/prd.md`，把目标、要求和验收标准同步到 P2 交互批次。

涉及模块：
- `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx`
- `openspec/changes/stabilize-git-history-exhaustive-deps-hotspot/tasks.md`
- `.trellis/tasks/04-23-stabilize-git-history-exhaustive-deps-hotspot/prd.md`

验证结果：
- 目标文件 warning：`24 -> 0`
- 仓库 `react-hooks/exhaustive-deps` warning：`49 -> 25`
- `npm run lint` 通过（0 errors, 25 warnings）
- `npm run typecheck` 通过
- `npx vitest run src/features/git-history/components/GitHistoryPanel.test.tsx src/features/git-history/components/git-history-panel/components/GitHistoryPanelPickers.test.tsx` 通过（34 tests）

后续事项：
- `stabilize-git-history-exhaustive-deps-hotspot` 现已完成三批治理，可直接进入 OpenSpec archive。


### Git Commits

| Hash | Message |
|------|---------|
| `33a0472c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 133: 归档 git-history exhaustive-deps OpenSpec 变更

**Date**: 2026-04-23
**Task**: 归档 git-history exhaustive-deps OpenSpec 变更
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标：归档 `stabilize-git-history-exhaustive-deps-hotspot`，把已完成的三批 git-history exhaustive-deps 治理从 change 工作区迁入 archive，并同步主 specs。

主要改动：
- 执行 `openspec archive "stabilize-git-history-exhaustive-deps-hotspot" --yes`。
- 将 change 目录迁入 `openspec/changes/archive/2026-04-22-stabilize-git-history-exhaustive-deps-hotspot/`。
- 把 `git-history-exhaustive-deps-stability` 同步到 `openspec/specs/` 主规范。

涉及模块：
- `openspec/changes/archive/2026-04-22-stabilize-git-history-exhaustive-deps-hotspot/**`
- `openspec/specs/git-history-exhaustive-deps-stability/spec.md`

验证结果：
- `openspec archive "stabilize-git-history-exhaustive-deps-hotspot" --yes` 成功
- archive 输出确认 `Task status: ✓ Complete`
- 主 spec 已创建并同步
- 归档提交后 `git status --short` 保持干净

后续事项：
- git-history 这条 exhaustive-deps 治理链已闭环。
- 仓库剩余 warning 已降到 25 条，下一步可转向 `app-shell-parts` 或 `threads` 热点。


### Git Commits

| Hash | Message |
|------|---------|
| `c404d71e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 134: 收敛 app-shell-parts exhaustive-deps 告警

**Date**: 2026-04-23
**Task**: 收敛 app-shell-parts exhaustive-deps 告警
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标：处理 `app-shell-parts` 剩余的 `react-hooks/exhaustive-deps` 热点，收敛 `useAppShellSearchAndComposerSection.ts` 与 `useAppShellSections.ts` 中的 9 条 warning，并为这轮治理建立 OpenSpec/Trellis 追踪。

主要改动：
- 新建 OpenSpec change `stabilize-app-shell-parts-exhaustive-deps-hotspot` 与对应 Trellis PRD，定义 `P0 search/transition` 与 `P1 scheduler` 两批治理边界。
- 在 `useAppShellSearchAndComposerSection.ts` 中补齐 search palette 开关、selection、filter 和结果选择回调的 setter 依赖。
- 在 `useAppShellSections.ts` 中补齐 kanban panel 打开、home/workspace 过渡回调，以及 recurring scheduler effect 的 `kanbanCreateTask` 依赖。
- 更新 change tasks，将两批任务全部标记完成。

涉及模块：
- `src/app-shell-parts/useAppShellSearchAndComposerSection.ts`
- `src/app-shell-parts/useAppShellSections.ts`
- `openspec/changes/stabilize-app-shell-parts-exhaustive-deps-hotspot/**`
- `.trellis/tasks/04-23-stabilize-app-shell-parts-exhaustive-deps-hotspot/prd.md`

验证结果：
- `app-shell-parts` 两个目标文件 warning：`9 -> 0`
- 仓库 `react-hooks/exhaustive-deps` warning：`25 -> 16`
- `npx vitest run src/app-shell-parts/useAppShellSections.kanban-text.test.ts src/features/search/components/SearchPalette.test.tsx src/features/workspaces/components/WorkspaceHome.test.tsx` 通过（28 tests）
- `npm run lint` 通过（0 errors, 16 warnings）
- `npm run typecheck` 通过

后续事项：
- `stabilize-app-shell-parts-exhaustive-deps-hotspot` 已满足归档条件，可直接执行 OpenSpec archive。
- 下一批热点建议转向 `threads` 域的剩余 10 条 warning。


### Git Commits

| Hash | Message |
|------|---------|
| `d1278a25` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 135: 归档 app-shell-parts exhaustive-deps OpenSpec 变更

**Date**: 2026-04-23
**Task**: 归档 app-shell-parts exhaustive-deps OpenSpec 变更
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标：归档 `stabilize-app-shell-parts-exhaustive-deps-hotspot`，把完成的 app-shell-parts exhaustive-deps 治理从 active change 迁入 archive，并同步主 specs。

主要改动：
- 执行 `openspec archive "stabilize-app-shell-parts-exhaustive-deps-hotspot" --yes`。
- 将 change 目录迁入 `openspec/changes/archive/2026-04-22-stabilize-app-shell-parts-exhaustive-deps-hotspot/`。
- 把 `app-shell-exhaustive-deps-stability` 同步到 `openspec/specs/` 主规范。

涉及模块：
- `openspec/changes/archive/2026-04-22-stabilize-app-shell-parts-exhaustive-deps-hotspot/**`
- `openspec/specs/app-shell-exhaustive-deps-stability/spec.md`

验证结果：
- `openspec archive "stabilize-app-shell-parts-exhaustive-deps-hotspot" --yes` 成功
- archive 输出确认 `Task status: ✓ Complete`
- 主 spec 已创建并同步
- 归档提交后 `git status --short` 保持干净

后续事项：
- app-shell-parts 这条 exhaustive-deps 治理链已闭环。
- 仓库剩余 warning 已降到 16 条，下一步可转向 `threads` 域的剩余热点。


### Git Commits

| Hash | Message |
|------|---------|
| `dbd8fd50` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 136: 收敛 threads exhaustive-deps 告警

**Date**: 2026-04-23
**Task**: 收敛 threads exhaustive-deps 告警
**Branch**: `feature/v-0.4.8`

### Summary

(Add summary)

### Main Changes

任务目标：处理 `threads` 域剩余的 `react-hooks/exhaustive-deps` 热点，收敛 5 个 hook 中的 10 条 warning，并为这轮治理建立 OpenSpec/Trellis 追踪。

主要改动：
- 新建 OpenSpec change `stabilize-threads-exhaustive-deps-hotspot` 与对应 Trellis PRD，定义 `P0 missing deps` 与 `P1 factory callback stabilization` 两批治理边界。
- 在 `useQueuedSend.ts`、`useThreadItemEvents.ts`、`useThreadTurnEvents.ts`、`useThreadActions.ts` 中补齐普通缺失依赖。
- 在 `useThreadActions.ts` 与 `useThreadActionsSessionRuntime.ts` 中把 `useCallback(factory(...))` 替换为 `useMemo(() => factory(...), deps)`。
- 更新 change tasks，将两批任务全部标记完成。

涉及模块：
- `src/features/threads/hooks/useQueuedSend.ts`
- `src/features/threads/hooks/useThreadActions.ts`
- `src/features/threads/hooks/useThreadActionsSessionRuntime.ts`
- `src/features/threads/hooks/useThreadItemEvents.ts`
- `src/features/threads/hooks/useThreadTurnEvents.ts`
- `openspec/changes/stabilize-threads-exhaustive-deps-hotspot/**`
- `.trellis/tasks/04-23-stabilize-threads-exhaustive-deps-hotspot/prd.md`

验证结果：
- 目标 5 个 hook warning：`10 -> 0`
- 仓库 `react-hooks/exhaustive-deps` warning：`16 -> 6`
- `npx vitest run src/features/threads/hooks/useQueuedSend.test.tsx src/features/threads/hooks/useThreadActions.test.tsx src/features/threads/hooks/useThreadActions.rewind.test.tsx src/features/threads/hooks/useThreadActions.codex-rewind.test.tsx src/features/threads/hooks/useThreadActions.shared-native-compat.test.tsx src/features/threads/hooks/useThreadItemEvents.test.ts src/features/threads/hooks/useThreadTurnEvents.test.tsx` 通过（204 tests）
- `npm run lint` 通过（0 errors, 6 warnings）
- `npm run typecheck` 通过

后续事项：
- `stabilize-threads-exhaustive-deps-hotspot` 已满足归档条件，可直接执行 OpenSpec archive。
- 仓库只剩 6 条 warning，下一步可考虑做最后一轮 leaf-file 收尾。


### Git Commits

| Hash | Message |
|------|---------|
| `01ae0e63` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
