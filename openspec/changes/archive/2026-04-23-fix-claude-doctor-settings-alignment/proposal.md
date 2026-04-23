## Why

上游 [PR #402](https://github.com/zhukunpenglinyutong/desktop-cc-gui/pull/402) 试图修复一个明确的 cross-layer 缺口：`Claude doctor` 尚未打通到 settings，且 app 与 daemon 的 Claude CLI 探测语义不一致。  
当前分支已经在 Rust 侧落下了部分 groundwork，例如 `claude_bin` 已存在于 `AppSettings` 并参与引擎选择与安装探测；但 settings UI、Tauri command、frontend bridge、daemon PATH bootstrap 与 Claude fallback 探测仍未对齐。  
因此，这个问题在当前分支上不适合直接整包合并上游 PR，而应以“保留当前分支结构、重写等价能力”的方式补齐契约。

## 代码核对状态（2026-04-22）

- `Claude doctor` 主链已经落地：`src-tauri/src/codex/mod.rs` 暴露了独立的 `claude_doctor` command，本地模式走 `run_claude_doctor_with_settings`，remote mode 走 `remote_claude_doctor_request(...)` + `call_remote(...)`，不再复用 `codex_doctor` 隐式分支。
- settings 侧接线已经落地：`src/features/settings/hooks/useAppSettings.ts` 提供 `claudeDoctor` facade，`SettingsView.tsx` 已有 `handleRunClaudeDoctor`、Claude path draft 与独立按钮，`SettingsView.test.tsx` 也覆盖了切到 `Claude Code` tab 后运行 doctor 的行为。
- `CLI 验证` 语义已经进入用户可见层：i18n 中已存在 `CLI 验证`、`Codex / Claude Code` tabs、shared execution backend 文案，说明左侧入口与面板组织方式已不再是 Codex-only 语义。
- app/daemon reachability 对齐已部分可证：`src-tauri/src/backend/app_server_cli.rs` 现在会在 Codex 失败后 fallback 探测 Claude CLI；`src-tauri/src/engine/commands_tests.rs` 也覆盖了 remote `claude_doctor` 请求参数归一化。
- 当前 change 仍未到归档条件：`tasks.md` 中基础质量门禁、手动验证矩阵与 apply-ready 收尾项还未全部勾完。严格 `openspec validate --strict` 已通过，但 proposal 状态更接近“主链实现已落地，验证收口待完成”。

## 目标与边界

- 目标：
  - 在当前分支现有 settings/runtime 结构上，将当前 `Codex` 设置入口调整为更通用的 `CLI 验证` 入口，并在其中补齐 Claude CLI 默认路径配置与 `Claude doctor` 诊断入口。
  - 对齐 app 与 daemon 的 Claude CLI 探测语义，避免 GUI/daemon 对同一环境给出不同结论。
  - 为 Claude doctor 提供可用于定位问题的诊断字段，并与当前分支已有的 Codex doctor 体验保持同等级别的可见性。
  - 将 CLI 验证面板明确组织为 `Codex / Claude Code` tab 切换，而不是继续以单一 `Codex` 面板承载多引擎信息。
  - 将当前放在 `Codex` tab 内的 `backendMode / remoteBackendHost / remoteBackendToken` 收口为 shared execution backend 配置，避免它继续看起来像 Codex-only runtime。
  - 让 remote backend 下的 Claude / engine 关键命令具备与 Codex 同等级别的 forwarding parity，而不是只补 local doctor surface。
  - 为本次修复建立可追溯的 OpenSpec 契约，支撑后续 design、tasks 与 focused regression tests。
- 边界：
  - 仅覆盖桌面应用内的 Claude CLI settings / doctor / detection parity。
  - 覆盖 `CLI 验证` 页面的 shared execution backend surface，以及 `engine/*` / doctor command 在 remote backend 下的 forwarding parity。
  - 仅面向当前分支的实现结构，不要求与上游 PR 的文件拆分或组件 wiring 一一对应。
  - 不改变 Claude 会话协议、消息收发 schema、shared session dispatch 或历史会话模型。

## 非目标

- 不直接 merge / cherry-pick 上游 PR #402 的整包实现。
- 不重构整个 settings 架构，也不顺手把所有引擎统一改造成通用 doctor center。
- 不引入新的 Claude auth/provider 配置体系。
- 不修改 Tauri storage schema 的兼容策略；已有无 `claudeBin` 的旧设置必须继续可读。
- 不把 desktop app 的整个 `AppSettings` 在 remote mode 下自动同步到 daemon；remote transport 配置与 remote daemon 自身 settings 仍是不同边界。
- 不在本次 change 中重做 composer/access mode 体系；`defaultAccessMode` 的历史债务不作为本次执行 parity 的阻塞项。

## What Changes

- 为当前分支新增一条 Claude settings doctor 能力，要求 settings 中能够：
  - 在左侧导航中以 `CLI 验证` 文案暴露入口；
  - 在面板内通过 `Codex / Claude Code` tabs 切换不同 CLI 的诊断配置；
  - 在 `Claude Code` tab 中展示和保存默认 `Claude CLI` 路径；
  - 触发 `Claude doctor`；
  - 展示诊断结果与关键 debug metadata。
- 要求 backend 暴露独立的 `claude_doctor` command，并通过现有 frontend bridge / controller / settings 结构完成 wiring，而不是复用 Codex 专属入口。
- 要求 app 与 daemon 对 `PATH` 注入和 CLI 解析使用一致的 shell 环境恢复语义，避免桌面启动与 daemon 模式对 Claude reachability 判断分叉。
- 要求 Claude CLI 探测在 `--version` 失败但 `--help` 可用时执行兼容 fallback，避免错误报告为“未安装”。
- 要求 `backendMode` 与 `remoteBackend*` 在 `CLI 验证` 中以 shared execution backend 语义出现，而不是继续留在 `Codex` tab 内造成“只影响 Codex”的错觉。
- 要求 remote backend 下的 engine / doctor 关键命令对 Claude 具备 forwarding parity，包括消息发送、打断、会话历史的 fork/delete、Gemini 删除链路与 doctor 诊断，而不是仅在本地桌面链路有效。
- 要求 frontend doctor bridge 与 backend doctor helper 拆分为可复用的 shared module，保证 Codex / Claude 共用结构化 diagnostics payload，但不混淆独立 command 边界。
- 增加 focused regression tests，覆盖 settings wiring、doctor 结果展示、fallback 探测、remote request 参数归一化与 app/daemon 诊断一致性。

## 方案对比（至少 2 个）

### 方案 A：直接采纳并合并上游 PR #402

- 优点：
  - 改动方向明确，上游已有参考实现。
  - 可以较快验证问题是否被覆盖。
- 缺点：
  - 当前分支的 settings/runtime 结构已明显偏离上游 `main`，直接合并容易引入 wiring 冲突或覆盖本地演进。
  - 上游 PR 的代码组织并不一定贴合当前分支已有的 hook / controller / settings 结构。
  - 会把“修复 Claude doctor 缺口”和“接受上游具体实现形态”绑定在一起，风险不必要地放大。
- 结论：
  - 不采用。

### 方案 B：沿用上游问题定义，但面向当前分支重写等价实现（采用）

- 优点：
  - 与当前分支已有 groundwork 相容，能够最小化结构冲突。
  - 可以把真正需要的 contract 明确收口为 settings / doctor / detection parity，而不是复制上游具体代码形态。
  - 更便于补齐当前分支已有测试入口与 UI 组织方式。
- 缺点：
  - 需要重新梳理一遍 frontend/backend wiring，前期分析成本高于直接 merge。
- 结论：
  - 采用。该方案更符合当前分支的代码现实，也能把本次修复定义成可维护的 capability，而非一次性搬运补丁。

## Capabilities

### New Capabilities

- `claude-cli-settings-doctor`: 定义 Claude CLI 默认路径配置、settings 内 doctor 触发、诊断结果展示、app/daemon PATH 对齐与 CLI fallback 探测契约。
- `cli-validation-surface`: 定义 settings 导航文案从 `Codex` 收口为 `CLI 验证`，以及面板内部通过 `Codex / Claude Code` tab 承载多 CLI doctor 的交互契约。
- `cli-execution-backend-parity`: 定义 `CLI 验证` 页面的 shared execution backend surface，以及 Claude / engine 相关命令在 remote backend 下的 forwarding parity 与非目标边界。

### Modified Capabilities

- 无。

## Impact

- Affected frontend:
  - `src/types.ts`
  - `src/services/tauri.ts`
  - `src/services/tauri/doctor.ts`
  - `src/features/settings/hooks/useAppSettings.ts`
  - `src/features/app/hooks/useAppSettingsController.ts`
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx`
  - `src/features/settings/components/settings-view/settingsViewConstants.ts`
  - `src/features/settings/components/SettingsView.test.tsx`
  - `src/services/tauri.test.ts`
- Affected backend:
  - `src-tauri/src/backend/app_server_cli.rs`
  - `src-tauri/src/codex/doctor.rs`
  - `src-tauri/src/codex/mod.rs`
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/engine/status.rs`
  - `src-tauri/src/engine/commands.rs`
  - `src-tauri/src/engine/session_history_commands.rs`
  - `src-tauri/src/bin/cc_gui_daemon.rs`
  - `src-tauri/src/bin/cc_gui_daemon/daemon_state.rs`
  - `src-tauri/src/bin/cc_gui_daemon/rpc_params.rs`
- Affected tests:
  - `src/features/settings/hooks/useAppSettings.test.ts`
  - `src/features/settings/components/SettingsView.test.tsx`
  - `src/services/tauri.test.ts`
  - `src-tauri/src/backend/app_server_cli.rs` targeted tests
  - `src-tauri/src/codex/doctor.rs` targeted tests
  - `src-tauri/src/engine/commands_tests.rs`
- Compatibility:
  - `claudeBin` 已在 Rust `AppSettings` 中存在，本次主要是补齐 frontend contract 与 doctor wiring。
  - `backendMode / remoteBackend*` 继续保留在 desktop app settings 中；本次只是明确其 shared execution backend 语义，并补齐 remote forwarding。
  - 不预期引入破坏性数据迁移或 session/runtime payload schema 变更。

## 验收标准

- 在 settings 中，用户 MUST 能从左侧 `CLI 验证` 入口进入面板，并通过 `Claude Code` tab 配置默认 `Claude CLI` 路径、显式触发 `Run Claude Doctor`。
- `Codex` 与 `Claude Code` 的 CLI doctor surface MUST 通过同一面板内的 tabs 切换承载，而不是在左侧导航中拆成多个独立 CLI 页面。
- `Claude doctor` MUST 通过独立的 Tauri command 返回诊断结果，而不是走 `codex_doctor` 的隐式分支或前端拼装。
- 对同一 `claudeBin` 配置，app 与 daemon 模式 MUST 使用一致的 `PATH` 恢复与 reachability 语义，不得出现一边可用、一边误判缺失的分叉。
- `backendMode / remoteBackendHost / remoteBackendToken` MUST 在 `CLI 验证` 中以 shared execution backend 区块出现，而不是只在 `Codex` tab 内展示。
- 当 `backendMode = remote` 时，Claude / engine 关键命令 MUST 能通过 remote backend 执行，不得停留在“Codex 可远程、Claude 仍本地”的半对齐状态。
- 当 `backendMode = remote` 时，Claude / Gemini session history 的 fork/delete 关键操作 MUST 与 doctor 一样走 daemon，而不是残留本地特例。
- desktop app 修改 `remoteBackendHost / remoteBackendToken` MUST 仍只影响 transport 连接本身；系统 MUST NOT 隐式宣称这会同步修改 remote daemon 的 CLI path/settings。
- 当 `claude --version` 失败但 `claude --help` 成功时，系统 MUST NOT 将 Claude CLI 误报为未安装。
- settings 中展示的 Claude doctor 结果 MUST 包含足够的调试证据，例如 resolved binary path、wrapper kind、PATH / pathEnvUsed 等关键字段或同等信息。
- doctor/debug helper MUST 避免把显式配置的 `codexBin` 误用到 Claude 检测，或把 `claudeBin` 误用到 Codex 检测。
- 现有 Codex doctor 行为 MUST 保持不变，不得因为本次修复回退已有诊断字段或交互入口；其交互入口允许从左侧 `Codex` 改为 `CLI 验证` 面板内的 `Codex` tab。
- 旧设置文件在没有 `claudeBin` 字段时 MUST 仍可正常加载；新增字段保存后 MUST 能被后续启动稳定回读。
