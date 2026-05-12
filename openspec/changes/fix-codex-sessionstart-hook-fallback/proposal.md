## Why

部分用户在特定项目中使用 ccgui 创建 Codex 新会话时失败，错误表现为“运行时没有返回新的会话 ID”。排查显示 Codex CLI 与 `app-server --help` 可用，但项目级 `.codex/hooks.json` / `SessionStart` hook 可能在 `thread/start` 创建链路中失败、超时、输出异常或注入过重上下文，从而阻塞桌面端拿到 `thread.id`。

`SessionStart` hook 是上下文增强能力，不应比“用户能创建新会话”拥有更高优先级。现在需要 P0 兜底：hook 异常必须变成可观测 warning，而不是会话创建硬失败。

## 目标与边界

- 保证 ccgui 在项目级 Codex `SessionStart` hook 失败、超时、输出非法或导致 `thread/start` 返回缺少 `thread.id` 时，能进行一次有界 fallback 并创建可用新会话。
- fallback 必须保留诊断证据，让用户知道项目 hook 已被跳过或降级，而不是静默吞掉问题。
- fallback 必须只影响当前失败的创建会话请求，不自动修改用户项目文件，不自动 rename `.codex/hooks.json`。
- fallback 成功后，新会话必须收到明确提示：项目 SessionStart hook 未注入，项目上下文可能不完整，需要检查 hook 配置。

## 非目标

- 不重写 Codex CLI 官方 hook 执行机制。
- 不全局禁用所有 Codex hooks。
- 不把 hook 错误伪装成正常健康状态。
- 不处理 Codex CLI 未安装、未登录、账号限额、网络失败、模型不可用等非 hook 创建失败。
- 不改变 Claude / Gemini / OpenCode 的会话创建语义。

## What Changes

- Codex app-server session creation 将支持 `normal` 与 `session-hooks-disabled` 两种内部启动模式。
- 当 `thread/start` 没有返回可解析 `thread.id`，或创建过程命中 hook 相关失败/超时时，系统必须执行一次有界 hook-safe fallback。
- fallback 将重启或替换当前 workspace 的 Codex runtime，并以禁用 SessionStart hook 的方式重试 `thread/start`。
- fallback 成功时，用户界面必须显示可理解提示，运行时诊断必须记录 primary 失败、fallback 触发原因与 fallback 结果。
- fallback 会话必须注入短提示，说明项目 SessionStart hook 已被跳过，用户可继续使用但需要检查 `.codex/hooks.json`。
- fallback 失败时，错误必须保留 primary 与 fallback 两段摘要，不能退化成 generic unknown failure。

## 技术方案对比

| 方案 | 描述 | 优点 | 缺点 | 取舍 |
|---|---|---|---|---|
| A. 前端提示用户手动禁用 hook | 创建失败后提示用户 rename `.codex/hooks.json` | 实现最小 | P0 阻塞仍然存在，用户必须离开客户端排障 | 不采用 |
| B. 后端 hook-safe fallback | primary 失败后后端自动用禁用 SessionStart hook 的 runtime 重试，并暴露 warning | 自动止血、保留诊断、无需改用户项目 | 需要 backend lifecycle 与测试覆盖 | 采用 |
| C. 修改项目 hook 脚本让所有 hook 自己跳过 | 依赖每个项目在 hook 里识别 ccgui/app-server | 可局部规避 | 无法覆盖第三方项目，协议责任外溢 | 不采用 |

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `codex-app-server-wrapper-launch`: 扩展 Codex app-server 创建会话兼容契约，要求项目 SessionStart hook 不得作为硬依赖阻塞会话创建，并定义 hook-safe fallback 行为。
- `conversation-runtime-stability`: 扩展可恢复 create-session failure contract，要求 hook-induced create-session failure 可被有界恢复并在 diagnostics/UI 中可观测。

## Impact

- Backend runtime / app-server:
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/backend/app_server_cli.rs`
  - `src-tauri/src/codex/session_runtime.rs`
  - `src-tauri/src/shared/codex_core.rs`
  - `src-tauri/src/runtime/session_lifecycle.rs`
- Frontend diagnostics / user notice:
  - `src/features/app/hooks/useWorkspaceActions.ts`
  - `src/features/notifications/hooks/useGlobalRuntimeNoticeDock.ts`
  - `src/i18n/locales/*`
- Tests:
  - focused Rust tests for app-server fallback and thread/start response validation
  - focused Vitest tests for user-visible fallback notice and create-session recovery behavior

## 验收标准

- hook 正常时，创建会话路径与当前行为一致，不触发 fallback。
- hook 抛错、超时、输出非法或造成 `thread/start` 缺少 `thread.id` 时，ccgui 能自动创建可用新会话。
- fallback 成功后，用户能看到“已跳过项目 SessionStart hook”的提示。
- fallback 成功后，新会话首轮上下文包含 hook 跳过说明。
- fallback 失败时，错误包含 primary 与 fallback 摘要，便于继续排障。
- 新增测试覆盖 hook-safe fallback、无 `thread.id` response、fallback notice、健康路径不回归。
