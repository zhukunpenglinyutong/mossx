# Computer Use Activation Bridge 手测矩阵

## 目的

补齐 `add-codex-computer-use-activation-bridge` 的第二阶段人工验证证据，并补一轮 `C.2` 非主流程污染盘点。

本轮重点不是证明“已经完整可用”，而是确认：

- `macOS` 的 Phase 2 surface 已经进入“显式 verify / activate”阶段
- 当前 screenshot 对应的宿主状态被正确表达为 `eligible but blocked`
- activation probe 仍然只存在于显式 CTA 链路中，没有污染 settings save / chat / MCP 等普通主流程

## 已有自动化覆盖

- `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture`
- `npx vitest run src/features/computer-use/components/ComputerUseStatusCard.test.tsx src/services/tauri.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `cargo test --manifest-path src-tauri/Cargo.toml`

上述门禁已经全部通过，因此本文件只补“当前 UI 真值 + 调用面盘点”的人工证据。

## 人工验证记录

### macOS Phase 2 当前状态页

- 日期：2026-04-23
- 证据来源：用户补充 screenshot
- 结果：通过
- 证据类型：`blocked / eligible before verify click`

观察到的 UI 真值：

- 页面标题为 `Computer Use Bridge`
- 页面文案已经升级到 Phase 2 语义：显式、有界的 helper bridge 验证
- surface 顶部同时出现：
  - `验证 helper bridge`
  - `刷新状态`
- `status`: `被阻塞`
- `platform`: `macos`
- `codexAppDetected`: `是`
- `pluginDetected`: `是`
- `pluginEnabled`: `是`
- blocked reasons:
  - `当前宿主尚未验证是否能安全桥接官方 helper。`
  - `必需的系统权限尚未验证。`
  - `始终允许的应用审批尚未验证。`
- guidance:
  - `请确认当前宿主能安全桥接官方 helper。`
  - `请授予或确认 Screen Recording 与 Accessibility 权限。`
  - `请检查 Codex Computer Use 设置中的始终允许应用列表。`
- 页面底部存在 Phase 2 边界提示：
  - 本阶段只验证 helper bridge
  - 不自动确认权限或 approval 阻塞

结论：

- 当前 screenshot 对应的不是 Phase 1 只读态，而是 **Phase 2 可执行前的 eligible blocked state**
- CTA 只在 `macOS + helper_bridge_unverified + app/plugin/helper 前置条件齐全` 时出现，符合 spec
- 页面没有误报 `ready`
- 页面没有把 `permission_required` / `approval_required` 误写成“已验证”

### macOS 点击 `验证 helper bridge` 后的 failure 分支

- 日期：2026-04-23
- 证据来源：用户补充 screenshot
- 结果：通过
- 证据类型：`post-click failure`

观察到的 UI / 系统真值：

- 点击 `验证 helper bridge` 后，系统弹出 `SkyComputerUseClient` 问题报告窗口
- crash report 关键信息显示：
  - process: `SkyComputerUseClient`
  - parent process: `cc-gui`
  - helper path 指向官方 Codex app 内置 `SkyComputerUseClient`
- Computer Use surface 同时渲染了 activation result：
  - `Probe 结果`: `Probe 失败`
  - `失败分类`: `Helper probe 以非零状态退出。`
  - `Probe 诊断`: `Computer Use helper probe exited with non-zero status -1.`
  - `Probe 耗时`: `1ms` / `4ms`
- failure 发生后，surface 仍保持原有 blocked reasons：
  - `helper_bridge_unverified`
  - `permission_required`
  - `approval_required`

结论：

- 当前实现已经正确覆盖 **macOS Phase 2 的 failure 分支**
- verify CTA 的确会触发 helper launch，而不是假按钮或假结果
- 在这台 `macOS 26.3.1` 机器上，当前 helper probe 没有进入 verified，而是立即异常退出
- UI 已经把该异常退出收敛成结构化 activation result，没有把失败误报成 `ready`
- 这条证据已经满足 `D.4` 中“`macOS success/blocked/failure 至少覆盖一条`”的 `failure` 分支要求

### macOS failure 根因与后续修正

- 日期：2026-04-23
- 证据来源：本机 crash report / helper descriptor / code signing diagnostics
- 结果：通过

根因线索：

- 官方 helper descriptor `.mcp.json` 指向：
  - command: `./Codex Computer Use.app/.../SkyComputerUseClient`
  - args: `["mcp"]`
  - cwd: `.`
- 原 probe 使用的是 `SkyComputerUseClient --help`，没有带 descriptor 中的 `mcp` 子命令。
- 但 crash report 的关键异常是：
  - `SIGKILL (Code Signature Invalid)`
  - parent process: `cc-gui`
- `codesign` / `spctl` 对官方 `Codex.app` 与内置 `Codex Computer Use.app` 的验证通过。

判断：

- 这不是普通“helper 文件损坏”。
- 更像是官方 nested app-bundle helper 对父进程 / launch contract 有约束，第三方宿主直接 exec 会被 macOS code-signing/runtime policy 杀掉。
- 因此，继续把 `--help` 改成 `mcp --help` 仍有较大概率在同一层被杀，且会继续弹系统 crash report。

修正：

- backend 继续解析 `.mcp.json` 的 command、cwd 与 args。
- 但当 helper 是嵌套 `.app/Contents/MacOS/...` 路径，且当前宿主不是官方 `Codex.app` 时，改为 diagnostics-only fallback。
- 该分支返回结构化：
  - `outcome`: `failed`
  - `failureKind`: `host_incompatible`
  - diagnostic: 官方 helper 不能从当前第三方宿主直接执行
- 修正后不再直接 exec 该 nested helper，避免再次触发系统 crash report。

### macOS 修正后的 diagnostics-only fallback

- 日期：2026-04-23
- 证据来源：用户补充 screenshot
- 结果：通过
- 证据类型：`post-fix failure without crash`

观察到的 UI 真值：

- 点击 `验证 helper bridge` 后，没有再出现 `SkyComputerUseClient` 系统 crash report
- Computer Use surface 渲染结构化 activation result：
  - `Probe 结果`: `Probe 失败`
  - `Probe 耗时`: `0ms`
  - `失败分类`: `官方 helper 不能从当前宿主直接执行。`
  - `Probe 诊断`: `Computer Use helper is packaged as a nested app-bundle CLI. This host now uses diagnostics-only fallback instead of direct exec because macOS can reject that launch path outside the official Codex parent contract.`
  - `Helper stderr`: `Skipped direct helper launch for ... SkyComputerUseClient mcp`
- blocked reasons 继续保留：
  - `helper_bridge_unverified`
  - `permission_required`
  - `approval_required`

结论：

- 修正后的 macOS Phase 2 已经从“真实 crash failure”收敛为“安全的 diagnostics-only failure”
- `host_incompatible` 分支符合当前第三方宿主边界
- UI 没有误报 `ready`
- 用户可以继续看到后续权限/approval guidance，但不会再被系统 crash report 打断

## Kill switch 回退证据

- 日期：2026-04-23
- 证据来源：自动化测试 / contract 审计
- 结果：通过
- Windows：本轮按用户要求暂不处理

当前回退 contract：

- backend status 增加 `activationEnabled`
- backend kill switch 支持 `MOSSX_DISABLE_COMPUTER_USE_ACTIVATION=1|true|yes|on`
- kill switch 关闭时：
  - `run_computer_use_activation_probe` 返回 `activation_disabled`
  - `get_computer_use_bridge_status` 仍保留 Phase 1 discovery/status surface
  - frontend 依据 `activationEnabled=false` 隐藏 `验证 helper bridge`
  - bottom notice 回退到 `phaseOneNotice`

验证覆盖：

- Rust:
  - `activation_probe_requires_enabled_kill_switch`
  - `activation_disabled_env_accepts_common_truthy_values`
- Vitest:
  - `falls back to status-only surface when activation is disabled`

结论：

- 关闭 activation gate 后，用户仍能看到只读状态诊断
- activation CTA 不再暴露
- 这满足当前 macOS scope 下的 Phase 1 status-only 回退要求

## 非主流程污染盘点（C.2）

### 调用面审计

静态搜索结果表明，activation probe 目前只存在一条显式调用链：

1. backend command 定义与注册
   - `src-tauri/src/computer_use/mod.rs`
   - `src-tauri/src/command_registry.rs`
2. frontend service facade
   - `src/services/tauri/computerUse.ts`
   - `src/services/tauri.ts`
3. UI hook
   - `src/features/computer-use/hooks/useComputerUseActivation.ts`
4. UI surface
   - `src/features/computer-use/components/ComputerUseStatusCard.tsx`
   - `src/features/settings/components/settings-view/sections/CodexSection.tsx`

本轮 `rg` 结果没有发现以下路径直接或间接引用 `run_computer_use_activation_probe`：

- chat send / thread messaging
- MCP 管理
- 普通 settings save
- workspace / project / session 管理

### 结论

- activation probe 仍然是 **Codex Settings 内 Computer Use surface 上的显式 CTA**
- 普通设置保存、聊天发送、MCP 管理不会无意触发 helper probe
- 当前 `C.2` 可视为完成，但这是基于“显式调用链盘点 + 全量自动化门禁通过”的结论，不是实机全路径 monkey test

## 当前剩余缺口

`D.4` 当前 macOS + rollback scope 已完成。剩余缺口如下：

1. `Windows` Phase 2 screenshot 或等价人工证据已按用户要求暂不处理  
   需要明确证明在 Phase 2 代码落地后，`Windows` surface 仍无 activation affordance。

## 当前结论

- `macOS` 的 Phase 2 status page 已经正确进入“可执行但仍 blocked”的新阶段
- `macOS` 的 Phase 2 failure result 也已经拿到实机证据
- 直接 exec nested helper 的 crash 根因已经收敛，并改为 diagnostics-only fallback
- 修正后的 diagnostics-only fallback 已经拿到截图证据，macOS 不再弹系统 crash report
- kill switch 回退 contract 已补齐并通过自动化验证
- 当前 screenshot 已足够关闭“Phase 2 eligible blocked render 是否正确”这个问题
- 当前 post-click screenshot 已足够关闭“Phase 2 failure result 是否真实落地”这个问题
- `C.2` 非主流程污染盘点已经完成
- `D.4` 在当前“Windows 暂不考虑”的 scope 下可视为完成
