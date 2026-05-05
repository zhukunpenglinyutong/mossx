## Why

Windows 用户在本机已安装 OpenCode 的场景下，CodeMoss 对 `opencode` 的检测或调用有概率命中会激活前台窗口的 launcher，而不是纯 CLI binary，导致应用在刷新状态或进入 OpenCode 路径时频繁把 OpenCode 拉到前台。这个问题已出现最新版本用户反馈，且会直接破坏基础可用性，必须尽快收敛为平台有界修复。

## Target And Boundary

- 只覆盖 `Windows + 已安装 OpenCode + launcher/CLI 误判` 导致的前台抢焦点问题。
- 只允许调整 OpenCode 在 Windows 下的 binary resolution、probe gating、以及前台安全约束。
- 必须显式保持 `macOS/Linux` 的 OpenCode 正常路径不变。
- 必须显式保持 `Claude`、`Codex`、`Gemini` 的检测、启动、刷新与会话行为不变。
- 不在本提案中顺带修改 OpenCode provider auth、MCP、session model、或通用 engine selector 交互。

## Non-Goals

- 不重写 OpenCode engine runtime 或 `run --format json` 主链路。
- 不修改非 Windows 平台上的 CLI 发现顺序。
- 不把本问题扩展成“统一重构所有 engine 的 binary discovery”。
- 不处理与本次故障无直接关系的性能、样式或文案问题。

## What Changes

- 新增 Windows 专属的 OpenCode CLI/launcher 区分约束，避免把会激活桌面窗口的 launcher 当作后台 CLI probe 目标。
- 为 OpenCode 的安装检测、手动 refresh、以及用户显式进入 OpenCode 前的 readiness path 增加“不得抢前台”的行为约束。
- 为 Windows 下无法确认 candidate 为安全 CLI 的场景提供有界失败与可诊断结果，而不是继续执行可能拉起 GUI 的 binary。
- 补充平台守卫与回归门禁，确保 `macOS/Linux` 和其他引擎继续走现有健康路径。

## Option Comparison

### Option A: 仅继续收紧自动 probe 触发点

- 优点：改动面最小，前端路径简单。
- 缺点：即使只剩手动 refresh 或用户显式进入 OpenCode，仍可能命中错误 binary，把 GUI 拉到前台。
- 结论：不能根治，拒绝采用。

### Option B: 在 Windows 下新增 OpenCode CLI-safe resolution 与 foreground safety guard

- 优点：直接解决根因，把“调用错 binary”从源头拦住；同时可把影响面限定在 `Windows + OpenCode`。
- 缺点：需要新增 platform-specific detection contract 与 targeted backend tests。
- 结论：采用。它最符合“边界清晰、不影响 mac 和其他引擎”的要求。

## Capabilities

### New Capabilities

- `opencode-windows-cli-resolution`: 定义 Windows 下 OpenCode binary discovery、CLI/launcher 区分、以及 foreground-safe probe 的平台约束。

### Modified Capabilities

- `opencode-mode-ux`: OpenCode 的显式 refresh / readiness 行为在 Windows 命中 launcher-like candidate 时，必须保持不抢前台，并向用户返回可诊断状态而不是隐式拉起外部窗口。

## Acceptance Criteria

- Windows 上已安装 OpenCode 且存在 launcher/desktop app 的场景中，CodeMoss 触发 OpenCode 检测、手动 refresh、或显式进入 OpenCode 前置检查时，不得把 OpenCode 窗口拉到前台。
- 当 Windows 下解析到的 candidate 不是可安全探测的 CLI 时，系统必须返回稳定、可读、可诊断的结果，而不是继续执行该 candidate。
- macOS 与 Linux 上的 OpenCode 现有健康路径必须保持不变。
- Claude、Codex、Gemini 的安装检测、刷新与启动行为必须保持不变。
- 必须存在针对 Windows OpenCode resolution/guard 的 targeted tests，并包含非 Windows / 非 OpenCode 的防回归断言。

## Impact

- Affected backend:
  - `src-tauri/src/backend/app_server_cli.rs`
  - `src-tauri/src/engine/status.rs`
  - `src-tauri/src/engine/commands.rs`
  - `src-tauri/src/engine/opencode.rs`
- Possible affected frontend mapping:
  - `src/services/tauri.ts`
  - `src/features/app/hooks/useSidebarMenus.ts`
  - `src/features/engine/hooks/useEngineController.ts`
- Validation impact:
  - Rust backend tests for Windows-specific resolution/probe guards
  - Focused frontend regression for OpenCode manual refresh / readiness diagnostics
