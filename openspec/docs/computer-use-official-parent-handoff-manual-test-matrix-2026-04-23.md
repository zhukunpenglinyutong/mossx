# Computer Use Official Parent Handoff Discovery 手测矩阵

## 目的

覆盖 `discover-computer-use-official-parent-handoff` 的 Phase 3 人工验证路径。目标是确认官方 `Codex.app` 是否暴露可支持的 Computer Use handoff 入口；不是启用 Computer Use runtime。

## 本机只读调查证据

- `Codex.app` bundle id：`com.openai.codex`
- `Codex.app` URL scheme：`codex`
- `Codex Computer Use.app` bundle id：`com.openai.sky.CUAService`
- `SkyComputerUseClient.app` bundle id：`com.openai.sky.CUAService.cli`
- official team identifier：`2DC432GLL2`
- application group：`2DC432GLL2.com.openai.sky.CUAService`
- parent requirement file：`SkyComputerUseClient_Parent.coderequirement`
- `.mcp.json` 仍指向 nested helper binary：`SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient`
- 未发现 Computer Use-specific URL scheme。
- 未发现可直接作为公开 handoff API 的 XPC/service declaration。

当前结论：metadata 更支持 `requires_official_parent`，不是 `handoff_candidate_found`。

## 自动化前置覆盖

- Rust targeted tests 覆盖：
  - plist string / array extraction
  - parent requirement + application group 读取
  - no public method 时分类为 `requires_official_parent`
  - candidate method 优先分类为 `handoff_candidate_found`
  - host-contract result 中嵌套 official parent handoff payload 的 serde contract
- Frontend targeted tests 覆盖：
  - host-contract diagnostics 结果展示 official parent handoff discovery 区块
  - parent team、application group、service/helper bundle id 可见
  - service wrapper command name 保持不变

## macOS 手测用例

### Case 1: 点击宿主契约调查后展示 official parent evidence

- 前置：
  - 官方 `Codex.app` 已安装
  - `computer-use@openai-bundled` 已启用
  - activation probe 已返回 `host_incompatible`
- 步骤：
  1. 打开 Settings -> Codex -> Computer Use Bridge。
  2. 点击 `调查宿主契约`。
  3. 查看 `Official parent handoff discovery` 区块。
- 预期：
  - 不出现 `SkyComputerUseClient` crash report。
  - 展示 parent team identifier：`2DC432GLL2`。
  - 展示 application group：`2DC432GLL2.com.openai.sky.CUAService`。
  - 展示 service/helper bundle id。
  - discovery 分类为 `metadata 指向官方 parent/team contract` 或等价 `requires_official_parent`。

### Case 2: 未发现公开 handoff 时保持 diagnostics-only

- 步骤：
  1. 在 Case 1 的结果中检查 URL scheme、XPC services、candidate methods。
- 预期：
  - `codex` URL scheme 可作为普通 Codex scheme 展示，但不得被解释为 Computer Use runtime handoff。
  - candidate handoff methods 为空或仅包含低置信 evidence。
  - UI 不显示 ready。
  - 不注册 conversation tool / MCP relay / background automation。

### Case 3: 普通流程不触发 handoff discovery

- 步骤：
  1. 不点击 `调查宿主契约`，只刷新状态。
  2. 执行普通 settings save、chat send、MCP 管理。
- 预期：
  - 不触发 official parent handoff discovery。
  - 不读取或尝试 candidate handoff。
  - 不出现 helper direct exec 或系统 crash report。

### Case 4: Windows / 非 macOS

- 预期：
  - 不展示 handoff discovery CTA。
  - 不提示运行 macOS bundle path、`open -a Codex` 或 shell command。
  - 继续 explicit unsupported。

## 停止条件

如果本机只读 metadata 只显示 parent team / application group / direct helper descriptor，而没有公开 handoff endpoint，则 Computer Use bridge 不进入 runtime integration。后续只保留 diagnostics-only 结论，等待官方 API 或新的官方 handoff contract。

## 回滚路径

- 关闭 Computer Use activation / host-contract flag。
- 保留 Phase 2.5 `requires_official_parent` 诊断。
- 不影响 Codex、MCP、chat、settings save。
