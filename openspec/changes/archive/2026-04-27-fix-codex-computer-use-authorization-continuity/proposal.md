## Why

当前客户端已经能通过 `codex exec --json` 走官方 Codex CLI / Computer Use plugin 链路，但“权限已在 macOS 打开，broker 仍然报没权限”的问题还没被收敛成可修复的工程事实。`2026-04-24` 同一台机器上，`Terminal -> codex exec -> computer-use.list_apps` 成功返回 app 列表，而当前 host 触发的 `computer-use.list_apps` 仍返回 `Apple event error -10000: Sender process is not authenticated`；同日现有本地 session 里也能读到相同错误。这说明当前阻塞不再是 plugin 缺失，而是 **authorization continuity** 失真：用户授权的 sender 与客户端实际拉起 Codex CLI / helper 的 sender 不是同一条身份链。

如果继续把这类失败统称成 `permission_required`，用户只能反复勾系统权限，却看不到真正应该授权、重启或重置的是哪个 host。结果就是：Computer Use 在终端可用，在客户端不可用；表面像“权限问题”，本质是“launcher identity / sender continuity”问题。

## 代码与实测状态（2026-04-24）

- 终端链路成功：
  - 命令：`codex exec --json --skip-git-repo-check --sandbox read-only -C /Users/chenxiangning/code/AI/github/mossx "Use the official Computer Use tools to list the currently running desktop apps on this Mac. If macOS permissions or app approvals are missing, report the exact blocker and stop."`
  - 结果：`computer-use.list_apps` 成功返回运行中 app 列表。
- 当前 host 失败：
  - `Computer Use` plugin 的 `list_apps` 直接返回 `Apple event error -10000: Sender process is not authenticated`。
- 客户端链路已有同日失败证据：
  - `~/.codex/sessions/2026/04/24/rollout-2026-04-24T12-02-00-019dbda6-d4e0-72c3-8c72-0869ee3009a7.jsonl` 中可读到多次 `Apple event error -10000: Sender process is not authenticated`。
- 当前安装态并非“完全没声明权限”：
  - `/Applications/ccgui.app`、`/Applications/ccgui.app/Contents/MacOS/cc-gui`、`/Applications/ccgui.app/Contents/MacOS/cc_gui_daemon` 都带有 `com.apple.security.automation.apple-events` entitlement。
- 但当前 host 身份链存在漂移风险：
  - 主 App executable identifier 为 `com.zhukunpenglinyutong.ccgui`
  - daemon executable identifier 为 `cc_gui_daemon`，且 `Info.plist=not bound`
  - 当前仓库里还同时存在 `target/debug/cc-gui` 调试进程

## 目标与边界

### 目标

- 让客户端通过 Codex CLI 使用 `Computer Use` 时，授权链路对用户与系统都保持 **single host truth**，不再在主 App、daemon、debug binary、旧签名残留之间漂移；这里的 host 必须指向 **当前 backend mode 下实际执行 `codex exec` 的宿主**，而不是仅凭前台 GUI 名称猜测。
- 把“权限看似已开但仍报未授权”从泛化 `permission_required` 收敛成结构化的 **authorization continuity** 问题，并暴露 exact host evidence。
- 在 Computer Use surface 中明确告诉用户：当前实际发起 broker 的 authorization host 是谁、上一次成功的 host 是谁、两者是否发生漂移、应该重启/重置/重新授权哪一个 host。
- 为后续修复留出实现路径：优先在 **embedded local app mode** 下固定稳定 host；`local daemon` / `remote daemon` 模式必须显式暴露 backend mode 与 host role，只有在 continuity 可验证时才允许继续执行，否则显式 blocked，而不是继续试运行。

### 边界

- 本 change 只处理 `macOS` 上客户端通过 `codex cli` 使用 `Computer Use` 的 **authorization continuity**；不扩大到 Linux / Windows。
- 本 change 聚焦客户端 launcher / sender identity、backend-mode-aware broker preflight、structured diagnostics 与 UI verdict，不重写官方 `computer-use` plugin 本身。
- 本 change 不承诺绕过 macOS TCC / Apple Events / Screen Recording / Accessibility；权限仍由系统与官方 Codex runtime 决定。
- 本 change 默认先以 `embedded local app mode` 为主修复路径；`local daemon` / `remote daemon` path 如果无法提供稳定 identity，宁可显式 blocked，也不假装可用。

## 非目标

- 不直接执行 `SkyComputerUseClient`，不复制、重签、重打包官方 helper。
- 不修改官方 Codex plugin cache、`~/.codex/config.toml` 或 macOS TCC 数据库。
- 不把 `Computer Use` 退回成“只能在 Terminal 使用”的半成品能力。
- 不在本期重构通用 remote backend / web service 权限模型。

## What Changes

- 新增 `Computer Use authorization continuity` capability，定义客户端当前 launcher identity、last successful host、sender mismatch classification 与 remediation contract。
- 修改 `codex-cli-computer-use-broker`：
  - broker 运行前必须解析并固定 **当前 backend mode 下实际执行 `codex exec` 的 authorization host identity**；
  - 当 `Apple event error -10000` / sender authentication failure 出现时，必须区分“generic permission missing”与“authorization continuity broken”；
  - broker 结果必须带回 backend mode、host role，以及足以识别签名漂移的 signing evidence；
  - local broker 不得在多个 launcher identity 间来回漂移。
- 修改 `computer-use-availability-surface`：
  - surface 必须展示当前 authorization host 的 display name / executable path / bundle id(or identifier) / team id / backend mode / host role；
  - surface 必须复用现有 host-contract diagnostics 证据，而不是再并行维护一套脱节 verdict；
  - 若 current host 与 last successful host 漂移，必须渲染 continuity blocked verdict，而不是继续只给“请打开 Accessibility”。
- 增加一轮手测矩阵：
  - `Terminal success + client fail`
  - `same host + still denied stays generic permission`
  - `embedded local app vs local daemon / remote daemon`
  - `signed app vs debug binary`
  - `main app vs daemon identity`
  - `relaunch / reset after re-authorization`

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险 / 成本 | 结论 |
|---|---|---|---|---|
| A | 继续 direct spawn，只有文案更清楚 | 改动最小 | 不能真正解决“授权开了仍失败”，用户仍不知道哪个 sender 在发 Apple Events | 不采用 |
| B | 引入 authorization continuity layer：记录当前 authorization host、上次成功 host，broker 固定当前 backend mode 下的单一执行 host，sender 认证失败时返回结构化 continuity verdict | 能把“权限问题”收敛成可修复 contract；兼容现有 Codex CLI broker；回归面可控 | 需要跨 backend + frontend + manual matrix，并与既有 host-contract diagnostics 融合 | **采用** |
| C | 直接把 broker 改成 external host handoff（例如强制借助 Terminal / 官方 Codex App 再拉起） | 可能复用当前已授权 host | UX 粗糙、窗口副作用大、平台行为不稳定，而且把客户端能力退化成外部跳转 | 本期不采用 |

采用 `B` 的原因很明确：今天的实测已经证明 **同机同插件，不同 host 身份会得到完全不同的权限结果**。所以先把 launcher identity 固定并结构化输出，才有资格谈修复“为什么客户端还不行”。

## Capabilities

### New Capabilities

- `computer-use-authorization-continuity`: 定义客户端执行 Codex CLI Computer Use 时的 authorization host identity、backend mode、last successful host、sender mismatch classification 与 remediation contract。

### Modified Capabilities

- `codex-cli-computer-use-broker`: broker 必须固定授权 host，并在 sender authentication failure 时返回 continuity diagnostics，而不是只归并为 generic permission failure。
- `computer-use-availability-surface`: status surface 必须展示 exact authorization host identity、backend mode、continuity drift 与对应 remediation。

## 验收标准

- 在同一台机器上，若 `Terminal -> codex exec -> computer-use.list_apps` 成功，而客户端 broker 仍失败，系统 MUST 能把失败归因为 launcher continuity / sender mismatch，而不是只显示 `permission_required`。
- broker result MUST 返回当前 authorization host 证据，至少包括：display name、executable path、bundle id 或 executable identifier、team id、backend mode、host role、launch mode，以及用于识别签名漂移的 signing evidence。
- 当 current host 与 last successful host 不同，UI MUST 显式渲染 continuity blocked verdict，并指出应该重新授权 / 重启 / 重置的是哪个 host。
- 在 `embedded local app mode` 下，stable packaged host MUST 成为首选 broker launcher；`local daemon` / `remote daemon` 若无法证明 continuity，则 MUST 明确 blocked。
- 当 current host 与 expected stable host 一致但系统仍拒绝时，结果 MUST 保持 generic permission / approval classification，而不是误判成 continuity blocked。
- 用户完成针对 exact host 的重启 / 重授权后，broker MUST 能重新收敛为可重试状态，而不是永久停留在泛化 permission warning。
- 相关验证至少覆盖：
  - Rust targeted tests
  - frontend Computer Use status card / broker tests
  - `openspec validate fix-codex-computer-use-authorization-continuity --type change --strict --no-interactive`
  - macOS manual matrix

## Impact

- Backend:
  - `src-tauri/src/computer_use/broker.rs`
  - `src-tauri/src/computer_use/mod.rs`
  - `src-tauri/src/backend/app_server_cli.rs`
  - 可能涉及 `src-tauri/src/state.rs` 的 continuity persistence
  - 可能涉及 packaged app / daemon identity inspection
- Frontend:
  - `src/features/computer-use/components/ComputerUseStatusCard.tsx`
  - `src/features/computer-use/hooks/**`
  - `src/services/tauri/computerUse.ts`
  - `src/types.ts`
  - `src/i18n/locales/en.part1.ts`
  - `src/i18n/locales/zh.part1.ts`
- Docs / Specs:
  - `openspec/specs/**`
  - `.trellis/spec/backend/computer-use-bridge.md`
  - `.trellis/spec/frontend/computer-use-bridge.md`
  - manual test matrix docs
