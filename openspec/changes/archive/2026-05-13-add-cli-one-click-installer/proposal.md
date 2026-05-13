## Why

当前 `运行环境 -> CLI 验证` 已能诊断 Codex / Claude Code 的 binary、PATH、wrapper、Node 与 remote backend 状态，但诊断失败后只能让用户手动离开客户端查命令安装。截图里的 `Claude Code not_found` 属于典型断点：系统知道 CLI 不可用，却没有受控的一键修复入口。

本变更要把 “doctor only” 升级为 “doctor + bounded remediation”，在客户端内提供 Codex / Claude Code 的一键安装或更新到最新版能力，同时严格限制执行边界，避免把客户端扩散成任意 shell runner。

## 目标与边界

### 目标

- 在 `CLI 验证` 面板为 `Codex` 与 `Claude Code` 提供受控的安装 / 更新入口。
- 支持 macOS 与 Windows 的主路径，并对 WSL / remote backend 明确降级或转发语义。
- 安装动作必须与 doctor 共享 binary / PATH / backendMode / wrapper resolution 语义，避免 “doctor 诊断 A 环境，installer 修改 B 环境”。
- 安装完成后自动运行对应 doctor，并刷新 engine availability，让用户看到可解释结果。
- 所有外部命令必须来自后端白名单策略，不允许前端传任意 shell。

### 边界

- Phase 1 只覆盖 `Codex` 与 `Claude Code`。
- Phase 1 只允许官方推荐的 npm global 安装 / 更新路径；CLI 自带 updater 仅作为 future strategy 保留，不在首版执行。
- 安装动作只影响当前执行 backend：
  - `backendMode = local` 时作用于桌面本机环境。
  - `backendMode = remote` 时必须转发到 remote daemon，由 daemon 在自身环境执行。
- 不自动修改用户 shell profile、npm prefix、PATH 持久化配置或全局 provider 配置。
- 不自动使用 `sudo`、管理员提权、PowerShell execution policy 修改、`curl | bash`、raw script 或任意 pipeline。
- 不把安装能力扩散到 runtime pool、project launch scripts、provider management、Computer Use plugin 安装。

## 非目标

- 不实现通用 package manager 管理器。
- 不支持 Gemini CLI / OpenCode CLI 的一键安装；这两个 tab 仍保持 enable/disable 与现有诊断边界。
- 不自动修复 Node / npm 缺失。Node/npm 缺失时只给结构化 remediation hint。
- 不自动选择 Homebrew、winget、Chocolatey、Scoop、nvm、fnm、volta 等安装渠道。
- 不静默覆盖用户显式配置的 `codexBin` / `claudeBin`。
- 不承诺安装后一定完成登录 / auth；auth 仍由对应 CLI 官方流程处理。

## What Changes

- 新增 `cli-one-click-installer` 能力，定义 Codex / Claude Code 的受控安装、npm latest 更新、确认、执行、日志、doctor refresh 与失败降级契约。
- 在 `CLI 验证` 的 Codex / Claude Code tab 增加 “安装最新版 / 更新最新版” 操作入口，按钮可见性由 doctor 结果和 install plan 决定。
- 后端新增一个受控 installer command，输入只允许 engine/action/strategy 等枚举，不接受任意 command string。
- installer 在执行前返回 install plan，前端必须展示将执行的命令、目标 backend、目标 shell family、风险提示和确认按钮。
- installer 需要输出结构化结果：success/failure、exit code、stdout/stderr 摘要、实际策略、是否运行 post-install doctor、doctor 结果。
- remote mode 下 installer 必须走 remote daemon 转发，不能在 desktop app 本机误执行。
- 对 Windows/macOS 建立最小兼容矩阵：
  - macOS / Linux-like local：优先 npm global strategy。
  - Windows native：通过 npm `.cmd` / `npm.cmd` 语义执行，不依赖 Unix shell。
  - WSL path / remote Linux：Phase 1 不在 desktop 侧跨边界安装，只允许 remote daemon 自己执行或展示手动命令。
- 安装失败时保持 read-only degrade：CLI 不可用的 engine 入口继续禁用或显示 blocker，但不影响其他 engine。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 前端直接拼接安装命令并调用 terminal / shell | 实现快 | 命令注入、平台漂移、remote/local 错位、无法复用 doctor resolution | 不采用 |
| B | 后端白名单 installer command，前端只传枚举 action | 边界清晰，可测试，可转发 remote，可复用 doctor | 需要建 plan/result 类型和确认 UI | **采用** |
| C | 打开官方安装文档，不在客户端执行 | 风险最低 | 不能解决用户“CLI 未安装”时的一键恢复诉求 | 作为 fallback 保留 |
| D | 做完整包管理抽象，支持 brew/winget/scoop/nvm 等 | 覆盖广 | 范围失控，维护成本高，平台分支复杂 | 不进 Phase 1 |

## Capabilities

### New Capabilities

- `cli-one-click-installer`: 定义 Codex / Claude Code 在客户端内一键安装或更新到最新版的受控行为、安全边界、跨平台策略和 post-install doctor 契约。

### Modified Capabilities

- `cli-execution-backend-parity`: 扩展 remote backend parity，要求 installer 与 doctor 一样遵守 local / remote execution backend 边界。

## 验收标准

- 当 Codex doctor 报 CLI 缺失且 Node/npm 可用时，Codex tab MUST 展示受控安装入口。
- 当 Claude doctor 报 CLI 缺失且 Node/npm 可用时，Claude Code tab MUST 展示受控安装入口。
- 用户点击安装或更新时，系统 MUST 先展示 install plan 并等待确认，不得静默执行。
- install plan MUST 展示 engine、action、strategy、目标 backend、将执行的命令预览与安全提示。
- backend MUST 只接受枚举化 engine/action/strategy，不得执行 frontend 传入的 raw command。
- 安装完成后 MUST 自动运行对应 doctor，并把 doctor 结果合并进 installer result。
- macOS 本地安装 MUST 不依赖 Windows wrapper 语义；Windows native 安装 MUST 不依赖 `/bin/sh`。
- `backendMode = remote` 时，installer MUST 在 remote daemon 环境执行，并且 desktop app 不得声称已修改 remote daemon 之外的本机 CLI。
- Node/npm 缺失、npm prefix 不可写、网络失败、权限不足等失败 MUST 返回结构化错误和手动恢复建议。
- 系统 MUST NOT 自动使用 `sudo`、管理员提权、shell profile 修改、`curl | bash` 或任意用户输入脚本。

## Impact

- Frontend:
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx`
  - `src/services/tauri/doctor.ts` 或新增相邻 installer bridge
  - `src/types.ts`
  - i18n translation files
- Backend:
  - `src-tauri/src/codex/doctor.rs` 或相邻 installer module
  - `src-tauri/src/codex/mod.rs`
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/remote_backend.rs` / daemon RPC handler surface
- Specs:
  - `openspec/specs/cli-one-click-installer/spec.md`
  - `openspec/specs/cli-execution-backend-parity/spec.md`
- Dependencies:
  - 不新增第三方 Rust / npm dependency。
- Validation:
  - `openspec validate --all --strict --no-interactive`
  - focused Vitest for button visibility / confirm flow
  - Rust unit tests for install plan / command whitelist / remote forwarding
  - Manual smoke on macOS local, Windows native, and remote daemon.
