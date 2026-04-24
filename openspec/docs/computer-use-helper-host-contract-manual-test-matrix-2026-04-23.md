# Computer Use Host Contract Diagnostics 手测矩阵

## 目的

覆盖 `investigate-computer-use-helper-host-contract` 的 Phase 2.5 人工验证路径。目标不是证明 Computer Use runtime 已可用于会话，而是确认 `host_incompatible` 后的宿主契约调查只做显式、只读、有界的 evidence collection。

## 自动化前置覆盖

- Rust targeted tests 覆盖：
  - host-contract kind 序列化为 snake_case
  - nested helper + 第三方宿主分类为 `requires_official_parent`
  - 官方 parent path 证据分类为 `handoff_verified`
  - permission / approval 剩余阻塞分类为 `manual_permission_required`
  - Windows / unsupported host 保持 non-executable
- Frontend targeted tests 覆盖：
  - `host_incompatible` 后才展示 host-contract diagnostics CTA
  - diagnostics CTA 不自动链式运行
  - diagnostics result 只作为 diagnostic-only evidence 渲染
  - duplicate diagnostics click guard
  - status refresh 清理 stale activation / diagnostics result

## macOS 手测用例

### Case 1: 当前第三方宿主 `host_incompatible` 后出现 diagnostics CTA

- 平台：macOS
- 前置：
  - 官方 `Codex.app` 已安装
  - `computer-use@openai-bundled` 已检测到且启用
  - helper path 指向官方 nested `SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient`
- 步骤：
  1. 打开 Settings -> Codex -> Computer Use Bridge。
  2. 点击 `验证 helper bridge`。
  3. 等待 activation result 返回 `host_incompatible`。
- 预期：
  - 不出现系统 `SkyComputerUseClient` crash report。
  - `验证 helper bridge` CTA 被隐藏或不再作为下一步主 CTA。
  - 出现 `调查宿主契约` / `Investigate host contract` CTA。
  - status 仍为 `blocked`，不得误报 `ready`。

### Case 2: 点击 host-contract diagnostics 后只读采证

- 步骤：
  1. 在 Case 1 后点击 `调查宿主契约`。
  2. 等待 diagnostics result 渲染。
- 预期：
  - 不出现系统 crash report。
  - result title 为 `Host-contract diagnostics`。
  - 页面显示 diagnostic-only notice，明确不会启用会话 runtime。
  - classification 为以下之一：
    - `requires_official_parent`
    - `handoff_unavailable`
    - `handoff_verified`
    - `manual_permission_required`
    - `unknown`
  - 当前第三方宿主预期优先收敛为 `requires_official_parent`。
  - evidence 至少展示：
    - helper path
    - helper descriptor path
    - current host path
    - handoff method
    - `codesign` summary 或 unavailable/skipped 说明
    - `spctl` summary 或 unavailable/skipped 说明
    - duration
    - bounded stdout / stderr snippet（如存在）

### Case 3: diagnostics 不污染普通流程

- 步骤：
  1. 不点击 `调查宿主契约`，只执行 `刷新状态`。
  2. 执行普通 settings save。
  3. 执行一次普通 chat send。
  4. 打开 MCP 管理相关入口。
- 预期：
  - 这些动作不会调用 `run_computer_use_host_contract_diagnostics`。
  - 不出现 helper handoff、helper direct exec 或系统 crash report。
  - 已有 Codex、MCP、settings、chat 主流程不受影响。

### Case 4: kill switch 回退

- 前置：
  - 设置 `MOSSX_DISABLE_COMPUTER_USE_ACTIVATION=1` 后启动应用。
- 步骤：
  1. 打开 Computer Use Bridge。
  2. 观察 CTA 与 notice。
- 预期：
  - 不展示 `验证 helper bridge`。
  - 不展示 `调查宿主契约`。
  - surface 回退为 Phase 2 diagnostics-only / status-only 表达。
  - status discovery 仍可展示官方安装态，不影响其他功能。

## Windows / 非 macOS

本 change 仍不处理 Windows runtime 支持。验证要求是保持 explicit unsupported：

- 不展示 activation CTA。
- 不展示 host-contract diagnostics CTA。
- 不提示用户运行 macOS helper 或 shell command。
- 不执行任何 macOS helper discovery / activation / diagnostics path。

## 回滚路径

- 关闭 activation / host-contract flag。
- UI 回退到 Phase 2 diagnostics-only surface。
- 后端 command 即使被误调用，也返回 disabled / unknown diagnostics，不执行 helper。
