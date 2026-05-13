## Context

`CLI 验证` 已经收敛出一套相对完整的 diagnostics surface：Codex / Claude Code doctor 能返回 `version`、`resolvedBinaryPath`、`wrapperKind`、`PATH`、`Node` 与 debug details；remote mode 下 doctor 也已转发到 daemon。缺口在于 remediation 仍停留在文字提示，导致用户在 `not_found` 场景里必须离开客户端自行查命令。

安装最新版是高风险外部命令能力，必须从一开始就做边界建模。它不能复用 terminal raw command，也不能由前端拼 shell；否则会把 settings UI 变成隐式 shell runner，并破坏 local / remote backend 的一致性。

## Goals / Non-Goals

**Goals**

- 把 Codex / Claude Code 的安装和更新建模为受控 backend capability。
- 与现有 doctor 共享环境判断、remote backend 语义和结果刷新。
- macOS / Windows 都有明确执行策略和失败降级。
- WSL、remote daemon、权限不足、Node/npm 缺失等边界可解释。
- Phase 1 不引入额外 package manager 依赖和持久化 schema 扩散。
- Phase 1 的更新动作统一使用 npm `@latest` 安装路径；CLI self-update 仅作为 future strategy 保留，不作为首版可执行策略。

**Non-Goals**

- 不做通用 shell executor。
- 不自动安装 Node/npm。
- 不自动提权。
- 不自动修改 PATH / shell profile。
- 不支持 Gemini / OpenCode 安装。
- 不处理 CLI 登录态 / API key / auth bootstrap。

## Decisions

### Decision 1: Installer command 采用 plan -> confirm -> run 两段式

**Decision**

新增 backend install plan 生成能力和 run installer 能力。前端点击 “安装最新版 / 更新最新版” 后，先请求 install plan，再展示确认 modal；只有用户确认后才调用 run。

**Why**

安装是外部供应链操作，必须让用户看到将执行什么、在哪个 backend 执行、是否会影响全局 npm prefix。直接点击即执行会模糊责任边界。

**Implementation shape**

- `get_cli_install_plan(engine, action)` 返回：
  - `engine`
  - `action`
  - `strategy`
  - `backendMode`
  - `targetPlatform`
  - `commandPreview`
  - `preflightStatus`
  - `warnings`
  - `manualFallback`
- `run_cli_installer(engine, action, strategy)` 只接受 plan 中允许的 enum。
- Phase 1 的 runnable plan MUST only use `npmGlobal`; `cliSelfUpdate` MAY remain in the type model as future/unsupported but MUST NOT be returned as executable.

### Decision 2: 后端白名单命令，不接受 raw command

**Decision**

frontend 不得传完整命令字符串。backend 根据 engine/action/strategy/platform 自己构造 argv。

**Why**

这是防止命令注入、跨平台 quoting 漂移和 remote/local 错位的核心边界。

**Allowed Phase 1 commands**

- Codex install latest: `npm install -g @openai/codex@latest`
- Codex update latest: `npm install -g @openai/codex@latest`
- Claude Code install latest: `npm install -g @anthropic-ai/claude-code@latest`
- Claude Code update latest: `npm install -g @anthropic-ai/claude-code@latest`

这些命令必须以 argv 形式传给 process builder；Windows 下解析为 `npm.cmd` / `claude.cmd` / `codex.cmd` 时复用现有 wrapper detection / command builder 习惯，不走 Unix shell。

`cliSelfUpdate`（例如 `codex --upgrade` 或 `claude update`）不进入 Phase 1 runnable command matrix。原因是 CLI 自更新能力在不同安装渠道和版本中的可用性更容易漂移；首版用 npm `@latest` 保持安装与更新同源。

### Decision 3: preflight 只检查必要执行条件，不替用户修系统

**Decision**

installer preflight 只检查：

- Node 是否可用。
- npm 是否可用。
- npm global prefix 是否可写或能解释失败。
- 目标 engine 是否已有 binary，用于判断 install vs update 策略。
- 当前 backend 是 local 还是 remote。

如果 Node/npm 缺失、prefix 不可写、权限不足，系统返回 structured blocker 和手动建议，不自动安装 Node/npm 或提权。

**Why**

Node/npm 管理牵涉 nvm/fnm/volta/asdf/Homebrew/winget/企业环境策略，纳入 Phase 1 会导致边界失控。

### Decision 4: remote mode 必须在 daemon 环境执行

**Decision**

当 `backendMode = remote` 时，desktop app 的 installer command 必须通过 remote backend RPC 转发到 daemon。install plan 和 run result 均反映 daemon 环境，而不是 desktop app 本机环境。

**Why**

现有 spec 已要求 doctor 诊断 remote daemon 环境。installer 如果在本机执行，会造成最危险的错觉：UI 显示修复了 remote runtime，但实际只改了 desktop 机器。

**Implementation shape**

- 新增 remote RPC method，例如 `cli_install_plan` / `cli_install_run`。
- explicit bin/path 只在 doctor 中作为探测输入；installer Phase 1 不根据用户任意 bin path 反向推导安装目录。
- remote result 必须标记 `executionBackend: remote` 与 daemon host 摘要。

### Decision 5: Windows / macOS 分支只在 process resolution 层分叉

**Decision**

业务策略保持一致，平台差异只在 process builder / binary resolution 层处理。

**macOS / Linux-like local**

- 使用 `npm` argv 执行。
- 复用 GUI 恢复后的 PATH 语义。
- 不写 shell profile。

**Windows native**

- 使用 `npm.cmd` / `codex.cmd` / `claude.cmd` wrapper resolution。
- 不依赖 `/bin/sh`、bash、zsh。
- 不默认打开 console window，除非已有底层 command helper 需要 fallback。

**WSL**

- 如果 desktop app 在 Windows native 模式下，但 CLI path 指向 WSL 或 workspace 是 WSL UNC，Phase 1 不跨边界安装。
- 用户可以选择 remote daemon 跑在 WSL/Linux 内，此时 installer 在 daemon 环境执行。
- 否则展示手动命令。

**Why**

跨 WSL 从 Windows desktop 改 Linux 用户环境，会引入路径、权限、shell profile 和 npm prefix 的多重副作用，超出“一键安装 CLI”的安全边界。

### Decision 6: 不自动修改 `codexBin` / `claudeBin`

**Decision**

安装成功后，系统只重新运行 doctor。若新 binary 能通过 PATH 找到，则 UI 保持 PATH 模式。若用户原先设置了显式路径且仍不可用，doctor 继续显示 explicit bin blocker，并提示用户 “使用 PATH” 或重新选择路径。

**Why**

自动覆盖用户显式路径会破坏可解释性。安装与设置持久化是两个不同动作。

### Decision 7: Installer 日志必须脱敏、截断、结构化

**Decision**

installer result 可以展示 stdout/stderr 摘要，但必须：

- 限制最大长度。
- 不展示环境变量全量 dump。
- 对 token / key / auth header 做基础脱敏。
- 保留 exit code、duration、strategy、post-install doctor 结果。

**Why**

npm 输出可能包含路径、registry、代理配置、企业镜像信息。诊断需要足够信息，但不能把敏感环境扩散进 UI 或日志。

## Data Contracts

### Install Plan

```ts
type CliInstallEngine = "codex" | "claude";
type CliInstallAction = "installLatest" | "updateLatest";
type CliInstallStrategy = "npmGlobal" | "cliSelfUpdate";
type CliInstallBackend = "local" | "remote";

type CliInstallPlan = {
  engine: CliInstallEngine;
  action: CliInstallAction;
  strategy: CliInstallStrategy;
  backend: CliInstallBackend;
  platform: "macos" | "windows" | "linux" | "unknown";
  commandPreview: string[];
  canRun: boolean;
  blockers: string[];
  warnings: string[];
  manualFallback?: string | null;
};
```

### Install Result

```ts
type CliInstallResult = {
  ok: boolean;
  engine: CliInstallEngine;
  action: CliInstallAction;
  strategy: CliInstallStrategy;
  backend: CliInstallBackend;
  exitCode?: number | null;
  stdoutSummary?: string | null;
  stderrSummary?: string | null;
  details?: string | null;
  doctorResult?: CodexDoctorResult | null;
};
```

Exact Rust structs may use snake_case internally with serde camelCase at the Tauri boundary.

## Risks / Trade-offs

- [Risk] npm global prefix 不可写导致用户认为客户端安装坏了。  
  Mitigation: preflight 检查 + 明确 blocker，不自动 sudo。

- [Risk] Windows wrapper quoting 与 npm `.cmd` 行为漂移。  
  Mitigation: 使用 argv + 现有 wrapper resolution，不拼接 shell command；增加 Windows helper unit tests。

- [Risk] remote mode 用户误以为安装在本机。  
  Mitigation: plan/result 显示 backend 和 daemon host 摘要；desktop 不执行 remote installer。

- [Risk] CLI 官方安装方式未来变化。  
  Mitigation: 命令集中在 provider strategy 表中，doctor 失败时保留 manual fallback 文案；不把命令散落进 UI。

- [Risk] 过度扩展到包管理生态。  
  Mitigation: Phase 1 仅 npm global `@latest`，其他渠道与 CLI self-update 只作为 future/manual fallback。

## Migration Plan

1. 新增 OpenSpec capability 与 delta specs。
2. 新增 Rust installer plan/result types 和 command whitelist。
3. 接入 local backend run path，并复用 doctor post-check。
4. 接入 remote backend forwarding path。
5. 前端在 Codex / Claude Code tabs 增加 install/update 按钮、confirm modal 与 result card。
6. 添加 focused tests 和 macOS / Windows / remote manual smoke。

Rollback 策略：隐藏前端按钮并注销 installer commands 即可恢复 doctor-only 行为；不涉及持久化 schema 和用户配置迁移。

## Open Questions

- Claude Code 的 `claude update` 是否应在二期作为 `cliSelfUpdate` strategy 开放？
- Codex `codex --upgrade` 是否应在二期作为 `cliSelfUpdate` strategy 开放？
- remote daemon 是否需要单独暴露 installer capability version，避免老 daemon 收到未知 RPC 时只返回泛化错误？
